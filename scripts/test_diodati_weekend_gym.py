#!/usr/bin/env python3

import tempfile
import unittest

from diodati_weekend_gym import (
    DiodatiWeekendGym,
    WEEKEND_SCHEDULE,
    WEEKEND_WEIGHTS,
    byron_fragment_diagnostics,
)


def content_for(event):
    if event["action"] == "submit_story":
        return "In the rain-dark chamber, a proud host opened a forbidden volume, yet the physician heard a second pulse inside the wall."
    if event["action"] in {"revise_story", "finalize_story"}:
        return "The host opened the volume again; the hidden pulse answered, and trust failed when the physician named the living hand behind the wall."
    if event["action"] == "offer_criticism":
        return "Your hidden pulse is vivid, but will you show why the physician risks his trust?"
    return "The rain challenges your claim, yet will you answer me before the candle fails?"


def action_for(event, state):
    action = {
        "type": event["action"], "speaker": event["speaker"],
        "prosody": {"emotion": "curious", "intensity": 0.5, "rate": 0.96, "pause_ms": 360},
    }
    if event["action"] != "introduce_reading":
        action["content"] = content_for(event)
    if event.get("target"):
        action["relationship_move"] = {"target": event["target"], "stance": "challenge"}
        action["empathy"] = {
            "recognized_emotion": state["emotional_state"][event["target"]]["emotion"],
            "mode": "challenge",
        }
    return action


class DiodatiWeekendGymTests(unittest.TestCase):
    def test_weights_are_normalized(self):
        self.assertAlmostEqual(sum(WEEKEND_WEIGHTS.values()), 1.0)

    def test_byron_fragment_verifier_rewards_shape_without_completion(self):
        diagnostics = byron_fragment_diagnostics(
            "I journeyed east with Augustus Darvell. His failing strength brought us to a cemetery, "
            "where he pressed a ring upon me and demanded an oath."
        )
        self.assertEqual(diagnostics["motif_score"], 1.0)
        self.assertTrue(diagnostics["unfinished"])

    def test_byron_fragment_verifier_rejects_a_resolved_return(self):
        diagnostics = byron_fragment_diagnostics(
            "Augustus Darvell returned from the grave and explained every secret.\nThe End"
        )
        self.assertFalse(diagnostics["unfinished"])
        self.assertIn("resolved return", diagnostics["forbidden_resolutions"])
        self.assertIn("explicit completion", diagnostics["forbidden_resolutions"])

    def test_approved_reading_is_exempt_from_dialogue_verbosity(self):
        with tempfile.TemporaryDirectory() as directory:
            gym = DiodatiWeekendGym(directory)
            state = gym.reset()
            event = state["current_schedule_event"]
            _state, _reward, _done, diagnostics = gym.step(action_for(event, state))
            self.assertEqual(diagnostics["penalties"]["verbosity"], 0.0)
            gym.close()

    def test_relationship_parameters_are_inputs_and_realized_deltas_are_outputs(self):
        with tempfile.TemporaryDirectory() as directory:
            gym = DiodatiWeekendGym(directory)
            state = gym.reset()
            self.assertIn("byron-polidori", state["relationship_parameters"])
            while state["current_schedule_event"]["phase"] == "friday-opening":
                event = state["current_schedule_event"]
                state, _reward, _done, _diagnostics = gym.step(action_for(event, state))
            event = state["current_schedule_event"]
            before = state["relationship_parameters"]["claire-byron"]["tension"]
            state, _reward, _done, diagnostics = gym.step(action_for(event, state))
            output = diagnostics["relationship_output"]
            self.assertEqual(output["relationship_id"], "claire-byron")
            self.assertTrue(output["congruent"])
            self.assertGreater(state["relationship_parameters"]["claire-byron"]["tension"], before)
            gym.close()

    def test_complete_weekend_produces_saturday_and_sunday_artifacts(self):
        with tempfile.TemporaryDirectory() as directory:
            gym = DiodatiWeekendGym(directory)
            state = gym.reset()
            while not state["done"]:
                event = state["current_schedule_event"]
                state, _reward, _done, _diagnostics = gym.step(action_for(event, state))
            evaluation = gym.evaluate_episode()
            self.assertEqual(evaluation["turns"], len(WEEKEND_SCHEDULE))
            self.assertTrue(evaluation["weekend_completed"])
            self.assertEqual(len(evaluation["artifacts"]["friday"]), 5)
            self.assertEqual(len(evaluation["artifacts"]["criticisms"]), 5)
            self.assertEqual(len(evaluation["artifacts"]["saturday"]), 5)
            self.assertEqual(len(evaluation["artifacts"]["sunday"]), 5)
            self.assertTrue(evaluation["story_quality"]["all_five_characters_complete"])
            self.assertTrue(evaluation["story_quality"]["all_stages_historically_clean"])
            # The fixture deliberately reuses one manuscript shape for every
            # character; the evaluator must expose that quality failure.
            self.assertFalse(evaluation["story_quality"]["all_stages_materially_distinct"])
            self.assertFalse(evaluation["story_quality"]["a_plus_story_gate"])
            self.assertGreater(evaluation["scores"]["relationship"], 0.5)
            self.assertGreater(evaluation["scores"]["development"], 0.3)
            self.assertGreater(evaluation["scores"]["empathy"], 0.5)


if __name__ == "__main__":
    unittest.main()
