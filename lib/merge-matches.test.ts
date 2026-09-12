// lib/merge-matches.test.ts
import { describe, expect, it } from 'vitest';
import {
  normalizeCode,
  fullDocCode,
  parseScores,
  computeSets,
  isDecided,
  isGameComplete,
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
  it('does not count an in-progress (not-yet-finished) game toward either side\'s set count', () => {
    // Two finished games (2-0), a third in progress at 5-3 — nobody has
    // reached 11 with a 2-point lead yet, so it must NOT be counted as a
    // third won set, or a still-live match would be misreported as
    // already decided 3-0 (see docs bug report: this was exactly wrong).
    const { setsA, setsB } = computeSets([11, 11, 5, 0, 0], [7, 8, 3, 0, 0]);
    expect(setsA).toBe(2);
    expect(setsB).toBe(0);
    expect(isDecided(setsA, setsB, 5)).toBe(false);
  });
});

describe('isGameComplete', () => {
  it('is false below 11 points for either side', () => {
    expect(isGameComplete(9, 5)).toBe(false);
  });
  it('is true at 11 with at least a 2-point lead', () => {
    expect(isGameComplete(11, 7)).toBe(true);
    expect(isGameComplete(11, 9)).toBe(true);
  });
  it('is false at 11-10 — deuce, not yet decided (needs a 2-point lead)', () => {
    expect(isGameComplete(11, 10)).toBe(false);
  });
  it('is true beyond 11 once a 2-point lead is reached in deuce', () => {
    expect(isGameComplete(13, 11)).toBe(true);
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

import { buildOrphanDoneMatch, computeMergedMatches } from './merge-matches';

describe('computeMergedMatches', () => {
  const unit = (code: string, overrides: Partial<RawUnit> = {}): RawUnit => ({
    Code: code,
    ScheduleStatus: 'Scheduled',
    StartDate: '2026-09-10T11:00:00',
    EndDate: '2026-09-10T12:00:00',
    StartList: { Start: [{ Competitor: { Description: { TeamName: 'A' } } }, { Competitor: { Description: { TeamName: 'B' } } }] },
    ...overrides,
  });

  it('lets an archive item override a schedule unit with the same code', () => {
    const matches = computeMergedMatches({
      units: [unit('M1', { ScheduleStatus: 'Scheduled' })],
      archiveItems: [{
        documentCode: 'M1',
        startDateLocal: '2025-01-01T00:00:00',
        match_card: {
          competitiors: [{ competitiorName: 'A', scores: '11,11,11,0,0' }, { competitiorName: 'B', scores: '5,6,7,0,0' }],
          matchConfig: { bestOfXGames: 5 },
        },
      }],
      resultsByCode: {},
      liveDocCodesByNormCode: {},
      liveCardsByNormCode: {},
      orphanLiveCards: {},
      orphanDoneCards: {},
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].status).toBe('done');
    expect(matches[0].winnerIdx).toBe(0);
  });

  it('upgrades a match to live via livematchids.json unless the score already shows it is done', () => {
    const matches = computeMergedMatches({
      units: [unit('M1', { ScheduleStatus: 'Scheduled' }), unit('M2', { ScheduleStatus: 'Scheduled' })],
      archiveItems: [],
      resultsByCode: {
        M2: { competitiors: [{ scores: '11,11,11,0,0' }, { scores: '5,6,7,0,0' }], matchConfig: { bestOfXGames: 5 } },
      },
      liveDocCodesByNormCode: { M1: 'M1', M2: 'M2' },
      liveCardsByNormCode: {},
      orphanLiveCards: {},
      orphanDoneCards: {},
    });
    const m1 = matches.find((m) => m.normCode === 'M1');
    const m2 = matches.find((m) => m.normCode === 'M2');
    expect(m1?.status).toBe('live');
    expect(m2?.status).toBe('done'); // score already decided, not downgraded to live
  });

  it('adds an orphan live match that has no schedule/archive entry at all', () => {
    const matches = computeMergedMatches({
      units: [],
      archiveItems: [],
      resultsByCode: {},
      liveDocCodesByNormCode: { ORPHAN1: 'ORPHAN1' },
      liveCardsByNormCode: {},
      orphanLiveCards: {
        ORPHAN1: {
          docCode: 'ORPHAN1',
          card: { competitiors: [{ competitiorName: 'A', scores: '11,7,0,0,0' }, { competitiorName: 'B', scores: '9,5,0,0,0' }] },
        },
      },
      orphanDoneCards: {},
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].normCode).toBe('ORPHAN1');
    expect(matches[0].status).toBe('live');
  });

  it('adds an orphan done match that officialresult.json knows about but schedule.json/archive have no entry for', () => {
    const matches = computeMergedMatches({
      units: [],
      archiveItems: [],
      resultsByCode: {},
      liveDocCodesByNormCode: {},
      liveCardsByNormCode: {},
      orphanLiveCards: {},
      orphanDoneCards: {
        DONE1: {
          docCode: 'DONE1',
          startDateLocal: '2026-09-05T09:00:00',
          card: {
            competitiors: [{ competitiorName: 'A', scores: '11,11,11,0,0' }, { competitiorName: 'B', scores: '5,6,7,0,0' }],
            matchConfig: { bestOfXGames: 5 },
          },
        },
      },
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].normCode).toBe('DONE1');
    expect(matches[0].status).toBe('done');
    expect(matches[0].startDate).toBe('2026-09-05T09:00:00');
    expect(matches[0].winnerIdx).toBe(0);
  });
});

describe('buildOrphanDoneMatch', () => {
  it('is always status done, trusting officialresult.json over score-decided detection', () => {
    // A walkover/retirement scoreline may not cleanly resolve via
    // isDecided() (e.g. sets tied 1-1 with no further games played) — the
    // match is still over, because officialresult.json already says so.
    const m = buildOrphanDoneMatch('DOC1', '2026-09-05T09:00:00', {
      competitiors: [{ competitiorName: 'A', scores: '11,7,0,0,0' }, { competitiorName: 'B', scores: '9,11,0,0,0' }],
    });
    expect(m.status).toBe('done');
  });

  it('carries the real startDateLocal instead of a live-orphan placeholder timestamp', () => {
    const m = buildOrphanDoneMatch('DOC1', '2026-09-05T09:00:00', null);
    expect(m.startDate).toBe('2026-09-05T09:00:00');
    expect(m.endDate).toBe('2026-09-05T09:00:00');
  });
});
