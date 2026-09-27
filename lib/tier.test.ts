import { describe, expect, it } from 'vitest';
import { computeTier, TIER_CACHE_CONTROL } from './tier';
import type { Match, RawEventListItem } from './types';

function match(status: Match['status']): Match {
  return {
    code: 'X', normCode: 'X', startDate: '2026-09-12T11:00:00', endDate: '2026-09-12T12:00:00',
    status, round: 'R', subEvent: 'Singles', table: 'T1', venue: 'V',
    players: [{ name: 'A', seed: null }, { name: 'B', seed: null }],
    gameScores: status === 'done' ? [[11, 11, 11], [5, 5, 5]] : null,
    winnerIdx: status === 'done' ? 0 : null, isTbd: false,
  };
}

// Midnight end date: the tournament runs through 2026-09-14 23:59:59.999Z,
// so "24 h after the end of the day" is 2026-09-15 23:59:59.999Z.
const EVENT: RawEventListItem = {
  eventId: '1', eventName: 'Open',
  startDateTime: '2026-09-10T00:00:00Z', endDateTime: '2026-09-14T00:00:00Z',
};
const AFTER_GRACE = Date.parse('2026-09-16T00:00:00Z');
const WITHIN_GRACE = Date.parse('2026-09-15T23:00:00Z');
const BEFORE_START = Date.parse('2026-09-01T00:00:00Z');
const DURING = Date.parse('2026-09-12T12:00:00Z');

describe('computeTier', () => {
  it('is final a full day after the last day when every match is done', () => {
    expect(computeTier(EVENT, [match('done'), match('done')], AFTER_GRACE)).toBe('final');
  });

  it('stays live during the 24 h grace period even if every match is done', () => {
    expect(computeTier(EVENT, [match('done')], WITHIN_GRACE)).toBe('live');
  });

  it('stays live after the dates when some match is not done', () => {
    expect(computeTier(EVENT, [match('done'), match('scheduled')], AFTER_GRACE)).toBe('live');
    expect(computeTier(EVENT, [match('done'), match('live')], AFTER_GRACE)).toBe('live');
  });

  it('is never final with no matches at all', () => {
    expect(computeTier(EVENT, [], AFTER_GRACE)).toBe('live');
  });

  it('is live when the tournament is missing from the events list', () => {
    expect(computeTier(undefined, [match('done')], AFTER_GRACE)).toBe('live');
  });

  it('is live when the end date cannot be parsed', () => {
    expect(computeTier({ ...EVENT, endDateTime: 'garbage' }, [match('done')], AFTER_GRACE)).toBe('live');
  });

  it('counts the grace period from a precise end timestamp', () => {
    const precise = { ...EVENT, endDateTime: '2026-09-14T18:00:00Z' };
    expect(computeTier(precise, [match('done')], Date.parse('2026-09-15T17:00:00Z'))).toBe('live');
    expect(computeTier(precise, [match('done')], Date.parse('2026-09-15T19:00:00Z'))).toBe('final');
  });

  it('is future before the start while every match is still scheduled', () => {
    expect(computeTier(EVENT, [match('scheduled')], BEFORE_START)).toBe('future');
    expect(computeTier(EVENT, [], BEFORE_START)).toBe('future');
  });

  it('is live before the official start if a match is already under way', () => {
    expect(computeTier(EVENT, [match('scheduled'), match('live')], BEFORE_START)).toBe('live');
  });

  it('is live while the tournament is running', () => {
    expect(computeTier(EVENT, [match('done'), match('scheduled')], DURING)).toBe('live');
  });
});

describe('TIER_CACHE_CONTROL', () => {
  it('maps each tier to its CDN/browser header', () => {
    expect(TIER_CACHE_CONTROL).toEqual({
      final: 'public, max-age=31536000, s-maxage=31536000, immutable',
      live: 'public, s-maxage=15, stale-while-revalidate=60',
      future: 'public, s-maxage=3600, stale-while-revalidate=86400',
    });
  });
});
