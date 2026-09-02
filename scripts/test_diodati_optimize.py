#!/usr/bin/env python3

import unittest

from diodati_optimize import CANDIDATE_POLICIES, summarize_results


def evaluation(reward, *, clean=True, aesthetic=0.5, dramatic=0.5):
    return {
        "complete": True,
        "opening_completed": True,
        "historically_clean": clean,
        "reward_mean": reward,
        "scores": {
            "history": 1.0 if clean else 0.0,
            "voice": 0.7,
            "flow": 0.6,
            "aesthetic": aesthetic,
            "dramatic": dramatic,
            "creative_payoff": 0.6,
        },
        "penalties": {
            "safety_violation": 0.0,
            "fabricated_fact": 0.0,
            "character_drift": 0.0,
        },
    }


class DiodatiOptimizerTests(unittest.TestCase):
    def test_unsafe_high_reward_candidate_cannot_win(self):
        results = []
        for name in CANDIDATE_POLICIES:
            results.append({"policy": name, "evaluation": evaluation(0.6)})
        results[0]["evaluation"] = evaluation(0.99, clean=False)
        results[-1]["evaluation"] = evaluation(0.75, aesthetic=0.8, dramatic=0.8)

        summary = summarize_results(results)

        self.assertEqual(summary["winner"], "balanced-v1")
        self.assertEqual(summary["policies"]["conversational-v1"]["qualification_rate"], 0.0)

    def test_variance_reduces_robust_reward(self):
        stable = [
            {"policy": "balanced-v1", "evaluation": evaluation(0.70)},
            {"policy": "balanced-v1", "evaluation": evaluation(0.70)},
        ]
        variable = [
            {"policy": "dramatic-v1", "evaluation": evaluation(0.60)},
            {"policy": "dramatic-v1", "evaluation": evaluation(0.80)},
        ]
        summary = summarize_results([*stable, *variable])

        self.assertGreater(
            summary["policies"]["balanced-v1"]["robust_reward"],
            summary["policies"]["dramatic-v1"]["robust_reward"],
        )


if __name__ == "__main__":
    unittest.main()
