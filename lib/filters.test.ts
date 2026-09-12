import { describe, expect, it } from 'vitest';
import { applyFilters, deriveFilterOptions, matchDateKey } from './filters';
import type { Match } from './types';

function match(overrides: Partial<Match>): Match {
  return {
    code: 'X', normCode: 'X', startDate: '2026-09-10T11:00:00', endDate: '2026-09-10T12:00:00',
    status: 'scheduled', round: 'R', subEvent: 'Singles', table: 'Table 1', venue: 'V',
    players: [{ name: 'A', seed: null }, { name: 'B', seed: null }],
    gameScores: null, winnerIdx: null, isTbd: false,
    ...overrides,
  };
}

describe('matchDateKey', () => {
  it('returns a YYYY-MM-DD key from a match start date', () => {
    expect(matchDateKey('2026-09-10T11:00:00')).toBe('2026-09-10');
  });
});

describe('applyFilters', () => {
  const matches = [
    match({ normCode: 'A', subEvent: 'Singles', table: 'Table 1', startDate: '2026-09-10T11:00:00' }),
    match({ normCode: 'B', subEvent: 'Doubles', table: 'Table 2', startDate: '2026-09-11T11:00:00' }),
  ];

  it('filters by subEvent, table and date independently', () => {
    expect(applyFilters(matches, { subEvent: 'Doubles', table: '', date: '' }).map((m) => m.normCode)).toEqual(['B']);
    expect(applyFilters(matches, { subEvent: '', table: 'Table 1', date: '' }).map((m) => m.normCode)).toEqual(['A']);
    expect(applyFilters(matches, { subEvent: '', table: '', date: '2026-09-11' }).map((m) => m.normCode)).toEqual(['B']);
  });

  it('returns everything when no filter is active', () => {
    expect(applyFilters(matches, { subEvent: '', table: '', date: '' })).toHaveLength(2);
  });
});

describe('deriveFilterOptions', () => {
  it('collects unique, sorted subEvents/tables/dates', () => {
    const matches = [
      match({ subEvent: 'Doubles', table: 'Table 2', startDate: '2026-09-11T11:00:00' }),
      match({ subEvent: 'Singles', table: 'Table 1', startDate: '2026-09-10T11:00:00' }),
      match({ subEvent: 'Singles', table: 'Table 1', startDate: '2026-09-10T11:00:00' }),
    ];
    const options = deriveFilterOptions(matches);
    expect(options.subEvents).toEqual(['Doubles', 'Singles']);
    expect(options.tables).toEqual(['Table 1', 'Table 2']);
    expect(options.dates).toEqual(['2026-09-10', '2026-09-11']);
  });
});
