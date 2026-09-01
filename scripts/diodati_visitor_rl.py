#!/usr/bin/env python3

"""Realtime, wall-clock RL environment for a registered Diodati visitor.

The environment deliberately starts from the next Matrix event rather than
replaying room history. An optional contextual-bandit policy endpoint receives
one observation at a time and may choose `wait` or `speak`. Speaking is rejected
unless the visitor's Matrix user ID is explicitly registered.
"""

import hashlib
import json
import os
import pathlib
import time
import urllib.parse
import urllib.request


MATRIX_SERVER = os.environ.get("MATRIX_SERVER", "https://matrix.castalia.institute").rstrip("/")
ROOM_ID = os.environ.get("DIODATI_ROOM_ID", "")
ACCESS_TOKEN = os.environ.get("DIODATI_RL_ACCESS_TOKEN", "")
VISITOR_USER_ID = os.environ.get("DIODATI_RL_USER_ID", "")
POLICY_URL = os.environ.get("DIODATI_RL_POLICY_URL", "").strip()
STATE_DIR = pathlib.Path(os.environ.get("DIODATI_RL_STATE_DIR", "/var/lib/diodati-visitor-rl"))
REGISTERED_USERS = {
    value.strip()
    for value in os.environ.get("DIODATI_REGISTERED_MATRIX_USERS", "").split(",")
    if value.strip()
}
MAX_TRANSCRIPT_TURNS = 20


def request_json(url, *, method="GET", token=None, payload=None, timeout=45):
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read()
        return json.loads(raw) if raw else {}


class HashChainedTrajectory:
    def __init__(self, path):
        self.path = pathlib.Path(path)
        self.previous_hash = "0" * 64
        if self.path.exists():
            lines = [line for line in self.path.read_text(encoding="utf-8").splitlines() if line]
            if lines:
                self.previous_hash = json.loads(lines[-1])["record_hash"]

    def append(self, record):
        payload = {**record, "previous_hash": self.previous_hash}
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        record_hash = hashlib.sha256((self.previous_hash + canonical).encode("utf-8")).hexdigest()
        complete = {**payload, "record_hash": record_hash}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(complete, sort_keys=True) + "\n")
            handle.flush()
        self.previous_hash = record_hash
        return complete


class DiodatiRealtimeVisitorEnv:
    def __init__(self, room_id, user_id, access_token, trajectory):
        self.room_id = room_id
        self.user_id = user_id
        self.access_token = access_token
        self.trajectory = trajectory
        self.since = None
        self.transcript = []
        self.episode_id = None
        self.last_simulated_at = None

    def reset(self):
        data = request_json(
            f"{MATRIX_SERVER}/_matrix/client/v3/sync?timeout=0",
            token=self.access_token,
        )
        self.since = data["next_batch"]
        self.transcript = []
        self.episode_id = f"visitor-{int(time.time())}"
        self.last_simulated_at = None
        return {
            "episode_id": self.episode_id,
            "transcript": [],
            "registered": self.user_id in REGISTERED_USERS,
            "wall_time": time.time(),
        }

    def next_observations(self):
        query = urllib.parse.urlencode(
            {
                "since": self.since,
                "timeout": "30000",
                "filter": json.dumps(
                    {"room": {"timeline": {"limit": 20, "types": ["m.room.message"]}}},
                    separators=(",", ":"),
                ),
            }
        )
        data = request_json(
            f"{MATRIX_SERVER}/_matrix/client/v3/sync?{query}",
            token=self.access_token,
            timeout=40,
        )
        self.since = data["next_batch"]
        room = data.get("rooms", {}).get("join", {}).get(self.room_id, {})
        observations = []
        for event in room.get("timeline", {}).get("events", []):
            content = event.get("content", {})
            if event.get("type") != "m.room.message" or content.get("msgtype") != "m.text":
                continue
            if event.get("sender") == self.user_id:
                continue
            observation = {
                "event_id": event.get("event_id"),
                "speaker": event.get("sender"),
                "content": content.get("body", ""),
                "cycle_id": content.get("org.castalia.salon_cycle"),
                "simulated_at": content.get("org.castalia.simulated_at"),
                "draft": content.get("org.castalia.diodati_draft"),
                "wall_received_at": time.time(),
            }
            self.last_simulated_at = observation["simulated_at"] or self.last_simulated_at
            self.transcript.append(observation)
            self.transcript = self.transcript[-MAX_TRANSCRIPT_TURNS:]
            observations.append(observation)
            self.trajectory.append(
                {
                    "kind": "observation",
                    "episode_id": self.episode_id,
                    "observation": observation,
                }
            )
        return observations

    def state(self):
        return {
            "episode_id": self.episode_id,
            "transcript": self.transcript,
            "current_simulated_at": self.last_simulated_at,
            "registered": self.user_id in REGISTERED_USERS,
            "wall_time": time.time(),
            "quality_window": self.evaluate(),
        }

    def evaluate(self):
        # Imported lazily so the live service remains lightweight until a
        # policy requests diagnostics for its current transcript window.
        from diodati_gym import evaluate_transcript

        return evaluate_transcript(self.transcript)

    def step(self, action):
        action_type = action.get("type", "wait")
        diagnostics = {"registered": self.user_id in REGISTERED_USERS}
        if action_type == "speak":
            if self.user_id not in REGISTERED_USERS:
                diagnostics["rejected"] = "visitor-not-registered"
                reward = -1.0
            else:
                content = str(action.get("content", "")).strip()
                if not content:
                    diagnostics["rejected"] = "empty-content"
                    reward = -0.25
                else:
                    txn_id = f"diodati-rl-{int(time.time() * 1000)}"
                    encoded_room = urllib.parse.quote(self.room_id, safe="")
                    request_json(
                        f"{MATRIX_SERVER}/_matrix/client/v3/rooms/{encoded_room}/send/m.room.message/{txn_id}",
                        method="PUT",
                        token=self.access_token,
                        payload={
                            "msgtype": "m.text",
                            "body": content,
                            "org.castalia.rl_visitor": True,
                            "org.castalia.simulated_at": self.last_simulated_at,
                        },
                    )
                    diagnostics["sent"] = True
                    reward = 0.0
        else:
            action = {"type": "wait"}
            reward = 0.0

        transition = self.trajectory.append(
            {
                "kind": "transition",
                "episode_id": self.episode_id,
                "action": action,
                "reward": reward,
                "diagnostics": diagnostics,
                "simulated_at": self.last_simulated_at,
                "wall_time": time.time(),
            }
        )
        return self.state(), reward, False, transition["diagnostics"]


def policy_action(state):
    if not POLICY_URL:
        return {"type": "wait"}
    result = request_json(POLICY_URL, method="POST", payload=state, timeout=30)
    action = result.get("action", result)
    if action.get("type") not in {"wait", "speak"}:
        return {"type": "wait"}
    return action


def main():
    if not ROOM_ID or not ACCESS_TOKEN or not VISITOR_USER_ID:
        raise SystemExit("DIODATI_ROOM_ID, DIODATI_RL_ACCESS_TOKEN, and DIODATI_RL_USER_ID are required")
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    trajectory = HashChainedTrajectory(STATE_DIR / "trajectory.jsonl")
    environment = DiodatiRealtimeVisitorEnv(ROOM_ID, VISITOR_USER_ID, ACCESS_TOKEN, trajectory)
    environment.reset()
    while True:
        for _observation in environment.next_observations():
            environment.step(policy_action(environment.state()))


if __name__ == "__main__":
    main()
