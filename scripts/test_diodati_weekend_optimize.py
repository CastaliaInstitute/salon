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

    def test_byron_is_directed_toward_darvell_but_not_a_finished_future_work(self):
        byron = CHARACTER_NUDGES["a.byron"]
        self.assertIn("Augustus Darvell", byron)
        self.assertIn("permanently incomplete", byron)
        self.assertNotIn("1819", byron)
        self.assertNotIn("A Fragment", byron)
        self.assertNotIn("vampire", byron.lower())
        self.assertIn("Do not give the tale a title", byron)

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
