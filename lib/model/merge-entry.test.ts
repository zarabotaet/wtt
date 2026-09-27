import { describe, expect, it } from 'vitest';
import { mergeEntry } from './merge-entry';
import { SCHEMA_VERSION, type Entry } from './entry';
import type { Match } from '@/lib/types';

function match(normCode: string, overrides: Partial<Match> = {}): Match {
  return {
    code: normCode, normCode, startDate: '2026-09-12T11:00:00', endDate: '2026-09-12T12:00:00',
    status: 'scheduled', round: 'R', subEvent: 'Singles', table: 'T1', venue: 'V',
    players: [{ name: 'A', seed: null }, { name: 'B', seed: null }],
    gameScores: null, winnerIdx: null, isTbd: false,
    ...overrides,
  };
}

const DONE = { status: 'done' as const, gameScores: [[11, 11, 11], [5, 5, 5]] as [number[], number[]], winnerIdx: 0 as const };

function entry(overrides: Partial<Entry>): Entry {
  return { eventId: 'E1', matches: [], tier: 'live', generatedAt: 1000, fetchedAt: 1000, v: SCHEMA_VERSION, ...overrides };
}

describe('mergeEntry', () => {
  it('returns the fresh entry when nothing is cached', () => {
    const fresh = entry({ matches: [match('A')] });
    expect(mergeEntry(null, fresh)).toBe(fresh);
  });

  it('ignores a cached entry for another event', () => {
    const fresh = entry({ matches: [match('A')] });
    expect(mergeEntry(entry({ eventId: 'E2' }), fresh)).toBe(fresh);
  });

  it('takes the newer snapshot as the base', () => {
    const old = entry({ generatedAt: 1000, fetchedAt: 1000, matches: [match('A')] });
    const fresh = entry({ generatedAt: 2000, fetchedAt: 2500, matches: [match('A', { status: 'live' })] });
    const merged = mergeEntry(old, fresh);
    expect(merged.matches.map((m) => m.status)).toEqual(['live']);
    expect(merged.generatedAt).toBe(2000);
    expect(merged.fetchedAt).toBe(2500);
  });

  it('keeps a finished score when the newer snapshot has that match less complete', () => {
    const old = entry({ generatedAt: 1000, matches: [match('A', DONE)] });
    const fresh = entry({ generatedAt: 2000, matches: [match('A', { status: 'done' })] });
    expect(mergeEntry(old, fresh).matches[0].gameScores).toEqual(DONE.gameScores);
  });

  it('keeps finished matches the newer snapshot no longer lists, but drops unfinished ones', () => {
    const old = entry({ generatedAt: 1000, matches: [match('GONE_DONE', DONE), match('GONE_SCHED')] });
    const fresh = entry({ generatedAt: 2000, matches: [match('A')] });
    expect(mergeEntry(old, fresh).matches.map((m) => m.normCode).sort()).toEqual(['A', 'GONE_DONE']);
  });

  it('does not let an older (stale CDN) snapshot overwrite newer cached data', () => {
    const cached = entry({ generatedAt: 5000, fetchedAt: 5000, matches: [match('A', DONE), match('B', { status: 'live' })] });
    const staleFresh = entry({ generatedAt: 3000, fetchedAt: 9000, matches: [match('A', { status: 'live' }), match('B')] });
    const merged = mergeEntry(cached, staleFresh);
    expect(merged.matches.find((m) => m.normCode === 'A')?.status).toBe('done');
    expect(merged.matches.find((m) => m.normCode === 'B')?.status).toBe('live');
    expect(merged.generatedAt).toBe(5000);
    expect(merged.fetchedAt).toBe(9000);
  });

  it('never downgrades a final tournament', () => {
    const old = entry({ tier: 'final', generatedAt: 1000 });
    const fresh = entry({ tier: 'live', generatedAt: 2000 });
    expect(mergeEntry(old, fresh).tier).toBe('final');
  });

  it('sorts matches newest start first', () => {
    const old = entry({ generatedAt: 1000, matches: [match('EARLY', { ...DONE, startDate: '2026-09-10T09:00:00' })] });
    const fresh = entry({ generatedAt: 2000, matches: [match('LATE', { startDate: '2026-09-12T09:00:00' })] });
    expect(mergeEntry(old, fresh).matches.map((m) => m.normCode)).toEqual(['LATE', 'EARLY']);
  });
});
