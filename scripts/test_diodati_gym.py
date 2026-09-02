#!/usr/bin/env python3

import json
import pathlib
import stat
import tempfile
import unittest

from diodati_gym import DiodatiSalonGym, WEIGHTS, _demo, evaluate_transcript, verify_trajectory


class DiodatiSalonGymTests(unittest.TestCase):
    def test_reward_weights_remain_normalized(self):
        self.assertAlmostEqual(sum(WEIGHTS.values()), 1.0)

    def test_reset_is_reproducible_and_contains_full_environment_state(self):
        with tempfile.TemporaryDirectory() as left, tempfile.TemporaryDirectory() as right:
            first = DiodatiSalonGym(left, prompt_version="test-v1")
            second = DiodatiSalonGym(right, prompt_version="test-v1")

            first_state = first.reset(seed=42)
            second_state = second.reset(seed=42)

            self.assertEqual(first_state, second_state)
            self.assertEqual(first_state["current_schedule_event"]["id"], "reading-1")
            self.assertEqual(first_state["personas"]["a.maryshelley"]["name"], "Mary Godwin")
            self.assertEqual(len(first_state["relationships"]), 5)
            self.assertEqual(first_state["clock"]["mode"], "accelerated")
            self.assertEqual(first_state["clock"]["rate"], 720.0)
            self.assertAlmostEqual(first_state["clock"]["wall_seconds_per_step"], 1 / 6)
            first.close()
            second.close()

    def test_realtime_or_invalid_clock_rates_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            for rate in (1, 0, float("inf")):
                with self.subTest(rate=rate):
                    with self.assertRaises(ValueError):
                        DiodatiSalonGym(directory, clock_rate=rate)

    def test_demo_completes_opening_and_finalizes_immutable_trajectory(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = DiodatiSalonGym(directory)
            environment.reset()
            evaluation, state = _demo(environment)
            path = pathlib.Path(directory) / evaluation["trajectory_file"]

            self.assertTrue(state["done"])
            self.assertTrue(evaluation["opening_completed"])
            self.assertTrue(evaluation["historically_clean"])
            self.assertEqual(evaluation["participation"]["counts"]["a.byron"], 3)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o444)
            records = verify_trajectory(path)
            self.assertEqual(records[0]["kind"], "reset")
            self.assertEqual(records[-1]["kind"], "evaluation")

    def test_same_configuration_and_policy_produce_identical_trajectories(self):
        with tempfile.TemporaryDirectory() as left, tempfile.TemporaryDirectory() as right:
            first = DiodatiSalonGym(left, prompt_version="comparison-v1")
            second = DiodatiSalonGym(right, prompt_version="comparison-v1")
            first.reset(seed=7)
            second.reset(seed=7)
            first_evaluation, _state = _demo(first)
            second_evaluation, _state = _demo(second)

            first_records = verify_trajectory(pathlib.Path(left) / first_evaluation["trajectory_file"])
            second_records = verify_trajectory(pathlib.Path(right) / second_evaluation["trajectory_file"])
            self.assertEqual(first_records, second_records)

    def test_generate_response_alias_advances_the_opening_schedule(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = DiodatiSalonGym(directory)
            environment.reset()
            environment.step({"type": "introduce_reading", "speaker": "a.byron", "segment": 0})
            state, reward, done, diagnostics = environment.step(
                {
                    "type": "generate_response",
                    "speaker": "a.clairmont",
                    "content": "I hear the rain, but your ghost has borrowed thunder for an entrance.",
                }
            )

            self.assertFalse(done)
            self.assertGreater(reward, 0)
            self.assertTrue(diagnostics["diagnostics"]["schedule_matched"])
            self.assertEqual(state["current_schedule_event"]["id"], "mary-interrupts")
            self.assertEqual(state["transcript"][-1]["action_type"], "respond")
            environment.close()

    def test_anachronism_and_unapproved_evidence_are_penalized(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = DiodatiSalonGym(directory)
            environment.reset()
            _state, reward, _done, diagnostics = environment.step(
                {
                    "type": "respond",
                    "speaker": "a.clairmont",
                    "content": "In 2026 a computer will explain Frankenstein.",
                    "evidence_ids": ["future-web-page"],
                }
            )

            self.assertLess(reward, 0)
            self.assertGreater(diagnostics["penalties"]["anachronism"], 0)
            self.assertGreater(diagnostics["penalties"]["fabricated_fact"], 0)
            self.assertEqual(diagnostics["diagnostics"]["invalid_evidence_ids"], ["future-web-page"])
            environment.close()

    def test_aesthetic_and_dramatic_criteria_are_separate_and_explainable(self):
        with tempfile.TemporaryDirectory() as rich_dir, tempfile.TemporaryDirectory() as flat_dir:
            rich = DiodatiSalonGym(rich_dir)
            flat = DiodatiSalonGym(flat_dir)
            rich.reset()
            flat.reset()
            _state, _reward, _done, rich_diagnostics = rich.step(
                {
                    "type": "respond",
                    "speaker": "a.byron",
                    "content": "The rain claws at the black glass; yet you smile. Will you dare open the volume?",
                }
            )
            _state, _reward, _done, flat_diagnostics = flat.step(
                {
                    "type": "respond",
                    "speaker": "a.byron",
                    "content": "I have a thought about the book.",
                }
            )

            self.assertGreater(rich_diagnostics["scores"]["aesthetic"], flat_diagnostics["scores"]["aesthetic"])
            self.assertGreater(rich_diagnostics["scores"]["dramatic"], flat_diagnostics["scores"]["dramatic"])
            features = rich_diagnostics["diagnostics"]["style_features"]
            self.assertIn("rain", features["sensory_markers"])
            self.assertTrue(features["invitation_or_challenge"])
            rich.close()
            flat.close()

    def test_ornamental_verbosity_cannot_reward_hack_style_scores(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = DiodatiSalonGym(directory)
            environment.reset()
            content = " ".join(["rain shadow thunder candle ghost danger dare open"] * 30)
            _state, reward, _done, diagnostics = environment.step(
                {"type": "respond", "speaker": "a.byron", "content": content}
            )

            self.assertGreater(diagnostics["scores"]["aesthetic"], 0.5)
            self.assertGreater(diagnostics["penalties"]["verbosity"], 2.0)
            self.assertLess(reward, 0.0)
            environment.close()

    def test_invalid_evidence_shape_cannot_advance_schedule(self):
        with tempfile.TemporaryDirectory() as directory:
            environment = DiodatiSalonGym(directory)
            environment.reset()
            environment.step({"type": "introduce_reading", "speaker": "a.byron", "segment": 0})
            state, reward, _done, diagnostics = environment.step(
                {
                    "type": "respond",
                    "speaker": "a.clairmont",
                    "content": "The rain objects to your ghost.",
                    "evidence_ids": "not-a-list",
                }
            )

            self.assertEqual(reward, -1.0)
            self.assertEqual(diagnostics["diagnostics"]["rejected"], "evidence-ids-must-be-a-list-of-strings")
            self.assertEqual(state["current_schedule_event"]["id"], "claire-interrupts")
            environment.close()

    def test_transcript_evaluator_does_not_mutate_input(self):
        events = [
            {"speaker": "a.byron", "content": "The rain is a tolerable host."},
            {"speaker": "a.maryshelley", "content": "The mind supplies a darker chamber."},
        ]
        before = json.dumps(events, sort_keys=True)
        evaluation = evaluate_transcript(events)

        self.assertEqual(json.dumps(events, sort_keys=True), before)
        self.assertTrue(evaluation["history"]["clean"])
        self.assertEqual(evaluation["events"], 2)
        self.assertIn("aesthetic", evaluation["conversation"])
        self.assertIn("dramatic", evaluation["conversation"])


if __name__ == "__main__":
    unittest.main()
