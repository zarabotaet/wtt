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
  it('prefers higher-priority status even when lower-priority appears later in array', () => {
    const units: RawUnit[] = [
      { Code: 'M3', ScheduleStatus: 'Official', StartDate: '', EndDate: '' },
      { Code: 'M3', ScheduleStatus: 'Scheduled', StartDate: '', EndDate: '' },
    ];
    const result = dedupeUnits(units);
    expect(result).toHaveLength(1);
    const m3 = result.find((u) => u.Code === 'M3');
    expect(m3?.ScheduleStatus).toBe('Official');
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

import { buildMatch, buildMatchFromArchiveItem, buildOrphanLiveMatch } from './merge-matches';
import type { MatchCard, RawArchiveItem } from './types';

describe('buildMatch', () => {
  const baseUnit: RawUnit = {
    Code: 'CODE1' + '-'.repeat(37),
    ScheduleStatus: 'Scheduled',
    StartDate: '2026-09-10T11:00:00',
    EndDate: '2026-09-10T12:00:00',
    StartList: {
      Start: [
        { Competitor: { Description: { TeamName: 'WANG Yidi' }, Seed: 1 } },
        { Competitor: { Description: { TeamName: 'Dina MESHREF' }, Seed: 3 } },
      ],
    },
    ItemDescription: [{ Value: "Women's Singles - Round of 32" }],
    SubEvent: "Women's Singles",
    VenueDescription: { LocationName: 'Table 3', VenueName: 'Macao East Asian Games Dome' },
  };

  it('maps players, round, table and venue from the raw unit', () => {
    const m = buildMatch(baseUnit, null);
    expect(m.players.map((p) => p.name)).toEqual(['WANG Yidi', 'Dina MESHREF']);
    expect(m.round).toBe("Women's Singles - Round of 32");
    expect(m.table).toBe('Table 3');
    expect(m.venue).toBe('Macao East Asian Games Dome');
    expect(m.status).toBe('scheduled');
    expect(m.isTbd).toBe(false);
  });

  it('trusts a decided score over a stale ScheduleStatus (WTT can lag)', () => {
    const card: MatchCard = {
      competitiors: [{ scores: '11,11,11,0,0' }, { scores: '5,7,9,0,0' }],
      matchConfig: { bestOfXGames: 5 },
    };
    const m = buildMatch({ ...baseUnit, ScheduleStatus: 'Start List' }, card);
    expect(m.status).toBe('done');
    expect(m.winnerIdx).toBe(0);
  });

  it('flags a bracket slot with no real players as TBD instead of dropping it', () => {
    const tbdUnit: RawUnit = {
      ...baseUnit,
      StartList: { Start: [{ Competitor: { Description: { TeamName: undefined } } }] },
    };
    const m = buildMatch(tbdUnit, null);
    expect(m.isTbd).toBe(true);
  });
});

describe('buildMatchFromArchiveItem', () => {
  it('builds a done match with full score from an archive item', () => {
    const item: RawArchiveItem = {
      documentCode: 'ARCHIVE1' + '-'.repeat(34),
      startDateLocal: '2025-01-05T09:00:00',
      match_card: {
        competitiors: [
          { competitiorName: 'Player A', scores: '11,11,9,11,0' },
          { competitiorName: 'Player B', scores: '7,8,11,6,0' },
        ],
        matchConfig: { bestOfXGames: 5 },
        subEventName: "Men's Doubles",
        tableName: 'Table 1',
        venueName: 'Venue X',
      },
    };
    const m = buildMatchFromArchiveItem(item);
    expect(m.status).toBe('done');
    expect(m.winnerIdx).toBe(0);
    expect(m.players.map((p) => p.name)).toEqual(['Player A', 'Player B']);
  });
});

describe('buildOrphanLiveMatch', () => {
  it('marks the match live when the score is not yet decided', () => {
    const card: MatchCard = {
      competitiors: [{ competitiorName: 'A', scores: '11,7,0,0,0' }, { competitiorName: 'B', scores: '9,11,0,0,0' }],
      matchConfig: { bestOfXGames: 5 },
    };
    const m = buildOrphanLiveMatch('DOC123', card);
    expect(m.status).toBe('live');
  });

  it('marks the match done when livematchids.json lags behind a finished score', () => {
    const card: MatchCard = {
      competitiors: [{ competitiorName: 'A', scores: '11,11,11,0,0' }, { competitiorName: 'B', scores: '5,6,7,0,0' }],
      matchConfig: { bestOfXGames: 5 },
    };
    const m = buildOrphanLiveMatch('DOC123', card);
    expect(m.status).toBe('done');
    expect(m.winnerIdx).toBe(0);
  });
});
