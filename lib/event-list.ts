import { cacheLife } from 'next/cache';
import { fetchEventsList } from './wtt-api';
import { normalizeEventsList } from './events';
import type { NormalizedEvent } from './types';
import { failInsideCache, unwrapCached, type CachedFailure } from './cached-failure';

// Hourly refresh, but kept up to 30 days: while WTT is down every failed
// regeneration leaves the last good list in place.
const LIST_LIFE = { stale: 300, revalidate: 3600, expire: 30 * 86400 };

// The tournaments list for pages, the sitemap and metadata. The status field
// is computed at cache time (up to an hour stale) — fine for sorting and
// status dots; lib/tier.ts recomputes from the raw dates with its own clock.
// Last good list in this server instance, served while WTT is down (the
// same reasoning as lastGood in lib/event-data.ts).
let lastGoodList: NormalizedEvent[] | null = null;

export async function getEventsList(): Promise<NormalizedEvent[]> {
  try {
    lastGoodList = unwrapCached(await getEventsListCached());
    return lastGoodList;
  } catch (err) {
    if (lastGoodList) return lastGoodList;
    throw err;
  }
}

async function getEventsListCached(): Promise<NormalizedEvent[] | CachedFailure> {
  'use cache: remote';
  try {
    const events = normalizeEventsList(await fetchEventsList());
    cacheLife(LIST_LIFE);
    return events;
  } catch (err) {
    return failInsideCache(err);
  }
}

// Variant for use inside getEventData's cache scope, where a thrown error
// would fail the whole prerender even though the caller catches it. A
// failure is cached as null for about a minute; the caller then treats the
// tournament as live, the safe side.
export async function getEventsListOrNull(): Promise<NormalizedEvent[] | null> {
  'use cache: remote';
  try {
    const events = normalizeEventsList(await fetchEventsList());
    cacheLife(LIST_LIFE);
    return events;
  } catch {
    cacheLife('minutes');
    return null;
  }
}
