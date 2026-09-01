#!/usr/bin/env python3

"""Regression tests for Villa Diodati's June 1816 knowledge boundary."""

import os
import unittest
from datetime import datetime
from zoneinfo import ZoneInfo


os.environ.setdefault("DIODATI_ROOM_ID", "test-room")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")

from diodati_realtime import (  # noqa: E402
    MEMBER_BRIDGE_USER,
    find_anachronisms,
    is_registered_event,
    redact_future_leaks,
    scheduled_cycle_start,
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

    def test_cycle_waits_for_friday_evening(self):
        mountain = ZoneInfo("America/Denver")
        tuesday = datetime(2026, 9, 1, 12, 0, tzinfo=mountain).timestamp()
        opening = datetime.fromtimestamp(scheduled_cycle_start(tuesday), mountain)
        self.assertEqual(opening, datetime(2026, 9, 4, 18, 0, tzinfo=mountain))

    def test_friday_cycle_remains_open_for_three_days(self):
        mountain = ZoneInfo("America/Denver")
        sunday = datetime(2026, 9, 6, 12, 0, tzinfo=mountain).timestamp()
        opening = datetime.fromtimestamp(scheduled_cycle_start(sunday), mountain)
        self.assertEqual(opening, datetime(2026, 9, 4, 18, 0, tzinfo=mountain))

    def test_cycle_advances_after_monday_evening(self):
        mountain = ZoneInfo("America/Denver")
        monday = datetime(2026, 9, 7, 18, 1, tzinfo=mountain).timestamp()
        opening = datetime.fromtimestamp(scheduled_cycle_start(monday), mountain)
        self.assertEqual(opening, datetime(2026, 9, 11, 18, 0, tzinfo=mountain))


if __name__ == "__main__":
    unittest.main()
