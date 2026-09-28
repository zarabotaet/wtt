import { describe, expect, it } from 'vitest';
import { LIVE_POLL_MS, needsFetch, OVERDUE_MS, pollPlan, WAIT_MAX_MS, WAIT_MIN_MS } from './poll-mode';
import { SCHEMA_VERSION, type Entry } from './entry';
import type { Match } from '@/lib/types';

// Match startDate is venue-local time with no offset, parsed in the
// viewer's timezone — so the fixtures are built in local time too.
const NOW = new Date(2026, 8, 20, 12, 0, 0).getTime();

function localIso(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function match(status: Match['status'], startMs = NOW): Match {
  return {
    code: 'X', normCode: `X${startMs}${status}`, startDate: localIso(startMs), endDate: '',
    status, round: 'R', subEvent: 'Singles', table: 'T1', venue: 'V',
    players: [], gameScores: null, winnerIdx: null, isTbd: false,
  };
}

function entry(overrides: Partial<Entry>): Entry {
  return { eventId: 'E1', matches: [], tier: 'live', generatedAt: NOW, fetchedAt: NOW, v: SCHEMA_VERSION, ...overrides };
}

const MIN = 60_000;

describe('pollPlan', () => {
  it('is off with no entry, for a final tournament, or in a hidden tab', () => {
    expect(pollPlan(null, true, NOW).mode).toBe('off');
    expect(pollPlan(entry({ tier: 'final', matches: [match('live')] }), true, NOW).mode).toBe('off');
    expect(pollPlan(entry({ matches: [match('live')] }), false, NOW).mode).toBe('off');
  });

  it('polls every 30 s while any match is live', () => {
    expect(pollPlan(entry({ matches: [match('done'), match('live')] }), true, NOW)).toEqual({ mode: 'live', delayMs: LIVE_POLL_MS });
  });

  it('waits until the nearest scheduled match', () => {
    const e = entry({ matches: [match('scheduled', NOW + 40 * MIN), match('scheduled', NOW + 10 * MIN)] });
    expect(pollPlan(e, true, NOW)).toEqual({ mode: 'wait', delayMs: 10 * MIN });
  });

  it('never waits less than 30 s', () => {
    expect(pollPlan(entry({ matches: [match('scheduled', NOW + 5_000)] }), true, NOW).delayMs).toBe(WAIT_MIN_MS);
  });

  it('never waits more than 15 min, whatever the timezone skew', () => {
    expect(pollPlan(entry({ matches: [match('scheduled', NOW + 3 * 60 * MIN)] }), true, NOW).delayMs).toBe(WAIT_MAX_MS);
  });

  it('rechecks in 5 min when a scheduled match is overdue', () => {
    expect(pollPlan(entry({ matches: [match('scheduled', NOW - 2 * MIN)] }), true, NOW)).toEqual({ mode: 'wait', delayMs: OVERDUE_MS });
  });

  it('waits the maximum when nothing is scheduled or dates are unreadable', () => {
    expect(pollPlan(entry({ matches: [match('done')] }), true, NOW).delayMs).toBe(WAIT_MAX_MS);
    expect(pollPlan(entry({ matches: [] }), true, NOW).delayMs).toBe(WAIT_MAX_MS);
    expect(pollPlan(entry({ matches: [{ ...match('scheduled'), startDate: 'TBD' }] }), true, NOW).delayMs).toBe(WAIT_MAX_MS);
  });
});

describe('needsFetch', () => {
  it('fetches when nothing is cached', () => {
    expect(needsFetch(null, 15_000, NOW)).toBe(true);
  });

  it('never refetches a final tournament', () => {
    expect(needsFetch(entry({ tier: 'final', fetchedAt: 0 }), 15_000, NOW)).toBe(false);
  });

  it('refetches only past the allowed age', () => {
    expect(needsFetch(entry({ fetchedAt: NOW - 16_000 }), 15_000, NOW)).toBe(true);
    expect(needsFetch(entry({ fetchedAt: NOW - 5_000 }), 15_000, NOW)).toBe(false);
  });
});
