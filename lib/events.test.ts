import { describe, expect, it } from 'vitest';
import { tournamentStatus, normalizeEventsList } from './events';
import type { RawEventListItem } from './types';

const NOW = new Date('2026-09-12T12:00:00Z').getTime();

describe('tournamentStatus', () => {
  it('is ongoing when now falls between start and end', () => {
    const e: RawEventListItem = { eventId: '1', eventName: 'A', startDateTime: '2026-09-10T00:00:00Z', endDateTime: '2026-09-15T00:00:00Z' };
    expect(tournamentStatus(e, NOW)).toBe('ongoing');
  });
  it('is future when start is after now', () => {
    const e: RawEventListItem = { eventId: '1', eventName: 'A', startDateTime: '2026-10-01T00:00:00Z', endDateTime: '2026-10-05T00:00:00Z' };
    expect(tournamentStatus(e, NOW)).toBe('future');
  });
  it('is past otherwise', () => {
    const e: RawEventListItem = { eventId: '1', eventName: 'A', startDateTime: '2026-01-01T00:00:00Z', endDateTime: '2026-01-05T00:00:00Z' };
    expect(tournamentStatus(e, NOW)).toBe('past');
  });
});

describe('normalizeEventsList', () => {
  it('sorts ongoing first, then future by soonest, then past by most recent', () => {
    const list: RawEventListItem[] = [
      { eventId: 'past-old', eventName: 'Past Old', startDateTime: '2025-01-01T00:00:00Z', endDateTime: '2025-01-05T00:00:00Z' },
      { eventId: 'future-far', eventName: 'Future Far', startDateTime: '2026-12-01T00:00:00Z', endDateTime: '2026-12-05T00:00:00Z' },
      { eventId: 'ongoing', eventName: 'Ongoing', startDateTime: '2026-09-10T00:00:00Z', endDateTime: '2026-09-15T00:00:00Z' },
      { eventId: 'future-near', eventName: 'Future Near', startDateTime: '2026-09-20T00:00:00Z', endDateTime: '2026-09-25T00:00:00Z' },
      { eventId: 'past-recent', eventName: 'Past Recent', startDateTime: '2026-08-01T00:00:00Z', endDateTime: '2026-08-05T00:00:00Z' },
    ];
    const out = normalizeEventsList(list, NOW);
    expect(out.map((e) => e.eventId)).toEqual(['ongoing', 'future-near', 'future-far', 'past-recent', 'past-old']);
  });
});
