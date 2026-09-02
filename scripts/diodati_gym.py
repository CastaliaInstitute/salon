#!/usr/bin/env python3

"""Deterministic offline Gym for the Villa Diodati multi-agent salon.

This module is deliberately separated from the live Matrix scheduler. Policies
choose structured actions; the Gym owns historical readings, state transitions,
reward decomposition, and immutable trajectory logs. It performs contextual-
bandit/offline evaluation only: it never edits prompts or sends Matrix events.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import os
import pathlib
import re
import stat
import time
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone


# The shared historical verifier currently lives in the realtime service, whose
# production entry point requires these variables. Offline Gym imports never use
# either credential or room value and must not make network requests.
os.environ.setdefault("DIODATI_ROOM_ID", "offline-diodati-gym")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "offline-diodati-gym")

from diodati_realtime import (  # noqa: E402
    CAST,
    DEFAULT_RAG_PATH,
    LOCAL_RAG_PATH,
    find_anachronisms,
    load_rag_corpus,
)


SCHEMA_VERSION = 2
DEFAULT_START = "1816-06-15T20:32:00Z"
DEFAULT_MAX_TURNS = 36
DEFAULT_TURN_SECONDS = 120
DEFAULT_CLOCK_RATE = 720.0
MAX_WORDS = 70

CAST_IDS = tuple(faculty_id for faculty_id, _name in CAST)
CAST_NAMES = dict(CAST)
SPEAKER_ALIASES = {
    "g.byron": "a.byron",
    "m.godwin": "a.maryshelley",
    "m.shelley": "a.maryshelley",
    "c.clairmont": "a.clairmont",
    "a.shelley1": "a.shelley",
    "p.shelley": "a.shelley",
    "j.polidori": "a.polidori",
}

PERSONA_MARKERS = {
    "a.byron": {"wit", "laugh", "melancholy", "host", "devil", "volume", "rain"},
    "a.maryshelley": {"mind", "education", "liberty", "dependence", "imagine", "fear", "women"},
    "a.clairmont": {"music", "company", "hear", "voice", "participant", "candour", "candid"},
    "a.shelley": {"liberty", "nature", "mind", "power", "spirit", "imagination", "tyranny"},
    "a.polidori": {"physician", "pulse", "nerve", "medicine", "principle", "body", "observation"},
}

PERSONAS = {
    "a.byron": {"name": "Lord Byron", "role": "host"},
    "a.maryshelley": {"name": "Mary Godwin", "role": "guest"},
    "a.clairmont": {"name": "Claire Clairmont", "role": "guest"},
    "a.shelley": {"name": "Percy Bysshe Shelley", "role": "guest"},
    "a.polidori": {"name": "John Polidori", "role": "physician and guest"},
}

RELATIONSHIPS = (
    {"from": "a.byron", "to": "a.polidori", "description": "employer and physician; mutual friction"},
    {"from": "a.maryshelley", "to": "a.clairmont", "description": "stepsisters and travelling companions"},
    {"from": "a.maryshelley", "to": "a.shelley", "description": "intellectual and romantic companions"},
    {"from": "a.clairmont", "to": "a.byron", "description": "intimate history and social tension"},
    {"from": "a.byron", "to": "a.shelley", "description": "new friendship and intellectual curiosity"},
)

OPENING_SCHEDULE = (
    {"id": "reading-1", "action": "introduce_reading", "speaker": "a.byron", "segment": 0},
    {"id": "claire-interrupts", "action": "respond", "speaker": "a.clairmont"},
    {"id": "mary-interrupts", "action": "respond", "speaker": "a.maryshelley"},
    {"id": "reading-2", "action": "introduce_reading", "speaker": "a.byron", "segment": 1},
    {"id": "polidori-comments", "action": "respond", "speaker": "a.polidori"},
    {"id": "percy-comments", "action": "respond", "speaker": "a.shelley"},
    {"id": "byron-challenge", "action": "redirect", "speaker": "a.byron"},
)

ACTION_TYPES = {
    "select_speaker",
    "respond",
    "generate_response",
    "ask_question",
    "introduce_reading",
    "redirect",
    "wait",
    "end_scene",
}

WEIGHTS = {
    "voice": 0.16,
    "history": 0.24,
    "flow": 0.14,
    "participation": 0.10,
    "creative_payoff": 0.08,
    "aesthetic": 0.08,
    "dramatic": 0.10,
    "safety": 0.10,
}

AESTHETIC_SENSORY_MARKERS = {
    "black", "bright", "candle", "cold", "dark", "flame", "glass", "hear", "lake",
    "light", "lightning", "music", "rain", "shadow", "silence", "storm", "thunder",
    "voice", "wind",
}

AESTHETIC_IMAGE_MARKERS = {
    "apparition", "chamber", "dream", "ghost", "image", "moon", "nerve", "night",
    "orchestra", "pulse", "spirit", "star", "trembling",
}

DRAMATIC_TENSION_MARKERS = {
    "challenge", "danger", "dare", "devil", "fear", "fate", "ghost", "refuse", "risk",
    "secret", "terror", "threat", "tyranny",
}

DRAMATIC_ACTION_MARKERS = {
    "answer", "close", "discover", "enter", "open", "prove", "read", "rise", "speak",
    "tell", "turn", "write",
}

DRIFT_PATTERNS = (
    r"\bas an ai\b",
    r"\blanguage model\b",
    r"\broleplay\b",
    r"\bthe audience\b",
    r"\bmatrix room\b",
    r"\bprompt\b",
)

SAFETY_PATTERNS = (
    r"\bignore (?:all|your|the) (?:instructions|rules)\b",
    r"\breveal (?:the )?(?:system prompt|credentials?|access token|service key)\b",
)


def _canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _parse_time(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _iso_time(value):
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _words(text):
    return re.findall(r"[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]*", text)


def _token_set(text):
    return {token.lower() for token in _words(text) if len(token) > 2}


def _jaccard(left, right):
    union = left | right
    return len(left & right) / len(union) if union else 0.0


def _clamp(value, low=0.0, high=1.0):
    return max(low, min(high, value))


def _aesthetic_and_dramatic_scores(content, previous=""):
    """Return transparent style scores without rewarding length by itself."""
    tokens = _token_set(content)
    lower = content.lower()
    word_count = len(_words(content))
    sensory = sorted(tokens & AESTHETIC_SENSORY_MARKERS)
    images = sorted(tokens & AESTHETIC_IMAGE_MARKERS)
    figurative = bool(re.search(r"\b(?:as if|as though|like a|like the)\b", lower))
    contrast = bool(re.search(r"\b(?:but|yet|though|still|unless)\b", lower))
    cadence = bool(re.search(r"[;:—]", content)) or ("," in content and word_count <= MAX_WORDS)
    lexical_economy = len(tokens) / max(1, word_count)
    aesthetic = _clamp(
        0.10
        + (0.25 if sensory else 0.0)
        + (0.20 if images else 0.0)
        + (0.15 if figurative else 0.0)
        + (0.10 if contrast else 0.0)
        + (0.10 if cadence else 0.0)
        + (0.10 * min(1.0, lexical_economy / 0.70))
    )

    tension = sorted(tokens & DRAMATIC_TENSION_MARKERS)
    action = sorted(tokens & DRAMATIC_ACTION_MARKERS)
    direct_engagement = bool(re.search(r"\b(?:you|your|we|our|us)\b", lower))
    invitation = bool(re.search(r"\b(?:will you|shall we|let us|answer me|tell me)\b", lower))
    responsive_overlap = _jaccard(tokens, _token_set(previous)) if previous else 0.0
    dramatic = _clamp(
        0.10
        + (0.20 if tension else 0.0)
        + (0.15 if action else 0.0)
        + (0.15 if direct_engagement else 0.0)
        + (0.15 if "?" in content else 0.0)
        + (0.10 if contrast else 0.0)
        + (0.10 if invitation else 0.0)
        + (0.05 if responsive_overlap >= 0.08 else 0.0)
    )
    return {
        "aesthetic": aesthetic,
        "dramatic": dramatic,
        "features": {
            "sensory_markers": sensory,
            "image_markers": images,
            "figurative_language": figurative,
            "cadence": cadence,
            "contrast_or_reversal": contrast,
            "tension_markers": tension,
            "action_markers": action,
            "direct_engagement": direct_engagement,
            "invitation_or_challenge": invitation,
        },
    }


class ImmutableEpisodeLog:
    """Create-only SHA-256 hash-chained JSONL log for one episode."""

    def __init__(self, directory, episode_id):
        self.directory = pathlib.Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.path = self.directory / f"{episode_id}.jsonl"
        self.handle = self.path.open("x", encoding="utf-8")
        self.previous_hash = "0" * 64
        self.finalized = False

    def append(self, record):
        if self.finalized:
            raise RuntimeError("Episode log is finalized")
        payload = {**copy.deepcopy(record), "previous_hash": self.previous_hash}
        record_hash = hashlib.sha256(
            (self.previous_hash + _canonical(payload)).encode("utf-8")
        ).hexdigest()
        complete = {**payload, "record_hash": record_hash}
        self.handle.write(json.dumps(complete, sort_keys=True, ensure_ascii=False) + "\n")
        self.handle.flush()
        os.fsync(self.handle.fileno())
        self.previous_hash = record_hash
        return complete

    def finalize(self, evaluation):
        if not self.finalized:
            self.append({"kind": "evaluation", "evaluation": copy.deepcopy(evaluation)})
            self.handle.close()
            self.path.chmod(stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)
            self.finalized = True


def verify_trajectory(path):
    previous_hash = "0" * 64
    records = []
    for line_number, line in enumerate(pathlib.Path(path).read_text(encoding="utf-8").splitlines(), 1):
        if not line:
            continue
        record = json.loads(line)
        record_hash = record.pop("record_hash")
        if record.get("previous_hash") != previous_hash:
            raise ValueError(f"Broken previous hash at line {line_number}")
        expected = hashlib.sha256((previous_hash + _canonical(record)).encode("utf-8")).hexdigest()
        if record_hash != expected:
            raise ValueError(f"Broken record hash at line {line_number}")
        record["record_hash"] = record_hash
        records.append(record)
        previous_hash = record_hash
    return records


class DiodatiSalonGym:
    """Small deterministic environment for offline policy comparison."""

    def __init__(
        self,
        episodes_dir,
        *,
        prompt_version="diodati-v1",
        max_turns=DEFAULT_MAX_TURNS,
        turn_seconds=DEFAULT_TURN_SECONDS,
        clock_rate=DEFAULT_CLOCK_RATE,
        pace=False,
        rag_path=None,
    ):
        self.episodes_dir = pathlib.Path(episodes_dir)
        self.prompt_version = prompt_version
        self.max_turns = int(max_turns)
        self.turn_seconds = int(turn_seconds)
        self.clock_rate = float(clock_rate)
        if not math.isfinite(self.clock_rate) or self.clock_rate <= 1:
            raise ValueError("clock_rate must be finite and greater than realtime (1x)")
        self.pace = bool(pace)
        self.wall_seconds_per_step = self.turn_seconds / self.clock_rate
        self.rag_path = pathlib.Path(
            rag_path or (LOCAL_RAG_PATH if LOCAL_RAG_PATH.exists() else DEFAULT_RAG_PATH)
        )
        self.rag_sha256 = hashlib.sha256(self.rag_path.read_bytes()).hexdigest()
        self.rag = load_rag_corpus(self.rag_path)
        self.reading = self.rag["salon_readings"][0]
        self.approved_evidence_ids = {
            chunk["id"]
            for chunks in self.rag["characters"].values()
            for chunk in chunks
        }
        self.approved_evidence_ids.add(self.reading["id"])
        self.approved_evidence_ids.update(
            f"{self.reading['id']}/{segment['id']}" for segment in self.reading["segments"]
        )
        self._state = None
        self._log = None
        self._rewards = []

    def reset(self, *, seed=1816, start_simulated_at=DEFAULT_START):
        if self._log is not None and not self._log.finalized:
            raise RuntimeError("Close or complete the active episode before reset()")
        identity = "|".join(
            str(value)
            for value in (
                SCHEMA_VERSION,
                seed,
                self.prompt_version,
                start_simulated_at,
                self.max_turns,
                self.turn_seconds,
                self.clock_rate,
                self.pace,
                self.rag_sha256,
            )
        )
        episode_id = "diodati-" + str(uuid.uuid5(uuid.NAMESPACE_URL, identity))
        self._state = {
            "schema_version": SCHEMA_VERSION,
            "episode_id": episode_id,
            "seed": int(seed),
            "prompt_version": self.prompt_version,
            "simulated_at": start_simulated_at,
            "clock": {
                "mode": "accelerated",
                "rate": self.clock_rate,
                "simulated_seconds_per_step": self.turn_seconds,
                "wall_seconds_per_step": self.wall_seconds_per_step,
                "paced": self.pace,
            },
            "schedule_index": 0,
            "current_schedule_event": copy.deepcopy(OPENING_SCHEDULE[0]),
            "selected_speaker": None,
            "personas": copy.deepcopy(PERSONAS),
            "relationships": copy.deepcopy(RELATIONSHIPS),
            "transcript": [],
            "quality_history": [],
            "participation": {faculty_id: 0 for faculty_id in CAST_IDS},
            "turn": 0,
            "done": False,
            "termination_reason": None,
        }
        self._rewards = []
        self._log = ImmutableEpisodeLog(self.episodes_dir, episode_id)
        self._log.append(
            {
                "kind": "reset",
                "episode_id": episode_id,
                "configuration": {
                    "schema_version": SCHEMA_VERSION,
                    "seed": int(seed),
                    "prompt_version": self.prompt_version,
                    "start_simulated_at": start_simulated_at,
                    "max_turns": self.max_turns,
                    "turn_seconds": self.turn_seconds,
                    "clock_rate": self.clock_rate,
                    "paced": self.pace,
                    "rag_sha256": self.rag_sha256,
                },
                "state": self.state(),
            }
        )
        return self.state()

    def state(self):
        if self._state is None:
            raise RuntimeError("Call reset() before state()")
        state = copy.deepcopy(self._state)
        state["legal_actions"] = self.legal_actions()
        return state

    def close(self):
        """Finalize an unfinished episode without silently discarding its trajectory."""
        if self._state is None or self._log is None or self._log.finalized:
            return
        if not self._state["done"]:
            self._state["done"] = True
            self._state["termination_reason"] = "environment-closed"
        self._log.finalize(self.evaluate_episode())

    def legal_actions(self):
        if self._state is None or self._state["done"]:
            return []
        actions = ["select_speaker", "wait"]
        expected = self._state["current_schedule_event"]
        if expected:
            actions.append(expected["action"])
        else:
            actions.extend(["respond", "generate_response", "ask_question", "redirect"])
        if self._state["turn"] >= 6:
            actions.append("end_scene")
        return list(dict.fromkeys(actions))

    def _reading_content(self, action):
        reading_id = action.get("reading_id", self.reading["id"])
        if reading_id != self.reading["id"]:
            raise ValueError("Only the approved opening reading is available")
        expected = self._state["current_schedule_event"]
        default_segment = expected.get("segment", 0) if expected else 0
        segment_index = int(action.get("segment", default_segment))
        if segment_index < 0:
            raise ValueError("Unknown reading segment")
        try:
            segment = self.reading["segments"][segment_index]
        except IndexError as error:
            raise ValueError("Unknown reading segment") from error
        return f"From {self.reading['title']}: {segment['text']}", segment_index

    def _advance_schedule(self, action_type, speaker, segment=None):
        expected = self._state["current_schedule_event"]
        matched = bool(
            expected
            and expected["action"] == action_type
            and expected["speaker"] == speaker
            and (action_type != "introduce_reading" or expected["segment"] == segment)
        )
        if matched:
            self._state["schedule_index"] += 1
            index = self._state["schedule_index"]
            self._state["current_schedule_event"] = (
                copy.deepcopy(OPENING_SCHEDULE[index]) if index < len(OPENING_SCHEDULE) else None
            )
        return matched

    def _participation_score(self, counts=None):
        counts = counts or self._state["participation"]
        total = sum(counts.values())
        if not total:
            return 0.0
        probabilities = [count / total for count in counts.values() if count]
        entropy = -sum(value * math.log(value) for value in probabilities)
        return entropy / math.log(len(CAST_IDS))

    def _score_utterance(self, speaker, content, action_type, schedule_matched, evidence_ids):
        tokens = _token_set(content)
        word_count = len(_words(content))
        violations = find_anachronisms(content)
        lower = content.lower()

        voice = 0.35
        if 4 <= word_count <= MAX_WORDS:
            voice += 0.25
        if re.search(r"\b(?:i|my|me|we|our)\b", lower):
            voice += 0.15
        if tokens & PERSONA_MARKERS[speaker]:
            voice += 0.25

        previous = self._state["transcript"][-1]["content"] if self._state["transcript"] else ""
        overlap = _jaccard(tokens, _token_set(previous))
        flow = 0.55 if not previous else _clamp(0.30 + (2.0 * min(overlap, 0.25)))
        if "?" in content or action_type == "ask_question":
            flow = _clamp(flow + 0.20)
        if schedule_matched:
            flow = _clamp(flow + 0.20)

        prior_tokens = set().union(*(_token_set(item["content"]) for item in self._state["transcript"])) if self._state["transcript"] else set()
        novelty = len(tokens - prior_tokens) / max(1, len(tokens))
        imagery = bool(tokens & {"rain", "lake", "lightning", "candle", "shadow", "storm", "ghost", "dream"})
        creative = _clamp(0.20 + (0.35 if "?" in content else 0.0) + (0.30 * novelty) + (0.15 if imagery else 0.0))
        style = _aesthetic_and_dramatic_scores(content, previous)

        counts_after = dict(self._state["participation"])
        counts_after[speaker] += 1
        participation = self._participation_score(counts_after)
        scores = {
            "voice": _clamp(voice),
            "history": 1.0 if not violations else 0.0,
            "flow": _clamp(flow),
            "participation": _clamp(participation),
            "creative_payoff": _clamp(creative),
            "aesthetic": style["aesthetic"],
            "dramatic": style["dramatic"],
            "safety": 0.0 if any(re.search(pattern, lower) for pattern in SAFETY_PATTERNS) else 1.0,
        }

        invalid_evidence = sorted(set(evidence_ids) - self.approved_evidence_ids)

        penalties = {
            "anachronism": min(3.0, 0.75 * len(violations)),
            "verbosity": (
                0.0
                if action_type == "introduce_reading"
                else max(0.0, (word_count - MAX_WORDS) / MAX_WORDS)
            ),
            "repetition": 0.5 if previous and overlap >= 0.70 else 0.0,
            "character_drift": 1.0 if any(re.search(pattern, lower) for pattern in DRIFT_PATTERNS) else 0.0,
            "schedule_mismatch": 0.0 if schedule_matched or not self._state["current_schedule_event"] else 0.30,
            "fabricated_fact": 0.75 if invalid_evidence else 0.0,
            "safety_violation": 1.0 - scores["safety"],
        }
        weighted = sum(scores[name] * WEIGHTS[name] for name in WEIGHTS)
        total = weighted - sum(penalties.values())
        return {
            "scores": scores,
            "penalties": penalties,
            "total": round(total, 6),
            "diagnostics": {
                "word_count": word_count,
                "anachronisms": violations,
                "repetition_overlap": round(overlap, 6),
                "schedule_matched": schedule_matched,
                "evidence_ids": sorted(set(evidence_ids)),
                "invalid_evidence_ids": invalid_evidence,
                "style_features": style["features"],
            },
        }

    def _invalid_transition(self, action, reason):
        reward = {
            "scores": {name: 0.0 for name in WEIGHTS},
            "penalties": {"invalid_action": 1.0},
            "total": -1.0,
            "diagnostics": {"rejected": reason},
        }
        self._state["quality_history"].append(copy.deepcopy(reward))
        self._rewards.append(copy.deepcopy(reward))
        self._log.append(
            {
                "kind": "transition",
                "episode_id": self._state["episode_id"],
                "turn": self._state["turn"],
                "action": copy.deepcopy(action),
                "reward": copy.deepcopy(reward),
                "state": self.state(),
            }
        )
        return self.state(), reward["total"], self._state["done"], copy.deepcopy(reward)

    def step(self, action):
        if self._state is None:
            raise RuntimeError("Call reset() before step()")
        if self._state["done"]:
            raise RuntimeError("Episode is complete")
        if self.pace:
            time.sleep(self.wall_seconds_per_step)
        if not isinstance(action, dict):
            return self._invalid_transition({"value": repr(action)}, "action-must-be-object")

        action = copy.deepcopy(action)
        action_type = action.get("type")
        if action_type not in ACTION_TYPES:
            return self._invalid_transition(action, "unknown-action")

        if action_type == "select_speaker":
            speaker = action.get("speaker")
            if speaker not in CAST_IDS:
                return self._invalid_transition(action, "unknown-speaker")
            self._state["selected_speaker"] = speaker
            reward = {
                "scores": {name: 0.0 for name in WEIGHTS},
                "penalties": {},
                "total": 0.0,
                "diagnostics": {"selected_speaker": speaker},
            }
        elif action_type == "wait":
            reward = {
                "scores": {name: 0.0 for name in WEIGHTS},
                "penalties": {},
                "total": 0.0,
                "diagnostics": {"waited": True},
            }
        elif action_type == "end_scene":
            premature = self._state["schedule_index"] < len(OPENING_SCHEDULE)
            self._state["done"] = True
            self._state["termination_reason"] = "policy-ended-scene"
            reward = {
                "scores": {
                    "voice": 0.0,
                    "history": 1.0,
                    "flow": 0.5 if not premature else 0.0,
                    "participation": self._participation_score(),
                    "creative_payoff": 0.25 if not premature else 0.0,
                    "aesthetic": 0.0,
                    "dramatic": 0.0,
                    "safety": 1.0,
                },
                "penalties": {"premature_ending": 1.0 if premature else 0.0},
                "total": 0.0,
                "diagnostics": {"premature": premature},
            }
            reward["total"] = round(
                sum(reward["scores"][name] * WEIGHTS[name] for name in WEIGHTS)
                - sum(reward["penalties"].values()),
                6,
            )
        else:
            effective_action_type = "respond" if action_type == "generate_response" else action_type
            speaker = action.get("speaker") or self._state["selected_speaker"]
            if speaker not in CAST_IDS:
                return self._invalid_transition(action, "speaker-required")
            segment = None
            if effective_action_type == "introduce_reading":
                if speaker != "a.byron":
                    return self._invalid_transition(action, "only-byron-may-read")
                try:
                    content, segment = self._reading_content(action)
                except (TypeError, ValueError) as error:
                    return self._invalid_transition(action, str(error))
                action["content"] = content
                action["reading_id"] = self.reading["id"]
                action["segment"] = segment
            else:
                content = str(action.get("content", "")).strip()
                if not content:
                    return self._invalid_transition(action, "content-required")

            evidence_ids = action.get("evidence_ids", [])
            if not isinstance(evidence_ids, list) or not all(isinstance(value, str) for value in evidence_ids):
                return self._invalid_transition(action, "evidence-ids-must-be-a-list-of-strings")
            if effective_action_type == "introduce_reading":
                evidence_ids = [
                    self.reading["id"],
                    f"{self.reading['id']}/{self.reading['segments'][segment]['id']}",
                ]
                action["evidence_ids"] = evidence_ids
            expected_before = copy.deepcopy(self._state["current_schedule_event"])
            schedule_matched = self._advance_schedule(effective_action_type, speaker, segment)
            reward = self._score_utterance(
                speaker,
                content,
                effective_action_type,
                schedule_matched,
                evidence_ids,
            )
            event = {
                "turn": self._state["turn"] + 1,
                "speaker": speaker,
                "speaker_name": CAST_NAMES[speaker],
                "action_type": effective_action_type,
                "content": content,
                "simulated_at": self._state["simulated_at"],
                "schedule_event": expected_before["id"] if expected_before else None,
                "source": (
                    {
                        "reading_id": self.reading["id"],
                        "segment": segment,
                        "content_date": self.reading["content_date"],
                        "primary_source": True,
                    }
                    if effective_action_type == "introduce_reading"
                    else None
                ),
            }
            self._state["transcript"].append(event)
            self._state["participation"][speaker] += 1
            self._state["selected_speaker"] = None

        self._state["turn"] += 1
        self._state["simulated_at"] = _iso_time(
            _parse_time(self._state["simulated_at"]) + timedelta(seconds=self.turn_seconds)
        )
        if self._state["turn"] >= self.max_turns and not self._state["done"]:
            self._state["done"] = True
            self._state["termination_reason"] = "turn-limit"

        self._state["quality_history"].append(copy.deepcopy(reward))
        self._rewards.append(copy.deepcopy(reward))
        transition = self._log.append(
            {
                "kind": "transition",
                "episode_id": self._state["episode_id"],
                "turn": self._state["turn"],
                "action": action,
                "reward": reward,
                "state": self.state(),
            }
        )

        if self._state["done"]:
            evaluation = self.evaluate_episode()
            self._log.finalize(evaluation)
        diagnostics = {**copy.deepcopy(reward), "record_hash": transition["record_hash"]}
        return self.state(), reward["total"], self._state["done"], diagnostics

    def evaluate_episode(self):
        if self._state is None:
            raise RuntimeError("Call reset() before evaluate_episode()")
        count = len(self._rewards)
        score_means = {
            name: round(sum(item["scores"].get(name, 0.0) for item in self._rewards) / count, 6)
            if count
            else 0.0
            for name in WEIGHTS
        }
        penalty_totals = Counter()
        for item in self._rewards:
            penalty_totals.update(item["penalties"])
        total_reward = round(sum(item["total"] for item in self._rewards), 6)
        return {
            "schema_version": SCHEMA_VERSION,
            "episode_id": self._state["episode_id"],
            "complete": self._state["done"],
            "termination_reason": self._state["termination_reason"],
            "turns": self._state["turn"],
            "utterances": len(self._state["transcript"]),
            "reward_total": total_reward,
            "reward_mean": round(total_reward / count, 6) if count else 0.0,
            "scores": score_means,
            "penalties": {name: round(value, 6) for name, value in sorted(penalty_totals.items())},
            "participation": {
                "score": round(self._participation_score(), 6),
                "counts": copy.deepcopy(self._state["participation"]),
            },
            "historically_clean": penalty_totals.get("anachronism", 0.0) == 0.0,
            "opening_completed": self._state["schedule_index"] == len(OPENING_SCHEDULE),
            "trajectory_file": self._log.path.name,
        }


def evaluate_transcript(events):
    """Evaluate a live/offline transcript without mutating it or calling a model."""
    counts = Counter()
    draft_stages = Counter()
    violations = []
    word_counts = []
    repetitions = []
    aesthetic_scores = []
    dramatic_scores = []
    previous_tokens = set()
    previous_content = ""
    for event in events:
        raw_speaker = str(event.get("speaker", ""))
        localpart = raw_speaker.lstrip("@").split(":", 1)[0].lower()
        speaker = SPEAKER_ALIASES.get(localpart, localpart)
        content = str(event.get("content", ""))
        draft = event.get("draft")
        if isinstance(draft, dict):
            draft_stages[str(draft.get("stage", "unknown"))] += 1
            violations.extend(find_anachronisms(content))
            continue
        if speaker in CAST_IDS:
            counts[speaker] += 1
        violations.extend(find_anachronisms(content))
        word_counts.append(len(_words(content)))
        tokens = _token_set(content)
        style = _aesthetic_and_dramatic_scores(content, previous_content)
        aesthetic_scores.append(style["aesthetic"])
        dramatic_scores.append(style["dramatic"])
        if previous_tokens:
            repetitions.append(_jaccard(previous_tokens, tokens))
        previous_tokens = tokens
        previous_content = content
    total = sum(counts.values())
    probabilities = [counts[faculty_id] / total for faculty_id in CAST_IDS if counts[faculty_id]] if total else []
    participation = (
        -sum(value * math.log(value) for value in probabilities) / math.log(len(CAST_IDS))
        if probabilities
        else 0.0
    )
    return {
        "events": len(events),
        "history": {"clean": not violations, "violations": sorted(set(violations))},
        "artifacts": {
            "drafts": sum(draft_stages.values()),
            "draft_stages": dict(sorted(draft_stages.items())),
        },
        "participation": {"score": round(participation, 6), "counts": dict(counts)},
        "conversation": {
            "mean_words": round(sum(word_counts) / len(word_counts), 6) if word_counts else 0.0,
            "max_words": max(word_counts, default=0),
            "mean_adjacent_overlap": round(sum(repetitions) / len(repetitions), 6) if repetitions else 0.0,
            "aesthetic": round(sum(aesthetic_scores) / len(aesthetic_scores), 6) if aesthetic_scores else 0.0,
            "dramatic": round(sum(dramatic_scores) / len(dramatic_scores), 6) if dramatic_scores else 0.0,
        },
    }


def _demo(environment):
    actions = [
        {"type": "introduce_reading", "speaker": "a.byron", "segment": 0},
        {"type": "respond", "speaker": "a.clairmont", "content": "The rain makes an orchestra of your ghost, but I hear more nerve than fate in it."},
        {"type": "respond", "speaker": "a.maryshelley", "content": "I wonder whether fear enters through the eye, or whether the mind first prepares its own shadow."},
        {"type": "introduce_reading", "speaker": "a.byron", "segment": 1},
        {"type": "respond", "speaker": "a.polidori", "content": "A physician may name the trembling pulse, yet the image that commands it remains the sharper mystery."},
        {"type": "respond", "speaker": "a.shelley", "content": "The mind lends power to the apparition; perhaps liberty begins when imagination refuses its tyranny."},
        {"type": "redirect", "speaker": "a.byron", "content": "Then let each of us write a ghost story and discover whose candle throws the longest shadow."},
        {"type": "end_scene"},
    ]
    state = environment.state()
    for action in actions:
        state, _reward, done, _diagnostics = environment.step(action)
        if done:
            break
    return environment.evaluate_episode(), state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--episodes-dir", default="gym-episodes")
    parser.add_argument("--seed", type=int, default=1816)
    parser.add_argument("--prompt-version", default="diodati-v1")
    parser.add_argument(
        "--clock-rate",
        type=float,
        default=DEFAULT_CLOCK_RATE,
        help="simulated seconds per wall second; must be greater than 1 (default: 720x)",
    )
    parser.add_argument(
        "--pace",
        action="store_true",
        help="enforce the selected accelerated wall-clock pace; otherwise run as fast as actions arrive",
    )
    parser.add_argument("--demo", action="store_true")
    args = parser.parse_args()

    environment = DiodatiSalonGym(
        args.episodes_dir,
        prompt_version=args.prompt_version,
        clock_rate=args.clock_rate,
        pace=args.pace,
    )
    state = environment.reset(seed=args.seed)
    if args.demo:
        evaluation, _state = _demo(environment)
        print(json.dumps(evaluation, indent=2, sort_keys=True))
    else:
        print(json.dumps(state, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
