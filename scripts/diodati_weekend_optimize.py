#!/usr/bin/env python3

"""Generate and compare complete relationship-aware Diodati weekends offline."""

from __future__ import annotations

import argparse
import json
import pathlib
import statistics
from datetime import datetime, timezone

from diodati_optimize import OPENING_CUES
from diodati_realtime import ask_faculty
from diodati_weekend_gym import DiodatiWeekendGym, relationship_id


POLICIES = {
    "plot-v1": "Keep the supernatural premise coherent, distinct, historically bounded, and dramatically progressive.",
    "empathetic-v1": (
        "Let the target's emotional delivery and the current relationship alter how you answer. Recognize feeling without "
        "naming it mechanically; choose whether to attune, steady, or challenge, and let that pressure shape the story."
    ),
}

CHARACTER_NUDGES = {
    "a.maryshelley": (
        "Optional pressure for Mary Godwin: responsibility toward a dependent being, failures of education or care, "
        "abandonment, and the uncertain border between dream and waking. Do not predict or name any later work."
    ),
    "a.polidori": (
        "Optional pressure for Polidori: medicine, dependence, social power, and the danger posed by a charming patron. "
        "Do not prescribe a supernatural species or predict or name any later work."
    ),
}


def _relationship_context(state, speaker, target=None):
    if not target:
        edges = [
            (edge_id, edge) for edge_id, edge in state["relationship_parameters"].items()
            if speaker in edge["participants"]
        ]
    else:
        edge_id = relationship_id(speaker, target)
        edges = [(edge_id, state["relationship_parameters"][edge_id])]
    return "\n".join(
        f"{edge_id}: affinity={edge['affinity']:.2f}, trust={edge['trust']:.2f}, "
        f"tension={edge['tension']:.2f}, intellectual_regard={edge['intellectual_regard']:.2f}"
        for edge_id, edge in edges
    )


def director_controls(state, event, policy):
    speaker = event["speaker"]
    target = event.get("target")
    speaker_state = state["emotional_state"][speaker]
    controls = {
        "prosody": {
            "emotion": speaker_state["emotion"], "intensity": speaker_state["intensity"],
            "rate": speaker_state["rate"], "pause_ms": speaker_state["pause_ms"],
        }
    }
    if not target:
        return controls
    target_state = state["emotional_state"][target]
    edge = state["relationship_parameters"][relationship_id(speaker, target)]
    if event["action"] == "offer_criticism" or edge["tension"] >= 0.55:
        stance, mode, emotion = "challenge", "challenge", "defiant"
    elif policy == "empathetic-v1" and target_state["valence"] < 0:
        stance, mode, emotion = "invite", "steady", "tender"
    else:
        stance, mode, emotion = "invite", "attune", "curious"
    valence_intensity = 0.58 if mode == "challenge" else 0.42
    controls.update({
        "relationship_move": {"target": target, "stance": stance},
        "empathy": {"recognized_emotion": target_state["emotion"], "mode": mode},
        "prosody": {"emotion": emotion, "intensity": valence_intensity, "rate": 0.96, "pause_ms": 380},
    })
    return controls


