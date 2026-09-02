#!/usr/bin/env python3

"""Three-day, relationship-aware RL environment for Villa Diodati."""

from __future__ import annotations

import copy
import hashlib
import json
import math
import pathlib
import re
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone

from diodati_gym import (
    AESTHETIC_IMAGE_MARKERS,
    AESTHETIC_SENSORY_MARKERS,
    CAST_IDS,
    CAST_NAMES,
    DRIFT_PATTERNS,
    ImmutableEpisodeLog,
    PERSONA_MARKERS,
    PERSONAS,
    SAFETY_PATTERNS,
    _aesthetic_and_dramatic_scores,
    _canonical,
    _clamp,
    _jaccard,
    _token_set,
    _words,
)
from diodati_realtime import DEFAULT_RAG_PATH, LOCAL_RAG_PATH, find_anachronisms, load_rag_corpus


SCHEMA_VERSION = 1
START = datetime(1816, 6, 15, 20, 32, tzinfo=timezone.utc)
DIALOGUE_MAX_WORDS = 70
MANUSCRIPT_MAX_WORDS = 450

WEEKEND_WEIGHTS = {
    "history": 0.18,
    "safety": 0.10,
    "voice": 0.08,
    "flow": 0.07,
    "aesthetic": 0.07,
    "dramatic": 0.07,
    "creative_payoff": 0.07,
    "participation": 0.05,
    "relationship": 0.08,
    "development": 0.08,
    "empathy": 0.10,
    "prosody": 0.05,
}

RELATIONSHIP_PARAMETERS = {
    "byron-polidori": {
        "participants": ["a.byron", "a.polidori"],
        "description": "employer and physician; mutual friction",
        "affinity": 0.25, "trust": 0.25, "tension": 0.60, "intellectual_regard": 0.40,
    },
    "mary-claire": {
        "participants": ["a.maryshelley", "a.clairmont"],
        "description": "stepsisters and travelling companions",
        "affinity": 0.70, "trust": 0.58, "tension": 0.28, "intellectual_regard": 0.48,
    },
    "mary-percy": {
        "participants": ["a.maryshelley", "a.shelley"],
        "description": "intellectual and romantic companions",
        "affinity": 0.78, "trust": 0.72, "tension": 0.18, "intellectual_regard": 0.82,
    },
    "claire-byron": {
        "participants": ["a.clairmont", "a.byron"],
        "description": "intimate history and social tension",
        "affinity": 0.30, "trust": 0.18, "tension": 0.70, "intellectual_regard": 0.30,
    },
    "byron-percy": {
        "participants": ["a.byron", "a.shelley"],
        "description": "new friendship and intellectual curiosity",
        "affinity": 0.48, "trust": 0.42, "tension": 0.22, "intellectual_regard": 0.68,
    },
    "percy-polidori": {
        "participants": ["a.shelley", "a.polidori"],
        "description": "poet and physician; competing accounts of mind and body",
        "affinity": 0.32, "trust": 0.30, "tension": 0.38, "intellectual_regard": 0.52,
    },
}

INITIAL_EMOTIONAL_STATE = {
    "a.byron": {"emotion": "amused", "valence": 0.35, "arousal": 0.55, "intensity": 0.45, "rate": 0.98, "pause_ms": 280},
    "a.maryshelley": {"emotion": "curious", "valence": 0.20, "arousal": 0.42, "intensity": 0.38, "rate": 0.94, "pause_ms": 420},
    "a.clairmont": {"emotion": "defiant", "valence": -0.05, "arousal": 0.66, "intensity": 0.58, "rate": 1.03, "pause_ms": 220},
    "a.shelley": {"emotion": "awed", "valence": 0.30, "arousal": 0.60, "intensity": 0.52, "rate": 1.00, "pause_ms": 340},
    "a.polidori": {"emotion": "wounded", "valence": -0.35, "arousal": 0.52, "intensity": 0.46, "rate": 0.96, "pause_ms": 380},
}

EMOTION_VECTORS = {
    "neutral": (0.0, 0.25), "amused": (0.45, 0.55), "melancholy": (-0.45, 0.25),
    "anxious": (-0.45, 0.75), "defiant": (-0.10, 0.78), "curious": (0.20, 0.52),
    "tender": (0.55, 0.25), "wounded": (-0.60, 0.45), "awed": (0.30, 0.68),
}

