import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, badgeLabel } from '../src/scripts/salon-schedule/engine.mjs';

const season = JSON.parse(
  (await import('node:fs')).readFileSync(
    new URL('../src/data/villa-diodati/season-2026-10.json', import.meta.url),
    'utf8',
  ),
);
const windows = season.windows;
const map = season.replayDayMapping;

function at(date, weekday) {
  return evaluate(windows, map, { zurichDate: date, weekday });
}

test('upcoming before w1 with next start', () => {
  const s = at('2026-09-28', 'Monday');
  assert.equal(s.state, 'upcoming');
  assert.equal(s.nextWindowStartDate, '2026-10-02');
});

test('w1 each day maps correctly', () => {
  assert.equal(at('2026-10-02', 'Friday').replayDayId, 'day-1');
  assert.equal(at('2026-10-03', 'Saturday').replayDayId, 'day-2');
  assert.equal(at('2026-10-04', 'Sunday').replayDayId, 'day-3');
});

test('between w1 and w2 upcoming points at w2', () => {
  const s = at('2026-10-05', 'Monday');
  assert.equal(s.state, 'upcoming');
  assert.equal(s.nextWindowStartDate, '2026-10-09');
});

test('DST-end day (Oct 25, w4 Sunday) still playing', () => {
  const s = at('2026-10-25', 'Sunday');
  assert.equal(s.state, 'playing');
  assert.equal(s.replayDayId, 'day-3');
});

test('CET-boundary day (Oct 30, w5 Friday) playing', () => {
  const s = at('2026-10-30', 'Friday');
  assert.equal(s.state, 'playing');
  assert.equal(s.replayDayId, 'day-1');
});

test('weekday that falls outside mapping surfaces playing with no day', () => {
  const s = at('2026-10-27', 'Tuesday');
  assert.equal(s.state, 'upcoming');
  assert.equal(s.nextWindowStartDate, '2026-10-30');
});

test('archived after w5', () => {
  const s = at('2026-11-02', 'Monday');
  assert.deepEqual(s, { state: 'archived', windowId: null, replayDayId: null, nextWindowStartDate: null });
});

test('gap guard: non-window weekdays inside none-of-the-windows fall through to upcoming', () => {
  const s = at('2026-10-19', 'Monday');
  assert.equal(s.state, 'upcoming');
  assert.equal(s.nextWindowStartDate, '2026-10-23');
});

test('badge copy', () => {
  assert.equal(badgeLabel({ state: 'playing', replayDayId: 'day-2' }, { dayNumber: 2 }), 'Playing now · Day 2');
  assert.equal(badgeLabel({ state: 'upcoming' }, { nextWindowStartDate: '2026-10-09' }).includes('Opens Fri 10/9'), true);
  assert.equal(badgeLabel({ state: 'archived' }, {}), 'Season closed');
});
