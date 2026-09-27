import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Match, NormalizedEvent } from './types';

vi.mock('next/cache', () => ({ cacheLife: vi.fn() }));
vi.mock('./get-event-matches', () => ({ getEventMatches: vi.fn() }));
vi.mock('./event-list', () => ({ getEventsListOrNull: vi.fn() }));

import { cacheLife } from 'next/cache';
import { getEventMatches } from './get-event-matches';
import { getEventsListOrNull } from './event-list';
import { WttApiError } from './wtt-api';
import { getEventData, finalizeTier } from './event-data';

const NOW = Date.parse('2026-09-20T12:00:00Z');

function match(status: Match['status']): Match {
  return {
    code: 'X', normCode: 'X', startDate: '2026-09-12T11:00:00', endDate: '2026-09-12T12:00:00',
    status, round: 'R', subEvent: 'Singles', table: 'T1', venue: 'V',
    players: [{ name: 'A', seed: null }, { name: 'B', seed: null }],
    gameScores: status === 'done' ? [[11, 11, 11], [5, 5, 5]] : null,
    winnerIdx: status === 'done' ? 0 : null, isTbd: false,
  };
}

function event(eventId: string, start: string, end: string): NormalizedEvent {
  return { eventId, eventName: `Event ${eventId}`, startDateTime: start, endDateTime: end, status: 'past' };
}

const EVENTS = [
  event('PAST', '2026-09-10T00:00:00Z', '2026-09-14T00:00:00Z'),
  event('NOW', '2026-09-18T00:00:00Z', '2026-09-22T00:00:00Z'),
  event('SOON', '2026-10-01T00:00:00Z', '2026-10-05T00:00:00Z'),
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  vi.mocked(getEventsListOrNull).mockResolvedValue(EVENTS);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getEventData', () => {
  it('builds a final envelope and caches it for the maximum lifetime', async () => {
    const matches = [match('done')];
    vi.mocked(getEventMatches).mockResolvedValue(matches);
    const env = await getEventData('PAST');
    expect(env).toEqual({ eventId: 'PAST', matches, tier: 'final', generatedAt: NOW });
    expect(getEventMatches).toHaveBeenCalledWith('PAST', expect.anything());
    expect(cacheLife).toHaveBeenCalledTimes(1);
    expect(cacheLife).toHaveBeenCalledWith('max');
  });

  it('regenerates a live tournament every 15 s', async () => {
    vi.mocked(getEventMatches).mockResolvedValue([match('done'), match('live')]);
    const env = await getEventData('NOW');
    expect(env?.tier).toBe('live');
    expect(cacheLife).toHaveBeenCalledWith({ revalidate: 15, expire: 86400 });
  });

  it('regenerates a future tournament hourly', async () => {
    vi.mocked(getEventMatches).mockResolvedValue([match('scheduled')]);
    const env = await getEventData('SOON');
    expect(env?.tier).toBe('future');
    expect(cacheLife).toHaveBeenCalledWith({ revalidate: 3600, expire: 604800 });
  });

  it('treats the tournament as live when the events list is unavailable', async () => {
    vi.mocked(getEventsListOrNull).mockResolvedValue(null);
    vi.mocked(getEventMatches).mockResolvedValue([match('done')]);
    const env = await getEventData('PAST');
    expect(env?.tier).toBe('live');
  });

  it.each([404, 403])('returns null for a WTT %i and remembers it for minutes', async (status) => {
    vi.mocked(getEventMatches).mockRejectedValue(new WttApiError(status, 'u'));
    await expect(getEventData('GONE')).resolves.toBeNull();
    expect(cacheLife).toHaveBeenCalledWith('minutes');
  });

  it('rethrows other upstream errors without caching', async () => {
    vi.mocked(getEventMatches).mockRejectedValue(new WttApiError(500, 'u'));
    await expect(getEventData('PAST')).rejects.toThrow('500');
    expect(cacheLife).not.toHaveBeenCalled();
  });

  it('downgrades final to live when the pass was incomplete', async () => {
    vi.mocked(getEventMatches).mockImplementation(async (_id, stats) => {
      if (stats) stats.complete = false;
      return [match('done')];
    });
    const env = await getEventData('PAST');
    expect(env?.tier).toBe('live');
    expect(cacheLife).toHaveBeenCalledWith({ revalidate: 15, expire: 86400 });
    expect(cacheLife).not.toHaveBeenCalledWith('max');
  });
});

describe('finalizeTier', () => {
  it('downgrades final to live when incomplete', () => {
    expect(finalizeTier('final', [match('done')], false)).toBe('live');
  });
  it('downgrades final to live when a done match lacks gameScores', () => {
    expect(finalizeTier('final', [{ ...match('done'), gameScores: null }], true)).toBe('live');
  });
  it('keeps final when complete with scores', () => {
    expect(finalizeTier('final', [match('done')], true)).toBe('final');
  });
  it('leaves non-final tiers alone', () => {
    expect(finalizeTier('future', [match('scheduled')], false)).toBe('future');
  });
});
