import { cacheLife } from 'next/cache';
import { fetchEventsList } from './wtt-api';
import { normalizeEventsList } from './events';
import type { NormalizedEvent } from './types';

// One cached copy of the tournaments list shared by /, /events, the
// sitemap, page metadata and getEventData. The status field is computed at
// cache time (up to an hour stale) — fine for sorting and status dots;
// lib/tier.ts recomputes from the raw dates with its own clock.
//
// Never throws: an error escaping a nested 'use cache' scope fails the
// whole prerender even when the caller catches it. A failure is cached as
// null for about a minute.
export async function getEventsListOrNull(): Promise<NormalizedEvent[] | null> {
  'use cache: remote';
  try {
    const events = normalizeEventsList(await fetchEventsList());
    cacheLife('hours');
    return events;
  } catch {
    cacheLife('minutes');
    return null;
  }
}

export async function getEventsList(): Promise<NormalizedEvent[]> {
  const events = await getEventsListOrNull();
  if (!events) throw new Error('WTT events list unavailable');
  return events;
}