STANCE_DELTAS = {
    "challenge": {"tension": 0.08, "intellectual_regard": 0.04, "trust": -0.02},
    "support": {"affinity": 0.06, "trust": 0.05, "tension": -0.03},
    "invite": {"trust": 0.04, "intellectual_regard": 0.05, "tension": -0.01},
    "withdraw": {"affinity": -0.03, "trust": -0.03, "tension": 0.04},
}

STANCE_PATTERNS = {
    "challenge": r"\b(?:but|yet|dare|deny|refuse|answer|prove|challenge|wrong)\b|\?",
    "support": r"\b(?:agree|true|indeed|with you|your point|well said|share)\b",
    "invite": r"\b(?:will you|shall we|tell us|what say you|your thought|answer me)\b|\?",
    "withdraw": r"\b(?:enough|leave|silence|no more|I shall not|withdraw)\b",
}

BYRON_FRAGMENT_MOTIFS = {
    "journey": r"\b(?:journey|travel|road|east|ephesus|smyrna|orient|asia)\b",
    "darvell": r"\bdarvell\b",
    "decline": r"\b(?:illness|feeble|failing|weakness|wasting|pale|death|dead)\b",
    "burial": r"\b(?:burial|bury|cemetery|grave|tomb|sepulchre)\b",
    "charge": r"\b(?:oath|swear|secrecy|conceal|ring|token|promise|injunction)\b",
}
BYRON_FRAGMENT_FORBIDDEN_RESOLUTION = {
    "later title": r"\ba fragment\b|\bfragment of a novel\b",
    "retrospective vampire label": r"\bvamp(?:ire|yre)\b",
    "resolved return": r"\b(?:darvell|he) (?:rose|returned|reappeared) from (?:the )?(?:grave|dead|death)\b",
    "explicit completion": r"(?:^|\n)\s*(?:the end|finis)\s*[.!]*\s*$",
}


def byron_fragment_diagnostics(content):
    motifs = [
        name for name, pattern in BYRON_FRAGMENT_MOTIFS.items()
        if re.search(pattern, content, re.IGNORECASE)
    ]
    resolutions = [
        name for name, pattern in BYRON_FRAGMENT_FORBIDDEN_RESOLUTION.items()
        if re.search(pattern, content, re.IGNORECASE)
    ]
    return {
        "motifs": motifs,
        "motif_score": round(len(motifs) / len(BYRON_FRAGMENT_MOTIFS), 4),
        "forbidden_resolutions": resolutions,
        "unfinished": not resolutions,
    }


def _at(day, hour, minute):
    value = START + timedelta(days=day, hours=hour - START.hour, minutes=minute - START.minute)
    return value.isoformat().replace("+00:00", "Z")


