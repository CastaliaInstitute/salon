#!/usr/bin/env python3

"""Regression tests for Villa Diodati's curated pre-cutoff RAG corpus."""

import copy
import os
import pathlib
import unittest


os.environ.setdefault("DIODATI_ROOM_ID", "test-room")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")

from diodati_realtime import (  # noqa: E402
    LOCAL_RAG_PATH,
    load_rag_corpus,
    retrieve_rag_context,
    validate_rag_corpus,
)


class DiodatiRagTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.corpus = load_rag_corpus(LOCAL_RAG_PATH)

    def test_every_character_has_approved_pre_cutoff_primary_material(self):
        validated = validate_rag_corpus(self.corpus)
        self.assertTrue(all(validated["characters"].values()))

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

    def test_unapproved_fixture_is_rejected(self):
        unsafe = copy.deepcopy(self.corpus)
        unsafe["characters"]["a.byron"][0]["approval_status"] = "pending"
        with self.assertRaisesRegex(ValueError, "Unapproved"):
            validate_rag_corpus(unsafe)

    def test_future_language_in_source_text_is_rejected(self):
        unsafe = copy.deepcopy(self.corpus)
        unsafe["characters"]["a.shelley"][0]["text"] += " Frankenstein"
        with self.assertRaisesRegex(ValueError, "Anachronistic"):
            validate_rag_corpus(unsafe)


if __name__ == "__main__":
    unittest.main()
