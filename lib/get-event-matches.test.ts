import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawArchiveItem, RawLiveIdsItem, RawResults10Item, RawScheduleItem } from './types';

vi.mock('./wtt-api', () => ({
  fetchSchedule: vi.fn(),
  fetchResults10: vi.fn(),
  fetchArchive: vi.fn(),
  fetchLiveIds: vi.fn(),
  fetchMatchCard: vi.fn(),
  fetchOfficialResult: vi.fn(),
}));

import { fetchSchedule, fetchResults10, fetchArchive, fetchLiveIds, fetchMatchCard, fetchOfficialResult } from './wtt-api';
import { getEventMatches } from './get-event-matches';

const EVENT_ID = 'EVT1';

function unit(code: string, status: string, teamNames: [string, string]) {
  return {
    Code: code,
    ScheduleStatus: status,
    StartDate: '2026-09-10T11:00:00',
    EndDate: '2026-09-10T12:00:00',
    StartList: {
      Start: [
        { Competitor: { Description: { TeamName: teamNames[0] } } },
        { Competitor: { Description: { TeamName: teamNames[1] } } },
      ],
    },
  };
}

beforeEach(() => {
  vi.mocked(fetchResults10).mockResolvedValue([] as RawResults10Item[]);
  vi.mocked(fetchArchive).mockResolvedValue([] as RawArchiveItem[]);
  vi.mocked(fetchLiveIds).mockResolvedValue([] as RawLiveIdsItem[]);
  vi.mocked(fetchOfficialResult).mockResolvedValue([] as RawArchiveItem[]);
  vi.mocked(fetchMatchCard).mockRejectedValue(new Error('not mocked for this match'));
});