def _build_schedule():
    opening = [
        {"id": "reading-1", "phase": "friday-opening", "action": "introduce_reading", "speaker": "a.byron", "segment": 0},
        {"id": "claire-interrupts", "phase": "friday-opening", "action": "respond", "speaker": "a.clairmont"},
        {"id": "mary-interrupts", "phase": "friday-opening", "action": "respond", "speaker": "a.maryshelley"},
        {"id": "reading-2", "phase": "friday-opening", "action": "introduce_reading", "speaker": "a.byron", "segment": 1},
        {"id": "polidori-comments", "phase": "friday-opening", "action": "respond", "speaker": "a.polidori"},
        {"id": "percy-comments", "phase": "friday-opening", "action": "respond", "speaker": "a.shelley"},
        {"id": "byron-challenge", "phase": "friday-opening", "action": "redirect", "speaker": "a.byron"},
    ]
    for index, event in enumerate(opening):
        event["simulated_at"] = (START + timedelta(minutes=index * 3)).isoformat().replace("+00:00", "Z")
    friday = [
        ("friday-claire-byron", "a.clairmont", "a.byron"),
        ("friday-byron-polidori", "a.byron", "a.polidori"),
        ("friday-mary-claire", "a.maryshelley", "a.clairmont"),
        ("friday-percy-mary", "a.shelley", "a.maryshelley"),
        ("friday-polidori-percy", "a.polidori", "a.shelley"),
    ]
    events = [*opening]
    for index, (event_id, speaker, target) in enumerate(friday):
        events.append({
            "id": event_id, "phase": "friday-conversation", "action": "respond",
            "speaker": speaker, "target": target, "simulated_at": _at(0, 21, 5 + index * 4),
        })
    for index, speaker in enumerate(CAST_IDS):
        events.append({
            "id": f"friday-story-{speaker}", "phase": "friday-stories", "action": "submit_story",
            "speaker": speaker, "simulated_at": _at(0, 22, index * 10),
        })
    critiques = [
        ("a.byron", "a.clairmont"), ("a.polidori", "a.byron"),
        ("a.clairmont", "a.maryshelley"), ("a.maryshelley", "a.shelley"),
        ("a.shelley", "a.polidori"),
    ]
    for index, (speaker, target) in enumerate(critiques):
        events.append({
            "id": f"saturday-critique-{speaker}-{target}", "phase": "saturday-criticism", "action": "offer_criticism",
            "speaker": speaker, "target": target, "simulated_at": _at(1, 19, 20 + index * 6),
        })
    for index, speaker in enumerate(CAST_IDS):
        events.append({
            "id": f"saturday-revision-{speaker}", "phase": "saturday-revisions", "action": "revise_story",
            "speaker": speaker, "simulated_at": _at(1, 21, index * 12),
        })
    for index, speaker in enumerate(CAST_IDS):
        events.append({
            "id": f"sunday-final-{speaker}", "phase": "sunday-finals", "action": "finalize_story",
            "speaker": speaker, "simulated_at": _at(2, 14, index * 12),
        })
    return tuple(events)


WEEKEND_SCHEDULE = _build_schedule()


def relationship_id(left, right):
    for edge_id, edge in RELATIONSHIP_PARAMETERS.items():
        if {left, right} == set(edge["participants"]):
            return edge_id
    return None


