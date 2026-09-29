/**
 * Pure season-state engine for the Villa Diodati salon weekends.
 * All date logic uses Europe/Zurich calendar-date strings (YYYY-MM-DD) computed
 * by the calling page via Intl, so DST transitions never touch this code.
 *
 * evaluate(windows, playDayMap, nowInfo) -> state object
 */
export function evaluate(windows, playDayMap, nowInfo) {
  if (!Array.isArray(windows) || windows.length === 0) {
    throw new Error('salon-schedule: windows data missing');
  }
  const today = nowInfo.zurichDate;
  const dayIdOf = typeof playDayMap === 'object' && playDayMap !== null ? playDayMap[nowInfo.weekday] : undefined;

  const current = windows.find((w) => today >= w.start && today <= w.end);
  if (current) {
    return {
      state: 'playing',
      windowId: current.id,
      replayDayId: dayIdOf ?? null,
      nextWindowStartDate: null,
    };
  }

  const next = windows.find((w) => w.start > today);
  if (next) {
    return { state: 'upcoming', windowId: null, replayDayId: null, nextWindowStartDate: next.start };
  }
  return { state: 'archived', windowId: null, replayDayId: null, nextWindowStartDate: null };
}

/** Zurich calendar date ('en-CA' -> YYYY-MM-DD) and weekday name for a moment. */
export function nowInZurich(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zurich',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return { zurichDate: `${parts.year}-${parts.month}-${parts.day}`, weekday: parts.weekday };
}

/**
 * Badge copy, single source (R3). dayNumberOffset turns a replay day id into
 * 'Day N' using 1-based position of the replay's three days.
 */
export function badgeLabel(state, { dayNumber, nextWindowStartDate }) {
  if (state.state === 'playing') {
    return dayNumber ? `Playing now · Day ${dayNumber}` : 'Playing now';
  }
  if (state.state === 'upcoming' && nextWindowStartDate) {
    const [, m, d] = nextWindowStartDate.split('-').map(Number);
    return `Opens Fri ${m}/${d}`;
  }
  return 'Season closed';
}
