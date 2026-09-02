#!/usr/bin/env python3

import unittest

from diodati_weekend_optimize import CHARACTER_NUDGES, director_controls, generation_prompt
from diodati_weekend_gym import DiodatiWeekendGym


class WeekendOptimizerTests(unittest.TestCase):
    def test_gentle_nudges_for_mary_godwin_and_polidori_are_non_teleological(self):
        mary = CHARACTER_NUDGES["a.maryshelley"]
        polidori = CHARACTER_NUDGES["a.polidori"]
        self.assertIn("Mary Godwin", mary)
        self.assertNotIn("Frankenstein", mary)
        self.assertIn("medicine", polidori)
        self.assertNotIn("vampire", polidori.lower())

    def test_emotional_prosody_is_consumed_as_policy_input(self):
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            gym = DiodatiWeekendGym(directory)
            state = gym.reset()
            event = {"speaker": "a.clairmont", "target": "a.byron", "action": "respond", "phase": "friday-conversation"}
            prompt, _max_words = generation_prompt(state, event, "empathetic-v1")
            controls = director_controls(state, event, "empathetic-v1")
            self.assertIn("latest delivery", prompt)
            self.assertEqual(controls["empathy"]["recognized_emotion"], state["emotional_state"]["a.byron"]["emotion"])
            gym.close()


if __name__ == "__main__":
    unittest.main()