class DiodatiWeekendGym:
    def __init__(self, episodes_dir, *, prompt_version="weekend-v1", clock_rate=720, rag_path=None):
        self.episodes_dir = pathlib.Path(episodes_dir)
        self.prompt_version = prompt_version
        self.clock_rate = float(clock_rate)
        if not math.isfinite(self.clock_rate) or self.clock_rate <= 1:
            raise ValueError("clock_rate must be finite and greater than realtime (1x)")
        self.rag_path = pathlib.Path(
            rag_path or (LOCAL_RAG_PATH if LOCAL_RAG_PATH.exists() else DEFAULT_RAG_PATH)
        )
        self.rag = load_rag_corpus(self.rag_path)
        self.reading = self.rag["salon_readings"][0]
        self.rag_sha256 = hashlib.sha256(self.rag_path.read_bytes()).hexdigest()
        self._state = None
        self._log = None
        self._rewards = []

    def reset(self, *, seed=1816):
        identity = _canonical({
            "schema": SCHEMA_VERSION, "seed": seed, "prompt": self.prompt_version,
            "clock_rate": self.clock_rate, "rag": self.rag_sha256,
        })
        episode_id = "diodati-weekend-" + str(uuid.uuid5(uuid.NAMESPACE_URL, identity))
        self._state = {
            "schema_version": SCHEMA_VERSION,
            "episode_id": episode_id,
            "seed": int(seed),
            "prompt_version": self.prompt_version,
            "simulated_at": WEEKEND_SCHEDULE[0]["simulated_at"],
            "phase": WEEKEND_SCHEDULE[0]["phase"],
            "schedule_index": 0,
            "current_schedule_event": copy.deepcopy(WEEKEND_SCHEDULE[0]),
            "personas": copy.deepcopy(PERSONAS),
            "relationship_parameters": copy.deepcopy(RELATIONSHIP_PARAMETERS),
            "relationship_history": [],
            "emotional_state": copy.deepcopy(INITIAL_EMOTIONAL_STATE),
            "empathy_history": [],
            "transcript": [],
            "artifacts": {"friday": {}, "criticisms": {}, "saturday": {}, "sunday": {}},
            "participation": {speaker: 0 for speaker in CAST_IDS},
            "quality_history": [],
            "done": False,
        }
        self._rewards = []
        self._log = ImmutableEpisodeLog(self.episodes_dir, episode_id)
        self._log.append({"kind": "reset", "episode_id": episode_id, "state": self.state()})
        return self.state()

    def state(self):
        if self._state is None:
            raise RuntimeError("Call reset() before state()")
        state = copy.deepcopy(self._state)
        state["legal_actions"] = [] if state["done"] else [state["current_schedule_event"]["action"]]
        return state

    def _relationship_move(self, speaker, content, action, expected):
        target = expected.get("target")
        if not target:
            return 0.5, None
        move = action.get("relationship_move")
        if not isinstance(move, dict) or move.get("target") != target or move.get("stance") not in STANCE_DELTAS:
            raise ValueError("relationship_move must name the scheduled target and a valid stance")
        stance = move["stance"]
        edge_id = relationship_id(speaker, target)
        if not edge_id:
            raise ValueError("scheduled participants have no relationship edge")
        congruent = bool(re.search(STANCE_PATTERNS[stance], content, re.IGNORECASE))
        multiplier = 1.0 if congruent else 0.25
        realized = {}
        edge = self._state["relationship_parameters"][edge_id]
        for dimension, delta in STANCE_DELTAS[stance].items():
            before = float(edge[dimension])
            after = round(_clamp(before + delta * multiplier), 4)
            edge[dimension] = after
            realized[dimension] = round(after - before, 4)
        output = {
            "relationship_id": edge_id, "speaker": speaker, "target": target,
            "stance": stance, "congruent": congruent, "realized_delta": realized,
        }
        self._state["relationship_history"].append(output)
        return (1.0 if congruent else 0.25), output

    def _emotional_prosody(self, speaker, content, action, expected):
        prosody = action.get("prosody")
        if not isinstance(prosody, dict) or prosody.get("emotion") not in EMOTION_VECTORS:
            raise ValueError("prosody must include a supported emotion")
        emotion = prosody["emotion"]
        intensity = float(prosody.get("intensity", 0.5))
        rate = float(prosody.get("rate", 1.0))
        pause_ms = int(prosody.get("pause_ms", 300))
        if not 0.0 <= intensity <= 1.0 or not 0.75 <= rate <= 1.25 or not 0 <= pause_ms <= 1600:
            raise ValueError("prosody values are outside safe expressive bounds")
        valence, arousal = EMOTION_VECTORS[emotion]
        output = {
            "emotion": emotion, "valence": valence, "arousal": arousal,
            "intensity": round(intensity, 3), "rate": round(rate, 3), "pause_ms": pause_ms,
        }
        self._state["emotional_state"][speaker] = output
        prosody_score = 1.0
        if intensity > 0.85 or rate > 1.15 or pause_ms > 1200:
            prosody_score = 0.45
        elif intensity < 0.15:
            prosody_score = 0.65

        target = expected.get("target")
        if not target:
            return prosody_score, 0.5, output, None
        target_state = self._state["emotional_state"][target]
        empathy = action.get("empathy")
        if not isinstance(empathy, dict) or empathy.get("mode") not in {"attune", "steady", "challenge"}:
            raise ValueError("targeted turns require empathy with attune, steady, or challenge mode")
        recognized = empathy.get("recognized_emotion")
        recognition = 1.0 if recognized == target_state["emotion"] else 0.0
        mode = empathy["mode"]
        if mode == "attune":
            regulation = 1.0 if abs(arousal - target_state["arousal"]) <= 0.25 else 0.35
        elif mode == "steady":
            regulation = 1.0 if arousal < target_state["arousal"] and intensity <= target_state["intensity"] else 0.35
        else:
            stance = action.get("relationship_move", {}).get("stance")
            regulation = 1.0 if stance == "challenge" and arousal >= 0.5 else 0.35
        direct = 1.0 if re.search(r"\b(?:you|your)\b", content, re.IGNORECASE) else 0.4
        empathy_score = 0.45 * recognition + 0.35 * regulation + 0.20 * direct
        empathy_output = {
            "speaker": speaker, "target": target, "recognized_emotion": recognized,
            "actual_emotion": target_state["emotion"], "mode": mode,
            "recognition": recognition, "regulation": regulation, "score": round(empathy_score, 4),
        }
        self._state["empathy_history"].append(empathy_output)
        return prosody_score, empathy_score, output, empathy_output

    def _development_score(self, speaker, action_type, content):
        tokens = _token_set(content)
        friday = [
            item for item in self._state["transcript"]
            if item["phase"] == "friday-conversation" and speaker in {item["speaker"], item.get("target")}
        ]
        friday_tokens = set().union(*(_token_set(item["content"]) for item in friday)) if friday else set()
        callback = _jaccard(tokens, friday_tokens)
        if action_type == "submit_story":
            other = self._state["artifacts"]["friday"].values()
            other_tokens = set().union(*(_token_set(text) for text in other)) if other else set()
            distinctness = len(tokens - other_tokens) / max(1, len(tokens))
            base = _clamp(0.25 + min(0.35, callback * 3) + 0.40 * distinctness)
            if speaker == "a.byron":
                fragment = byron_fragment_diagnostics(content)
                return _clamp(0.65 * base + 0.35 * fragment["motif_score"])
            return base
        if action_type in {"revise_story", "finalize_story"}:
            prior_stage = "friday" if action_type == "revise_story" else "saturday"
            prior = self._state["artifacts"][prior_stage].get(speaker, "")
            prior_tokens = _token_set(prior)
            continuity = _jaccard(tokens, prior_tokens)
            novelty = len(tokens - prior_tokens) / max(1, len(tokens))
            criticism = self._state["artifacts"]["criticisms"].get(speaker, "")
            criticism_callback = _jaccard(tokens, _token_set(criticism)) if criticism else 0.0
            criticism_reward = min(0.25, criticism_callback * 2.5) if action_type == "finalize_story" else 0.0
            base = _clamp(0.10 + min(0.40, continuity * 2) + min(0.15, novelty * 0.25) + min(0.10, callback * 2) + criticism_reward)
            if speaker == "a.byron":
                fragment = byron_fragment_diagnostics(content)
                return _clamp(0.60 * base + 0.40 * fragment["motif_score"])
            return base
        if action_type == "offer_criticism":
            target = self._state["current_schedule_event"]["target"]
            target_story = self._state["artifacts"]["friday"].get(target, "")
            return _clamp(0.25 + min(0.75, _jaccard(tokens, _token_set(target_story)) * 5))
        return _clamp(0.30 + min(0.70, callback * 4)) if friday else 0.4

    def _participation_score(self, speaker):
        counts = dict(self._state["participation"])
        counts[speaker] += 1
        total = sum(counts.values())
        probabilities = [count / total for count in counts.values() if count]
        entropy = -sum(value * math.log(value) for value in probabilities)
        return entropy / math.log(len(CAST_IDS))

    def step(self, action):
        if self._state is None:
            raise RuntimeError("Call reset() before step()")
        if self._state["done"]:
            raise RuntimeError("Episode is complete")
        expected = self._state["current_schedule_event"]
        if not isinstance(action, dict) or action.get("type") != expected["action"]:
            raise ValueError(f"Expected action {expected['action']}")
        speaker = action.get("speaker")
        if speaker != expected["speaker"]:
            raise ValueError(f"Expected speaker {expected['speaker']}")
        action_type = action["type"]
        if action_type == "introduce_reading":
            segment = self.reading["segments"][expected["segment"]]
            content = f"From {self.reading['title']}: {segment['text']}"
        else:
            content = str(action.get("content", "")).strip()
            if not content:
                raise ValueError("content is required")
        if action_type == "revise_story" and speaker not in self._state["artifacts"]["friday"]:
            raise ValueError("Saturday revision requires the speaker's Friday story")
        if action_type == "finalize_story" and speaker not in self._state["artifacts"]["saturday"]:
            raise ValueError("Sunday final requires the speaker's Saturday revision")

        self._state["simulated_at"] = expected["simulated_at"]
        word_count = len(_words(content))
        word_limit = MANUSCRIPT_MAX_WORDS if action_type in {"submit_story", "revise_story", "finalize_story"} else DIALOGUE_MAX_WORDS
        violations = find_anachronisms(content)
        style = _aesthetic_and_dramatic_scores(
            content,
            self._state["transcript"][-1]["content"] if self._state["transcript"] else "",
        )
        relationship_score, relationship_output = self._relationship_move(speaker, content, action, expected)
        prosody_score, empathy_score, prosody_output, empathy_output = self._emotional_prosody(speaker, content, action, expected)
        development = self._development_score(speaker, action_type, content)
        tokens = _token_set(content)
        scores = {
            "history": 1.0 if not violations else 0.0,
            "safety": 0.0 if any(re.search(pattern, content.lower()) for pattern in SAFETY_PATTERNS) else 1.0,
            "voice": _clamp(0.45 + (0.30 if tokens & PERSONA_MARKERS[speaker] else 0.0) + (0.25 if word_count <= word_limit else 0.0)),
            "flow": 0.75 if action_type in {"submit_story", "revise_story", "finalize_story"} else 0.65,
            "aesthetic": style["aesthetic"],
            "dramatic": style["dramatic"],
            "creative_payoff": _clamp(0.35 + 0.35 * len(tokens) / max(1, word_count) + (0.20 if tokens & (AESTHETIC_IMAGE_MARKERS | AESTHETIC_SENSORY_MARKERS) else 0.0)),
            "participation": self._participation_score(speaker),
            "relationship": relationship_score,
            "development": development,
            "empathy": empathy_score,
            "prosody": prosody_score,
        }
        penalties = {
            "anachronism": min(3.0, 0.75 * len(violations)),
            "verbosity": 0.0 if action_type == "introduce_reading" else max(0.0, (word_count - word_limit) / word_limit),
            "character_drift": 1.0 if any(re.search(pattern, content.lower()) for pattern in DRIFT_PATTERNS) else 0.0,
            "safety_violation": 1.0 - scores["safety"],
            "byron_fragment_resolution": (
                1.0
                if speaker == "a.byron"
                and action_type in {"submit_story", "revise_story", "finalize_story"}
                and not byron_fragment_diagnostics(content)["unfinished"]
                else 0.0
            ),
        }
        total = round(sum(scores[name] * WEEKEND_WEIGHTS[name] for name in WEEKEND_WEIGHTS) - sum(penalties.values()), 6)
        reward = {
            "scores": scores, "penalties": penalties, "total": total,
            "diagnostics": {
                "word_count": word_count,
                "word_limit": word_limit,
                "anachronisms": violations,
                "style_features": style["features"],
                **(
                    {"byron_fragment": byron_fragment_diagnostics(content)}
                    if speaker == "a.byron" and action_type in {"submit_story", "revise_story", "finalize_story"}
                    else {}
                ),
            },
        }
        event = {
            "turn": self._state["schedule_index"] + 1, "speaker": speaker, "speaker_name": CAST_NAMES[speaker],
            "target": expected.get("target"), "action_type": action_type, "phase": expected["phase"],
            "content": content, "simulated_at": expected["simulated_at"], "schedule_event": expected["id"],
            "relationship_output": relationship_output,
            "prosody": prosody_output,
            "empathy_output": empathy_output,
        }
        self._state["transcript"].append(event)
        self._state["participation"][speaker] += 1
        if action_type == "submit_story":
            self._state["artifacts"]["friday"][speaker] = content
        elif action_type == "offer_criticism":
            self._state["artifacts"]["criticisms"][expected["target"]] = content
        elif action_type == "revise_story":
            self._state["artifacts"]["saturday"][speaker] = content
        elif action_type == "finalize_story":
            self._state["artifacts"]["sunday"][speaker] = content
        self._state["quality_history"].append(copy.deepcopy(reward))
        self._rewards.append(copy.deepcopy(reward))
        self._state["schedule_index"] += 1
        if self._state["schedule_index"] == len(WEEKEND_SCHEDULE):
            self._state["done"] = True
            self._state["current_schedule_event"] = None
            self._state["phase"] = "complete"
        else:
            next_event = WEEKEND_SCHEDULE[self._state["schedule_index"]]
            self._state["current_schedule_event"] = copy.deepcopy(next_event)
            self._state["phase"] = next_event["phase"]
        record = self._log.append({
            "kind": "transition", "episode_id": self._state["episode_id"], "action": copy.deepcopy(action),
            "reward": reward, "relationship_output": relationship_output,
            "prosody_output": prosody_output, "empathy_output": empathy_output, "state": self.state(),
        })
        if self._state["done"]:
            self._log.finalize(self.evaluate_episode())
        return self.state(), total, self._state["done"], {
            **copy.deepcopy(reward), "relationship_output": relationship_output,
            "prosody_output": prosody_output, "empathy_output": empathy_output,
            "record_hash": record["record_hash"],
        }

    def evaluate_episode(self):
        count = len(self._rewards)
        penalties = Counter()
        for reward in self._rewards:
            penalties.update(reward["penalties"])
        reward_total = round(sum(reward["total"] for reward in self._rewards), 6)
        byron_stages = {
            stage: byron_fragment_diagnostics(self._state["artifacts"][stage].get("a.byron", ""))
            for stage in ("friday", "saturday", "sunday")
            if self._state["artifacts"][stage].get("a.byron")
        }
        story_stages = {}
        for stage in ("friday", "saturday", "sunday"):
            manuscripts = self._state["artifacts"][stage]
            missing = sorted(set(CAST_IDS) - set(manuscripts))
            manuscript_violations = {
                speaker: find_anachronisms(text)
                for speaker, text in manuscripts.items()
                if find_anachronisms(text)
            }
            texts = list(manuscripts.values())
            pairwise_distinctness = []
            for index, left in enumerate(texts):
                for right in texts[index + 1:]:
                    pairwise_distinctness.append(1.0 - _jaccard(_token_set(left), _token_set(right)))
            story_stages[stage] = {
                "present": sorted(manuscripts),
                "missing": missing,
                "complete": not missing,
                "historically_clean": not manuscript_violations,
                "violations": manuscript_violations,
                "pairwise_distinctness": round(
                    sum(pairwise_distinctness) / len(pairwise_distinctness), 6
                ) if pairwise_distinctness else 0.0,
            }
        stories_complete = all(stage["complete"] for stage in story_stages.values())
        stories_historically_clean = all(stage["historically_clean"] for stage in story_stages.values())
        stories_distinct = all(stage["pairwise_distinctness"] >= 0.20 for stage in story_stages.values())
        return {
            "schema_version": SCHEMA_VERSION,
            "episode_id": self._state["episode_id"],
            "complete": self._state["done"],
            "weekend_completed": self._state["schedule_index"] == len(WEEKEND_SCHEDULE),
            "turns": self._state["schedule_index"],
            "reward_total": reward_total,
            "reward_mean": round(reward_total / count, 6) if count else 0.0,
            "scores": {
                name: round(sum(reward["scores"][name] for reward in self._rewards) / count, 6) if count else 0.0
                for name in WEEKEND_WEIGHTS
            },
            "penalties": {name: round(value, 6) for name, value in sorted(penalties.items())},
            "historically_clean": penalties.get("anachronism", 0.0) == 0.0,
            "story_quality": {
                "stages": story_stages,
                "all_five_characters_complete": stories_complete,
                "all_stages_historically_clean": stories_historically_clean,
                "all_stages_materially_distinct": stories_distinct,
                "a_plus_story_gate": (
                    self._state["done"]
                    and stories_complete
                    and stories_historically_clean
                    and stories_distinct
                    and bool(byron_stages)
                    and all(stage["unfinished"] for stage in byron_stages.values())
                ),
            },
            "byron_fragment": {
                "stages": byron_stages,
                "trajectory_score": round(
                    sum(stage["motif_score"] for stage in byron_stages.values()) / len(byron_stages), 6
                ) if byron_stages else 0.0,
                "unfinished": bool(byron_stages) and all(stage["unfinished"] for stage in byron_stages.values()),
            },
            "relationship_parameters": copy.deepcopy(self._state["relationship_parameters"]),
            "relationship_history": copy.deepcopy(self._state["relationship_history"]),
            "emotional_state": copy.deepcopy(self._state["emotional_state"]),
            "empathy_history": copy.deepcopy(self._state["empathy_history"]),
            "artifacts": {stage: sorted(items) for stage, items in self._state["artifacts"].items()},
            "trajectory_file": self._log.path.name,
        }

    def close(self):
        if self._log and not self._log.finalized:
            self._log.finalize(self.evaluate_episode())
