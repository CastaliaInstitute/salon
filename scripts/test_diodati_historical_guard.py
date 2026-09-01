#!/usr/bin/env python3

"""Regression tests for Villa Diodati's June 1816 knowledge boundary."""

import os
import unittest


os.environ.setdefault("DIODATI_ROOM_ID", "test-room")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")

from diodati_realtime import (  # noqa: E402
    MEMBER_BRIDGE_USER,
    find_anachronisms,
    is_registered_event,
    redact_future_leaks,
)


class HistoricalGuardTests(unittest.TestCase):
    def test_period_safe_language_passes(self):
        self.assertEqual(
            find_anachronisms("Mary Godwin discusses natural philosophy in June 1816."),
            [],
        )

    def test_known_future_leaks_are_detected(self):
        violations = find_anachronisms(
            "Mary Shelley published Frankenstein after Tambora's volcanic ash darkened 1818."
        )
        self.assertIn("Mary Shelley", violations)
        self.assertIn("Frankenstein", violations)
        self.assertIn("unknown weather cause", violations)
        self.assertIn("post-1816 year", violations)

    def test_future_details_are_removed_before_generation(self):
        redacted = redact_future_leaks(
            "Mary Shelley will marry Percy in 1817 and publish Frankenstein."
        ).lower()
        for forbidden in ("mary shelley", "marry percy", "1817", "frankenstein"):
            self.assertNotIn(forbidden, redacted)

    def test_only_verified_bridge_events_count_as_registered(self):
        verified = {
            "sender": MEMBER_BRIDGE_USER,
            "content": {
                "org.castalia.member_verified": True,
                "org.castalia.member_user_id": "member-id",
            },
        }
        unverified = {
            "sender": MEMBER_BRIDGE_USER,
            "content": {"org.castalia.member_verified": False},
        }
        self.assertTrue(is_registered_event(verified))
        self.assertFalse(is_registered_event(unverified))


if __name__ == "__main__":
    unittest.main()