describe('getEventMatches', () => {
  it('flattens every match out of Competition.Unit[], not just the first one (regression for the Unit[0] bug)', async () => {
    const schedule: RawScheduleItem[] = [{
      Competition: {
        Unit: [
          unit('M1', 'Scheduled', ['A1', 'A2']),
          unit('M2', 'Scheduled', ['B1', 'B2']),
          unit('M3', 'Scheduled', ['C1', 'C2']),
        ],
      },
    }];
    vi.mocked(fetchSchedule).mockResolvedValue(schedule);

    const matches = await getEventMatches(EVENT_ID);
    expect(matches.map((m) => m.normCode).sort()).toEqual(['M1', 'M2', 'M3']);
  });

  it('fetches a fresh score for a live match and merges it in', async () => {
    const schedule: RawScheduleItem[] = [{ Competition: { Unit: [unit('LIVE1', 'Start List', ['A', 'B'])] } }];
    vi.mocked(fetchSchedule).mockResolvedValue(schedule);
    vi.mocked(fetchMatchCard).mockImplementation(async (_eventId, docCode) => {
      if (docCode.startsWith('LIVE1')) {
        return {
          competitiors: [{ competitiorName: 'A', scores: '11,7,0,0,0' }, { competitiorName: 'B', scores: '9,11,0,0,0' }],
          matchConfig: { bestOfXGames: 5 },
        };
      }
      throw new Error('unexpected docCode');
    });

    const matches = await getEventMatches(EVENT_ID);
    expect(matches).toHaveLength(1);
    expect(matches[0].status).toBe('live');
    expect(matches[0].gameScores).toEqual([[11, 7, 0, 0, 0], [9, 11, 0, 0, 0]]);
  });

  it('includes a live match that livematchids.json knows about but schedule.json has no entry for at all', async () => {
    vi.mocked(fetchSchedule).mockResolvedValue([]);
    vi.mocked(fetchLiveIds).mockResolvedValue([{ e: EVENT_ID, d: 'ORPHAN1', s: "Men's Singles" }]);
    vi.mocked(fetchMatchCard).mockResolvedValue({
      competitiors: [{ competitiorName: 'A', scores: '11,7,0,0,0' }, { competitiorName: 'B', scores: '9,11,0,0,0' }],
      matchConfig: { bestOfXGames: 5 },
    });

    const matches = await getEventMatches(EVENT_ID);
    expect(matches).toHaveLength(1);
    expect(matches[0].normCode).toBe('ORPHAN1');
    expect(matches[0].status).toBe('live');
  });

  it('fills in a score for a done match missing from the last-10 results, capped at the concurrency limit', async () => {
    const units = Array.from({ length: 10 }, (_, i) => unit(`DONE${i}`, 'Official', [`P${i}a`, `P${i}b`]));
    vi.mocked(fetchSchedule).mockResolvedValue([{ Competition: { Unit: units } }]);
    vi.mocked(fetchMatchCard).mockImplementation(async (_eventId, docCode) => ({
      competitiors: [
        { competitiorName: 'winner', scores: '11,11,11,0,0' },
        { competitiorName: 'loser', scores: '5,6,7,0,0' },
      ],
      matchConfig: { bestOfXGames: 5 },
    }));

    const matches = await getEventMatches(EVENT_ID);
    expect(matches).toHaveLength(10);
    matches.forEach((m) => {
      expect(m.gameScores).not.toBeNull();
      expect(m.winnerIdx).toBe(0);
    });
  });

  it('sorts the returned matches future-to-past, matching the prototype behavior', async () => {
    const units = [
      unit('EARLY', 'Official', ['A1', 'A2']),
      unit('LATE', 'Official', ['B1', 'B2']),
    ];
    units[0].StartDate = '2026-09-01T10:00:00';
    units[1].StartDate = '2026-09-10T10:00:00';
    vi.mocked(fetchSchedule).mockResolvedValue([{ Competition: { Unit: units } }]);
    vi.mocked(fetchMatchCard).mockImplementation(async () => ({
      competitiors: [
        { competitiorName: 'winner', scores: '11,11,11,0,0' },
        { competitiorName: 'loser', scores: '5,6,7,0,0' },
      ],
      matchConfig: { bestOfXGames: 5 },
    }));

    const matches = await getEventMatches(EVENT_ID);
    expect(matches.map((m) => m.normCode)).toEqual(['LATE', 'EARLY']);
  });

  it('tolerates a malformed (non-array) schedule response instead of throwing', async () => {
    // @ts-expect-error deliberately malformed to simulate WTT's undocumented API misbehaving
    vi.mocked(fetchSchedule).mockResolvedValue({ not: 'an array' });
    const matches = await getEventMatches(EVENT_ID);
    expect(matches).toEqual([]);
  });

  it('discovers a completed match via officialresult.json that schedule.json never listed at all (regression: schedule.json only carries a partial window on a long-running tournament)', async () => {
    // schedule.json only knows about one recent match ...
    vi.mocked(fetchSchedule).mockResolvedValue([{ Competition: { Unit: [unit('RECENT', 'Official', ['A', 'B'])] } }]);
    // ... but officialresult.json (the full completed-match list) knows
    // about an older one schedule.json has already dropped.
    vi.mocked(fetchOfficialResult).mockResolvedValue([
      { documentCode: 'OLDDONE', startDateLocal: '2026-09-01T09:00:00', match_card: null },
    ] as RawArchiveItem[]);
    vi.mocked(fetchMatchCard).mockImplementation(async (_eventId, docCode) => ({
      competitiors: [
        { competitiorName: docCode === 'OLDDONE' ? 'Old Winner' : 'winner', scores: '11,11,11,0,0' },
        { competitiorName: docCode === 'OLDDONE' ? 'Old Loser' : 'loser', scores: '5,6,7,0,0' },
      ],
      matchConfig: { bestOfXGames: 5 },
    }));

    const matches = await getEventMatches(EVENT_ID);
    expect(matches.map((m) => m.normCode).sort()).toEqual(['OLDDONE', 'RECENT']);
    const oldDone = matches.find((m) => m.normCode === 'OLDDONE');
    expect(oldDone?.status).toBe('done');
    expect(oldDone?.startDate).toBe('2026-09-01T09:00:00');
    expect(oldDone?.players.map((p) => p.name)).toEqual(['Old Winner', 'Old Loser']);
  });

  it('does not re-fetch an officialresult.json code that schedule.json already covers', async () => {
    vi.mocked(fetchSchedule).mockResolvedValue([{ Competition: { Unit: [unit('KNOWN', 'Official', ['A', 'B'])] } }]);
    vi.mocked(fetchOfficialResult).mockResolvedValue([
      { documentCode: 'KNOWN', startDateLocal: '2026-09-01T09:00:00', match_card: null },
    ] as RawArchiveItem[]);
    vi.mocked(fetchMatchCard).mockImplementation(async (_eventId, docCode) => {
      expect(docCode).not.toBe('KNOWN'); // schedule.json's own missing-score fill uses the full padded code, not the bare "KNOWN"
      return {
        competitiors: [{ competitiorName: 'A', scores: '11,11,11,0,0' }, { competitiorName: 'B', scores: '5,6,7,0,0' }],
        matchConfig: { bestOfXGames: 5 },
      };
    });

    const matches = await getEventMatches(EVENT_ID);
    expect(matches).toHaveLength(1);
    expect(matches[0].normCode).toBe('KNOWN');
  });
});
