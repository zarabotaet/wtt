import type { EventEnvelope } from '@/lib/types';

// Bump to discard every IndexedDB record written by an older client (the
// emergency reset if a bad "final" snapshot ever gets cached).
export const SCHEMA_VERSION = 1;

export interface Entry extends EventEnvelope {
  fetchedAt: number; // ms epoch when this browser received the snapshot
  v: number;
}

export function entryKey(id: string): string {
  return `event_${id}`;
}

export function toEntry(env: EventEnvelope, fetchedAt: number): Entry {
  return { ...env, eventId: String(env.eventId), fetchedAt, v: SCHEMA_VERSION };
}

// IndexedDB content is outside our control (older schema, another tab's
// bug, manual edits) — anything that doesn't look like our record counts
// as missing.
export function validEntry(raw: unknown, id: string): Entry | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Partial<Entry>;
  if (e.v !== SCHEMA_VERSION || String(e.eventId) !== String(id) || !Array.isArray(e.matches)) return null;
  return e as Entry;
}
