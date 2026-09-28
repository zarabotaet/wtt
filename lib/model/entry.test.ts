import { describe, expect, it } from 'vitest';
import { entryKey, SCHEMA_VERSION, toEntry, validEntry } from './entry';
import type { EventEnvelope } from '@/lib/types';

const ENV: EventEnvelope = { eventId: '42', matches: [], tier: 'live', generatedAt: 100 };

describe('entry', () => {
  it('keys IndexedDB records by event id', () => {
    expect(entryKey('42')).toBe('event_42');
  });

  it('stamps an envelope with fetch time and schema version', () => {
    expect(toEntry(ENV, 200)).toEqual({ ...ENV, fetchedAt: 200, v: SCHEMA_VERSION });
  });

  it('coerces a numeric event id to a string', () => {
    expect(toEntry({ ...ENV, eventId: 42 as unknown as string }, 1).eventId).toBe('42');
  });

  it('accepts a well-formed record for the requested id', () => {
    const e = toEntry(ENV, 200);
    expect(validEntry(e, '42')).toBe(e);
  });

  it.each([
    ['null', null],
    ['a string', 'junk'],
    ['another schema version', { ...ENV, fetchedAt: 1, v: SCHEMA_VERSION + 1 }],
    ['another event', { ...ENV, eventId: '7', fetchedAt: 1, v: SCHEMA_VERSION }],
    ['no matches array', { ...ENV, matches: undefined, fetchedAt: 1, v: SCHEMA_VERSION }],
  ])('rejects %s', (_label, raw) => {
    expect(validEntry(raw, '42')).toBeNull();
  });
});
