#!/usr/bin/env python3

"""Regression tests for Villa Diodati's curated pre-cutoff RAG corpus."""

import copy
import os
import pathlib
import unittest
from unittest import mock


os.environ.setdefault("DIODATI_ROOM_ID", "test-room")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")

import diodati_realtime  # noqa: E402
from diodati_realtime import (  # noqa: E402
    LOCAL_RAG_PATH,
    load_rag_corpus,
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


if __name__ == "__main__":
    unittest.main()