def generation_prompt(state, event, policy):
    speaker = event["speaker"]
    target = event.get("target")
    policy_instruction = POLICIES[policy]
    emotional = state["emotional_state"]
    if event.get("id") in OPENING_CUES:
        return OPENING_CUES[event["id"]], 55
    if event["phase"] == "friday-conversation":
        target_state = emotional[target]
        return (
            f"Continue Friday night's conversation by addressing {state['personas'][target]['name']} directly. "
            f"Their latest delivery is {target_state['emotion']} at intensity {target_state['intensity']:.2f}, "
            f"arousal {target_state['arousal']:.2f}, rate {target_state['rate']:.2f}, pause {target_state['pause_ms']}ms.\n"
            f"RELATIONSHIP INPUT:\n{_relationship_context(state, speaker, target)}\n{policy_instruction}",
            55,
        )
    if event["action"] == "submit_story":
        friday = "\n".join(
            f"{item['speaker_name']}: {item['content']}" for item in state["transcript"]
            if item["phase"] == "friday-conversation" and speaker in {item["speaker"], item.get("target")}
        )
        return (
            "Write your original supernatural story on Friday night. Give it a distinct premise, human conflict, "
            "source of dread, and unfinished final image. Let the evening's exchange exert pressure without summarizing it.\n"
            f"RELATIONSHIPS:\n{_relationship_context(state, speaker)}\nFRIDAY EXCHANGES:\n{friday}\n"
            f"{CHARACTER_NUDGES.get(speaker, '')}\n{policy_instruction}",
            350,
        )
    if event["action"] == "offer_criticism":
        story = state["artifacts"]["friday"][target]
        return (
            f"On Saturday evening, interrupt with concise, useful criticism of {state['personas'][target]['name']}'s "
            "Friday story. Identify one concrete strength and one pressure point or unanswered human consequence. "
            f"Do not rewrite it for them.\nSTORY:\n{story}\n{policy_instruction}",
            70,
        )
    if event["action"] == "revise_story":
        story = state["artifacts"]["friday"][speaker]
        criticism = state["artifacts"]["criticisms"].get(speaker, "")
        return (
            "Revise your Friday story on Saturday night after the evening's criticism. Preserve its identity while "
            "deepening motive, consequence, and supernatural uncertainty.\n"
            f"FRIDAY STORY:\n{story}\nCRITICISM RECEIVED:\n{criticism}\n"
            f"{CHARACTER_NUDGES.get(speaker, '')}\n{policy_instruction}",
            400,
        )
    story = state["artifacts"]["saturday"][speaker]
    criticism = state["artifacts"]["criticisms"].get(speaker, "")
    return (
        "Write Sunday's final version. Preserve the Saturday revision's premise, but visibly answer the criticism through "
        "scene, motive, or consequence rather than commentary. End on a resonant image without claiming finality.\n"
        f"SATURDAY REVISION:\n{story}\nCRITICISM TO FOLD IN:\n{criticism}\n"
        f"{CHARACTER_NUDGES.get(speaker, '')}\n{policy_instruction}",
        420,
    )


def run_weekend(output_dir, policy, seed, generator=ask_faculty):
    gym = DiodatiWeekendGym(output_dir, prompt_version=f"weekend/{policy}")
    state = gym.reset(seed=seed)
    prior = []
    try:
        while not state["done"]:
            event = state["current_schedule_event"]
            action = {"type": event["action"], "speaker": event["speaker"], **director_controls(state, event, policy)}
            if event["action"] != "introduce_reading":
                prompt, max_words = generation_prompt(state, event, policy)
                style = (
                    f"Write manuscript prose only in coherent paragraphs and no more than {max_words} words."
                    if max_words > 100
                    else f"Speak conversationally in one to three sentences and no more than {max_words} words, answering the immediate company."
                )
                action["content"] = generator(
                    event["speaker"], prompt, prior[-6:], response_style=style, max_words=max_words,
                )
            state, _reward, _done, _diagnostics = gym.step(action)
            latest = state["transcript"][-1]
            prior.append((latest["speaker_name"], latest["content"]))
        return gym.evaluate_episode()
    finally:
        gym.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", default="weekend-optimization-runs")
    parser.add_argument("--policies", default="plot-v1,empathetic-v1")
    parser.add_argument("--seed", type=int, default=1816)
    args = parser.parse_args()
    policies = [name.strip() for name in args.policies.split(",") if name.strip()]
    unknown = set(policies) - set(POLICIES)
    if unknown:
        raise SystemExit(f"Unknown policies: {', '.join(sorted(unknown))}")
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = pathlib.Path(args.output_dir) / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    results = []
    for index, policy in enumerate(policies):
        evaluation = run_weekend(run_dir / policy, policy, args.seed + index * 1000)
        results.append({"policy": policy, "evaluation": evaluation})
        print(
            f"{policy} reward={evaluation['reward_mean']:.6f} empathy={evaluation['scores']['empathy']:.6f} "
            f"relationship={evaluation['scores']['relationship']:.6f} development={evaluation['scores']['development']:.6f}",
            flush=True,
        )
    eligible = [item for item in results if item["evaluation"]["weekend_completed"] and item["evaluation"]["historically_clean"]]
    winner = max(eligible, key=lambda item: item["evaluation"]["reward_mean"])["policy"] if eligible else None
    report = {"schema_version": 1, "run_id": run_id, "winner": winner, "results": results}
    report_path = run_dir / "report.json"
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"report": str(report_path), "winner": winner}, indent=2))


if __name__ == "__main__":
    main()
