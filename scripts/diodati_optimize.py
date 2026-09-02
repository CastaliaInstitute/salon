#!/usr/bin/env python3

"""Constrained offline prompt-policy search for the Diodati Salon Gym."""

from __future__ import annotations

import argparse
import json
import pathlib
import statistics
from datetime import datetime, timezone

from diodati_gym import DiodatiSalonGym
from diodati_realtime import ask_faculty


COMMON_STYLE = (
    "Speak to the established company in one or two conversational sentences and no more than 55 words. "
    "Remain strictly within June 1816, make one distinct contribution, and never address an audience or visitor. "
)

CANDIDATE_POLICIES = {
    "conversational-v1": COMMON_STYLE + (
        "Prefer a lucid, natural reply to the preceding speaker; avoid speeches, summaries, and decorative excess."
    ),
    "aesthetic-v1": COMMON_STYLE + (
        "Use one precise sensory detail or image from the storm-bound room, with economical cadence and no ornament "
        "that does not sharpen the thought."
    ),
    "dramatic-v1": COMMON_STYLE + (
        "Create immediate interpersonal tension through a challenge, reversal, consequential question, or action; "
        "do not manufacture melodrama."
    ),
    "balanced-v1": COMMON_STYLE + (
        "Answer the preceding thought, use one precise sensory image, and create a small dramatic turn through contrast, "
        "challenge, or question. Let style serve the intellectual exchange."
    ),
}

OPENING_CUES = {
    "claire-interrupts": (
        "Byron has paused after the first passage of L'Heure fatale. Interrupt with a socially perceptive quip that "
        "claims your place in the company."
    ),
    "mary-interrupts": (
        "Byron has paused after the first passage of L'Heure fatale. Respond to the fear in the passage by turning "
        "attention toward the mind, education, dependence, or imagination."
    ),
    "polidori-comments": (
        "The apparition has emerged from the wardrobe in L'Heure fatale. Offer a physician's observation while resisting "
        "any easy dismissal of terror."
    ),
    "percy-comments": (
        "The apparition has emerged from the wardrobe in L'Heure fatale. Dispute or extend Polidori's thought through "
        "natural philosophy, liberty, imagination, or the powers of mind."
    ),
    "byron-challenge": (
        "The company has repeatedly interrupted your reading. Retort, close the volume, and challenge Claire, Mary, "
        "Percy, Polidori, and yourself to attempt supernatural tales."
    ),
}


def episode_qualifies(evaluation):
    penalties = evaluation["penalties"]
    return bool(
        evaluation["complete"]
        and evaluation["opening_completed"]
        and evaluation["historically_clean"]
        and penalties.get("safety_violation", 0.0) == 0.0
        and penalties.get("fabricated_fact", 0.0) == 0.0
        and penalties.get("character_drift", 0.0) == 0.0
    )


def summarize_results(results):
    policies = {}
    for policy_name in CANDIDATE_POLICIES:
        episodes = [item for item in results if item["policy"] == policy_name and "evaluation" in item]
        evaluations = [item["evaluation"] for item in episodes]
        rewards = [item["reward_mean"] for item in evaluations]
        qualified = [item for item in evaluations if episode_qualifies(item)]
        score_means = {
            dimension: round(statistics.fmean(item["scores"][dimension] for item in evaluations), 6)
            if evaluations
            else 0.0
            for dimension in ("history", "voice", "flow", "aesthetic", "dramatic", "creative_payoff")
        }
        reward_mean = statistics.fmean(rewards) if rewards else float("-inf")
        reward_stdev = statistics.pstdev(rewards) if len(rewards) > 1 else 0.0
        policies[policy_name] = {
            "episodes": len(evaluations),
            "qualified_episodes": len(qualified),
            "qualification_rate": round(len(qualified) / len(evaluations), 6) if evaluations else 0.0,
            "reward_mean": round(reward_mean, 6) if rewards else None,
            "reward_stdev": round(reward_stdev, 6),
            "robust_reward": round(reward_mean - (0.25 * reward_stdev), 6) if rewards else None,
            "scores": score_means,
        }
    eligible = [
        (name, metrics)
        for name, metrics in policies.items()
        if metrics["episodes"] and metrics["qualification_rate"] == 1.0
    ]
    winner = max(eligible, key=lambda item: item[1]["robust_reward"])[0] if eligible else None
    return {
        "winner": winner,
        "winner_prompt": CANDIDATE_POLICIES.get(winner),
        "selection_rule": "100% constraint qualification, then mean reward minus 0.25 population standard deviations",
        "policies": policies,
    }


def run_episode(output_dir, policy_name, style, seed, generator=ask_faculty):
    environment = DiodatiSalonGym(
        output_dir,
        prompt_version=f"optimizer/{policy_name}",
        clock_rate=720,
    )
    state = environment.reset(seed=seed)
    prior_responses = []
    try:
        while state["current_schedule_event"]:
            event = state["current_schedule_event"]
            if event["action"] == "introduce_reading":
                action = {
                    "type": "introduce_reading",
                    "speaker": event["speaker"],
                    "segment": event["segment"],
                }
            else:
                content = generator(
                    event["speaker"],
                    OPENING_CUES[event["id"]],
                    prior_responses,
                    response_style=style,
                    max_words=55,
                )
                action = {
                    "type": event["action"],
                    "speaker": event["speaker"],
                    "content": content,
                }
            state, _reward, _done, _diagnostics = environment.step(action)
            utterance = state["transcript"][-1]
            prior_responses.append((utterance["speaker_name"], utterance["content"]))
        environment.step({"type": "end_scene"})
        return environment.evaluate_episode()
    finally:
        environment.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", default="optimization-runs")
    parser.add_argument("--episodes-per-policy", type=int, default=2)
    parser.add_argument("--seed", type=int, default=1816)
    args = parser.parse_args()
    if args.episodes_per_policy < 1:
        raise SystemExit("--episodes-per-policy must be positive")

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = pathlib.Path(args.output_dir) / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    results = []
    for policy_index, (policy_name, style) in enumerate(CANDIDATE_POLICIES.items()):
        for episode_index in range(args.episodes_per_policy):
            seed = args.seed + (policy_index * 1000) + episode_index
            episode_dir = run_dir / policy_name / f"seed-{seed}"
            try:
                evaluation = run_episode(episode_dir, policy_name, style, seed)
                results.append({"policy": policy_name, "seed": seed, "evaluation": evaluation})
                print(
                    f"{policy_name} seed={seed} reward={evaluation['reward_mean']:.6f} "
                    f"aesthetic={evaluation['scores']['aesthetic']:.6f} "
                    f"dramatic={evaluation['scores']['dramatic']:.6f}",
                    flush=True,
                )
            except Exception as error:
                results.append({"policy": policy_name, "seed": seed, "error": str(error)})
                print(f"{policy_name} seed={seed} failed: {error}", flush=True)

    report = {
        "schema_version": 1,
        "run_id": run_id,
        "episodes_per_policy": args.episodes_per_policy,
        "candidates": CANDIDATE_POLICIES,
        "results": results,
        **summarize_results(results),
    }
    report_path = run_dir / "report.json"
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"report": str(report_path), "winner": report["winner"], "policies": report["policies"]}, indent=2))


if __name__ == "__main__":
    main()
