#!/usr/bin/env python3

import json
import pathlib
import tempfile
import unittest

from diodati_visitor_rl import DiodatiRealtimeVisitorEnv, HashChainedTrajectory


class DiodatiVisitorRlTests(unittest.TestCase):
    def test_trajectory_is_append_only_and_hash_chained(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "trajectory.jsonl"
            trajectory = HashChainedTrajectory(path)
            first = trajectory.append({"kind": "observation", "value": 1})
            second = trajectory.append({"kind": "transition", "value": 2})
            records = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]

            self.assertEqual(len(records), 2)
            self.assertEqual(second["previous_hash"], first["record_hash"])
            self.assertEqual(records[-1]["record_hash"], second["record_hash"])

    def test_unregistered_visitor_cannot_speak(self):
        with tempfile.TemporaryDirectory() as directory:
            trajectory = HashChainedTrajectory(pathlib.Path(directory) / "trajectory.jsonl")
            environment = DiodatiRealtimeVisitorEnv(
                "!room:test",
                "@unregistered:test",
                "token",
                trajectory,
            )
            environment.episode_id = "test-episode"
            _state, reward, done, diagnostics = environment.step(
                {"type": "speak", "content": "May I enter?"}
            )

            self.assertEqual(reward, -1.0)
            self.assertFalse(done)
            self.assertEqual(diagnostics["rejected"], "visitor-not-registered")

    def test_live_matrix_speakers_share_the_offline_evaluator(self):
        with tempfile.TemporaryDirectory() as directory:
            trajectory = HashChainedTrajectory(pathlib.Path(directory) / "trajectory.jsonl")
            environment = DiodatiRealtimeVisitorEnv(
                "!room:test",
                "@visitor:test",
                "token",
                trajectory,
            )
            environment.transcript = [
                {"speaker": "@a.byron:matrix.castalia.institute", "content": "The rain has wit."},
                {"speaker": "@m.godwin:matrix.castalia.institute", "content": "The mind gives it force."},
            ]

            evaluation = environment.evaluate()

            self.assertEqual(evaluation["participation"]["counts"]["a.byron"], 1)
            self.assertEqual(evaluation["participation"]["counts"]["a.maryshelley"], 1)
            self.assertTrue(evaluation["history"]["clean"])


if __name__ == "__main__":
    unittest.main()
