import type { Match } from '@/lib/types';
import { SCHEMA_VERSION, type Entry } from './entry';

function isComplete(m: Match): boolean {
  return m.status === 'done' && m.gameScores !== null;
}

// Combines what the browser already has with a new snapshot. The snapshot
// generated later wins as the base — a CDN or SSR copy can be older than
// what IndexedDB holds. On top of that, a finished score is never lost or
// rolled back by a less complete copy, the same rule the prototype applied
// to its IndexedDB cache.
export function mergeEntry(old: Entry | null, fresh: Entry): Entry {
  if (!old || old.v !== fresh.v || String(old.eventId) !== String(fresh.eventId)) return fresh;
  const [base, other] = fresh.generatedAt >= old.generatedAt ? [fresh, old] : [old, fresh];

  const otherByCode = new Map(other.matches.map((m) => [m.normCode, m]));
  const baseCodes = new Set(base.matches.map((m) => m.normCode));
  const matches = base.matches.map((m) => {
    const o = otherByCode.get(m.normCode);
    return o && isComplete(o) && !isComplete(m) ? o : m;
  });
  other.matches.forEach((m) => {
    if (!baseCodes.has(m.normCode) && isComplete(m)) matches.push(m);
  });
  matches.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));

  return {
    ...base,
    matches,
    tier: old.tier === 'final' || fresh.tier === 'final' ? 'final' : base.tier,
    generatedAt: Math.max(old.generatedAt, fresh.generatedAt),
    fetchedAt: Math.max(old.fetchedAt, fresh.fetchedAt),
    v: SCHEMA_VERSION,
  };
}
