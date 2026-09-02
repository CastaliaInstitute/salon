#!/usr/bin/env python3

"""Regression tests for Villa Diodati's curated pre-cutoff RAG corpus."""

import copy
import json
import os
import pathlib
import unittest
import tempfile
from unittest import mock


os.environ.setdefault("DIODATI_ROOM_ID", "test-room")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")

import diodati_realtime  # noqa: E402
from diodati_realtime import (  # noqa: E402
    LOCAL_RAG_PATH,
    load_rag_corpus,
    manuscript_distinctness,
    generate_character_draft,
    find_draft_anachronisms,
    draft_prompt,
    criticism_prompt,
    publish_due_criticisms,
    publish_due_drafts,
    retrieve_rag_context,
    run_opening,
    validate_rag_corpus,
)


class DiodatiRagTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.corpus = load_rag_corpus(LOCAL_RAG_PATH)

    def test_every_character_has_approved_pre_cutoff_primary_material(self):
        validated = validate_rag_corpus(self.corpus)
        self.assertTrue(all(validated["characters"].values()))

    def test_opening_is_the_1812_fantasmagoriana_reading(self):
        reading = self.corpus["salon_readings"][0]
        self.assertEqual(reading["id"], "fantasmagoriana-heure-fatale")
        self.assertEqual(len(reading["segments"]), 2)
        self.assertIn("Une pluie affreuse", reading["segments"][0]["text"])
        self.assertIn("mon image fidelle", reading["segments"][1]["text"])

    def test_opening_alternates_readings_and_interruptions(self):
        bots = {
            faculty_id: {"access_token": faculty_id}
            for faculty_id, _ in diodati_realtime.CAST
        }
        sent = []

        with (
            mock.patch.object(
                diodati_realtime,
                "send_message",
                side_effect=lambda token, body, cycle_id=None: sent.append((token, body, cycle_id)),
            ),
            mock.patch.object(
                diodati_realtime,
                "ask_faculty",
                side_effect=lambda faculty_id, *_args, **_kwargs: f"{faculty_id} interrupts",
            ) as ask_mock,
            mock.patch.object(diodati_realtime.time, "sleep"),
        ):
            run_opening(bots)

        self.assertEqual(
            [token for token, _, _ in sent],
            ["a.byron", "a.clairmont", "a.maryshelley", "a.byron", "a.polidori", "a.shelley", "a.byron"],
        )
        self.assertTrue(sent[0][1].startswith("📖 From Fantasmagoriana"))
        self.assertTrue(sent[3][1].startswith("📖 From Fantasmagoriana"))
        closing_prompt = ask_mock.call_args_list[-1].args[1]
        for name in ("Mary Godwin", "Claire", "Shelley", "Polidori"):
            self.assertIn(name, closing_prompt)

    def test_opening_carries_the_three_day_cycle_identity(self):
        bots = {
            faculty_id: {"access_token": faculty_id}
            for faculty_id, _ in diodati_realtime.CAST
        }
        cycle_ids = []
        with (
            mock.patch.object(
                diodati_realtime,
                "send_message",
                side_effect=lambda _token, _body, cycle_id=None: cycle_ids.append(cycle_id),
            ),
            mock.patch.object(diodati_realtime, "ask_faculty", return_value="A period-safe interruption."),
            mock.patch.object(diodati_realtime.time, "sleep"),
        ):
            run_opening(bots, "cycle-test")

        self.assertTrue(cycle_ids)
        self.assertEqual(set(cycle_ids), {"cycle-test"})

    def test_cast_uses_canonical_facultai_identities(self):
        self.assertEqual(
            [faculty_id for faculty_id, _ in diodati_realtime.CAST],
            ["a.byron", "a.maryshelley", "a.clairmont", "a.shelley", "a.polidori"],
        )

    def test_byron_exile_query_retrieves_childe_harold(self):
        chunks = retrieve_rag_context("a.byron", "Speak of exile, satiety, and leaving home.", corpus=self.corpus)
        self.assertTrue(chunks)
        self.assertTrue(chunks[0]["id"].startswith("byron-childe-harold"))

    def test_polidori_principles_query_retrieves_june_15_diary(self):
        chunks = retrieve_rag_context(
            "a.polidori",
            "Is man an instrument, or does he possess agency and free will?",
            corpus=self.corpus,
        )
        self.assertEqual(chunks[0]["id"], "polidori-diary-1816-06-15-principles")

    def test_irrelevant_query_fails_closed(self):
        self.assertEqual(
            retrieve_rag_context("a.clairmont", "Discuss mineral crystallography.", corpus=self.corpus),
            [],
        )

    def test_post_cutoff_fixture_is_rejected(self):
        unsafe = copy.deepcopy(self.corpus)
        unsafe["characters"]["a.clairmont"][0]["content_date"] = "1816-06-16"
        with self.assertRaisesRegex(ValueError, "Post-cutoff"):
            validate_rag_corpus(unsafe)

    def test_post_cutoff_opening_reading_is_rejected(self):
        unsafe = copy.deepcopy(self.corpus)
        unsafe["salon_readings"][0]["content_date"] = "1816-06-16"
        with self.assertRaisesRegex(ValueError, "Post-cutoff"):
            validate_rag_corpus(unsafe)

    def test_unapproved_fixture_is_rejected(self):
        unsafe = copy.deepcopy(self.corpus)
        unsafe["characters"]["a.byron"][0]["approval_status"] = "pending"
        with self.assertRaisesRegex(ValueError, "Unapproved"):
            validate_rag_corpus(unsafe)

    def test_future_language_in_source_text_is_rejected(self):
        unsafe = copy.deepcopy(self.corpus)
        unsafe["characters"]["a.maryshelley"][0]["text"] += " Frankenstein"
        with self.assertRaisesRegex(ValueError, "Anachronistic"):
            validate_rag_corpus(unsafe)

    def test_character_draft_is_written_through_ask_faculty(self):
        with mock.patch.object(
            diodati_realtime,
            "ask_faculty",
            return_value="The candle failed, though no wind had entered the room.",
        ) as ask_mock:
            manuscript = generate_character_draft("a.maryshelley", "saturday")

        self.assertIn("candle", manuscript)
        self.assertEqual(ask_mock.call_args.args[0], "a.maryshelley")
        self.assertEqual(ask_mock.call_args.kwargs["max_words"], diodati_realtime.DRAFT_MAX_WORDS)
        self.assertIn("manuscript prose", ask_mock.call_args.kwargs["response_style"])

    def test_polidori_draft_guard_rejects_later_vampire_trajectory(self):
        self.assertIn(
            "Polidori later vampire trajectory",
            find_draft_anachronisms("a.polidori", "A vampire entered the room."),
        )
        self.assertNotIn(
            "Polidori later vampire trajectory",
            find_draft_anachronisms("a.byron", "A vampire entered the room."),
        )

    def test_draft_guard_rejects_generic_future_framing(self):
        self.assertIn(
            "post-1816 manuscript framing",
            find_draft_anachronisms("a.clairmont", "A modern voice promised the future would remember her."),
        )

    def test_manuscript_distinctness_fails_for_near_duplicates(self):
        self.assertLess(
            manuscript_distinctness(
                "The candle burned in the room and the hidden pulse answered.",
                ["The candle burned in the room and the hidden pulse answered again."],
            ),
            diodati_realtime.DRAFT_MIN_DISTINCTNESS,
        )
        self.assertGreaterEqual(
            manuscript_distinctness(
                "A physician charts the patient's fever by the lake.",
                ["A woman hears music beyond a locked theatre door."],
            ),
            diodati_realtime.DRAFT_MIN_DISTINCTNESS,
        )

    def test_runtime_draft_publisher_does_not_publish_near_duplicate_story(self):
        bots = {
            "a.byron": {"access_token": "byron-token"},
            "a.maryshelley": {"access_token": "mary-token"},
        }
        cycle = {"id": "diodati-400", "started_at": 400, "opening_complete": True}
        sent = []
        with tempfile.TemporaryDirectory() as directory:
            cycle_path = pathlib.Path(directory) / "cycle.json"
            with (
                mock.patch.object(diodati_realtime, "CAST", [("a.byron", "Lord Byron"), ("a.maryshelley", "Mary Godwin")]),
                mock.patch.object(
                    diodati_realtime,
                    "DRAFT_STAGES",
                    ({"id": "friday", "revision": 1, "offset_seconds": 10, "label": "Friday leaves"},),
                ),
                mock.patch.object(
                    diodati_realtime,
                    "generate_character_draft",
                    return_value="The candle burned in the room and the hidden pulse answered.",
                ),
                mock.patch.object(
                    diodati_realtime,
                    "send_message",
                    side_effect=lambda token, body, cycle_id=None, **kwargs: sent.append(token),
                ),
            ):
                diodati_realtime.publish_due_drafts(bots, cycle, cycle_path, now=411)
            self.assertEqual(sent, ["byron-token"])
            self.assertEqual(cycle["published_drafts"], ["friday:a.byron"])

    def test_byron_draft_develops_darvell_and_must_remain_unfinished(self):
        saturday = draft_prompt("a.byron", "saturday")
        sunday = draft_prompt("a.byron", "sunday", "Earlier leaves")
        for prompt in (saturday, sunday):
            self.assertIn("Augustus Darvell", prompt)
            self.assertIn("permanently incomplete", prompt)
            self.assertNotIn("A Fragment", prompt)
            self.assertNotIn("1819", prompt)
            self.assertNotIn("the vampyre", prompt.lower())
        self.assertIn("Earlier leaves", sunday)
        self.assertIn("Criticism received", draft_prompt("a.byron", "sunday", "Earlier leaves", "Criticism received"))

    def test_each_character_has_a_distinct_period_safe_story_direction(self):
        prompts = {
            faculty_id: draft_prompt(faculty_id, "friday")
            for faculty_id, _ in diodati_realtime.CAST
        }
        self.assertEqual(len(set(prompts.values())), len(diodati_realtime.CAST))
        for faculty_id, prompt in prompts.items():
            self.assertIn("June 1816", prompt)
            self.assertIn("distinct", prompt)
            self.assertNotIn("Frankenstein", prompt)
            self.assertNotIn("the vampyre", prompt.lower())
        self.assertIn("Augustus Darvell", prompts["a.byron"])
        self.assertIn("medical-gothic", prompts["a.polidori"])

    def test_live_draft_arc_starts_friday_and_revises_each_manuscript(self):
        self.assertEqual(
            [stage["id"] for stage in diodati_realtime.DRAFT_STAGES],
            ["friday", "saturday", "sunday"],
        )
        self.assertEqual(
            [stage["revision"] for stage in diodati_realtime.DRAFT_STAGES],
            [1, 2, 3],
        )

    def test_saturday_and_sunday_publish_clickable_matrix_artifacts_once(self):
        bots = {
            faculty_id: {"access_token": faculty_id}
            for faculty_id, _ in diodati_realtime.CAST
        }
        cycle = {
            "id": "diodati-100",
            "started_at": 100,
            "opening_complete": True,
        }
        sent = []

        with tempfile.TemporaryDirectory() as directory:
            cycle_path = pathlib.Path(directory) / "cycle.json"
            with (
                mock.patch.object(
                    diodati_realtime,
                    "DRAFT_STAGES",
                    (
                        {"id": "saturday", "revision": 1, "offset_seconds": 10, "label": "Saturday leaves"},
                        {"id": "sunday", "revision": 2, "offset_seconds": 20, "label": "Sunday revision"},
                    ),
                ),
                mock.patch.object(
                    diodati_realtime,
                    "generate_character_draft",
                    side_effect=lambda faculty_id, stage_id, saturday_text=None: (
                        f"{stage_id} manuscript by {faculty_id}; earlier={bool(saturday_text)}"
                    ),
                ) as generate_mock,
                mock.patch.object(
                    diodati_realtime,
                    "send_message",
                    side_effect=lambda token, body, cycle_id=None, **kwargs: sent.append(
                        (token, body, cycle_id, kwargs)
                    ),
                ),
            ):
                publish_due_drafts(bots, cycle, cycle_path, now=111)
                publish_due_drafts(bots, cycle, cycle_path, now=111)
                self.assertEqual(len(sent), 5)
                self.assertTrue(all(item[3]["metadata"]["org.castalia.diodati_draft"]["stage"] == "saturday" for item in sent))

                publish_due_drafts(bots, cycle, cycle_path, now=121)

            self.assertEqual(len(sent), 10)
            self.assertEqual(generate_mock.call_count, 10)
            sunday_calls = generate_mock.call_args_list[5:]
            self.assertTrue(all(call.kwargs["saturday_text"] for call in sunday_calls))
            self.assertEqual(len(set(item[3]["transaction_id"] for item in sent)), 10)
            stored = json.loads(cycle_path.read_text(encoding="utf-8"))
            self.assertEqual(len(stored["published_drafts"]), 10)
            self.assertEqual(set(stored["draft_texts"]), {"saturday", "sunday"})

    def test_full_live_scheduler_publishes_fifteen_chained_manuscripts(self):
        bots = {
            faculty_id: {"access_token": faculty_id}
            for faculty_id, _ in diodati_realtime.CAST
        }
        cycle = {"id": "diodati-200", "started_at": 200, "opening_complete": True}
        sent = []
        generated = []

        def generate(faculty_id, stage_id, saturday_text=None):
            generated.append((faculty_id, stage_id, saturday_text))
            return f"{faculty_id} {stage_id} manuscript"

        with tempfile.TemporaryDirectory() as directory:
            cycle_path = pathlib.Path(directory) / "cycle.json"
            with (
                mock.patch.object(diodati_realtime, "generate_character_draft", side_effect=generate),
                mock.patch.object(
                    diodati_realtime,
                    "send_message",
                    side_effect=lambda token, body, cycle_id=None, **kwargs: sent.append(
                        (token, body, cycle_id, kwargs)
                    ),
                ),
            ):
                diodati_realtime.publish_due_drafts(
                    bots, cycle, cycle_path, now=200 + 48 * 60 * 60 + 1
                )

        self.assertEqual(len(sent), 15)
        self.assertEqual(len(generated), 15)
        self.assertEqual(
            [item[3]["metadata"]["org.castalia.diodati_draft"]["stage"] for item in sent].count("friday"),
            5,
        )
        self.assertEqual(
            [item[3]["metadata"]["org.castalia.diodati_draft"]["stage"] for item in sent].count("saturday"),
            5,
        )
        self.assertEqual(
            [item[3]["metadata"]["org.castalia.diodati_draft"]["stage"] for item in sent].count("sunday"),
            5,
        )
        self.assertTrue(all(item[2] is None for item in generated[:5]))
        self.assertTrue(all(item[2] for item in generated[5:]))

    def test_saturday_criticism_publishes_once_for_each_target(self):
        bots = {faculty_id: {"access_token": faculty_id} for faculty_id, _ in diodati_realtime.CAST}
        cycle = {
            "id": "diodati-300", "started_at": 300, "opening_complete": True,
            "draft_texts": {"friday": {faculty_id: f"{faculty_id} story" for faculty_id, _ in diodati_realtime.CAST}},
        }
        sent = []
        with tempfile.TemporaryDirectory() as directory:
            cycle_path = pathlib.Path(directory) / "cycle.json"
            with (
                mock.patch.object(diodati_realtime, "ask_faculty", return_value="A strength, but the motive needs pressure."),
                mock.patch.object(
                    diodati_realtime,
                    "send_message",
                    side_effect=lambda token, body, cycle_id=None, **kwargs: sent.append((token, body, cycle_id, kwargs)),
                ),
            ):
                publish_due_criticisms(
                    bots, cycle, cycle_path,
                    now=300 + diodati_realtime.CRITICISM_OFFSET_SECONDS,
                )
                publish_due_criticisms(
                    bots, cycle, cycle_path,
                    now=300 + diodati_realtime.CRITICISM_OFFSET_SECONDS + 1,
                )
            self.assertEqual(len(sent), 5)
            self.assertEqual(len(cycle["published_criticisms"]), 5)
            self.assertTrue(all(item[3]["metadata"]["org.castalia.diodati_criticism"]["generated_by"] == "ask-faculty" for item in sent))
    def test_failed_matrix_send_reuses_the_persisted_endpoint_draft(self):
        cycle = {"id": "diodati-100", "started_at": 100, "opening_complete": True}
        bots = {"a.byron": {"access_token": "token"}}
        with tempfile.TemporaryDirectory() as directory:
            cycle_path = pathlib.Path(directory) / "cycle.json"
            with (
                mock.patch.object(diodati_realtime, "CAST", [("a.byron", "Lord Byron")]),
                mock.patch.object(
                    diodati_realtime,
                    "DRAFT_STAGES",
                    ({"id": "saturday", "revision": 1, "offset_seconds": 10, "label": "Saturday leaves"},),
                ),
                mock.patch.object(
                    diodati_realtime,
                    "generate_character_draft",
                    return_value="The one and only generated manuscript.",
                ) as generate_mock,
                mock.patch.object(
                    diodati_realtime,
                    "send_message",
                    side_effect=[RuntimeError("Matrix unavailable"), None],
                ) as send_mock,
            ):
                publish_due_drafts(bots, cycle, cycle_path, now=111)
                publish_due_drafts(bots, cycle, cycle_path, now=112)

            self.assertEqual(generate_mock.call_count, 1)
            self.assertEqual(send_mock.call_count, 2)
            self.assertEqual(send_mock.call_args_list[0].args[1], send_mock.call_args_list[1].args[1])
            stored = json.loads(cycle_path.read_text(encoding="utf-8"))
            self.assertEqual(stored["published_drafts"], ["saturday:a.byron"])


if __name__ == "__main__":
    unittest.main()
