// lib/merge-matches.test.ts
import { describe, expect, it } from 'vitest';
import {
  normalizeCode,
  fullDocCode,
  parseScores,
  computeSets,
  isDecided,
  dedupeUnits,
  hasRealPlayers,
  trimTrailingEmptyGames,
} from './merge-matches';
import type { RawUnit } from './types';

describe('normalizeCode', () => {
  it('strips trailing dashes used as documentCode padding', () => {
    expect(normalizeCode('ABC123' + '-'.repeat(36))).toBe('ABC123');
  });
  it('returns empty string for null/undefined', () => {
    expect(normalizeCode(undefined)).toBe('');
  });
});

describe('fullDocCode', () => {
  it('pads a short Code to the fixed 42-character documentCode length', () => {
    const code = 'ABCDEFGH';
    const padded = fullDocCode(code);
    expect(padded).toHaveLength(42);
    expect(padded.startsWith(code)).toBe(true);
    expect(padded.slice(code.length)).toBe('-'.repeat(42 - code.length));
  });
  it('leaves an already-full-length code untouched', () => {
    const full = 'X'.repeat(42);
    expect(fullDocCode(full)).toBe(full);
  });
});

describe('parseScores', () => {
  it('parses a comma-separated score string into numbers', () => {
    expect(parseScores('11,7,11,9,6')).toEqual([11, 7, 11, 9, 6]);
  });
  it('returns an empty array for empty input', () => {
    expect(parseScores('')).toEqual([]);
    expect(parseScores(undefined)).toEqual([]);
  });
});

describe('computeSets / isDecided', () => {
  it('counts games won per side from parallel score arrays', () => {
    const { setsA, setsB } = computeSets([11, 7, 11, 9, 0], [8, 11, 8, 11, 0]);
    expect(setsA).toBe(2);
    expect(setsB).toBe(2);
  });
  it('treats trailing zero games (unplayed) as not won by either side', () => {
    const { setsA, setsB } = computeSets([11, 11, 11, 0, 0], [7, 8, 9, 0, 0]);
    expect(setsA).toBe(3);
    expect(setsB).toBe(0);
    expect(isDecided(setsA, setsB, 5)).toBe(true);
  });
  it('is not decided when neither side has reached the majority', () => {
    expect(isDecided(1, 1, 5)).toBe(false);
  });
});

describe('dedupeUnits', () => {
  it('keeps the most-advanced ScheduleStatus per Code (Official > Start List > Scheduled)', () => {
    const units: RawUnit[] = [
      { Code: 'M1', ScheduleStatus: 'Scheduled', StartDate: '', EndDate: '' },
      { Code: 'M1', ScheduleStatus: 'Start List', StartDate: '', EndDate: '' },
      { Code: 'M1', ScheduleStatus: 'Official', StartDate: '', EndDate: '' },
      { Code: 'M2', ScheduleStatus: 'Scheduled', StartDate: '', EndDate: '' },
    ];
    const result = dedupeUnits(units);
    expect(result).toHaveLength(2);
    const m1 = result.find((u) => u.Code === 'M1');
    expect(m1?.ScheduleStatus).toBe('Official');
  });
});

describe('hasRealPlayers', () => {
  it('is false when every player name is the placeholder em-dash', () => {
    expect(hasRealPlayers([{ name: '—', seed: null }, { name: '—', seed: null }])).toBe(false);
  });
  it('is true when at least one player has a real name', () => {
    expect(hasRealPlayers([{ name: 'WANG Yidi', seed: null }, { name: '—', seed: null }])).toBe(true);
  });
  it('is false for an empty player list', () => {
    expect(hasRealPlayers([])).toBe(false);
  });
});

describe('trimTrailingEmptyGames', () => {
  it('drops unplayed 0-0 trailing games but keeps games that were actually played', () => {
    expect(trimTrailingEmptyGames([[11, 7, 11, 9, 0], [8, 11, 8, 11, 0]])).toBe(4);
  });
  it('returns the full length when every game slot was played', () => {
    expect(trimTrailingEmptyGames([[11, 7, 11], [9, 11, 9]])).toBe(3);
  });
});
