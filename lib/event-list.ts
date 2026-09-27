import { cacheLife } from 'next/cache';
import { fetchEventsList } from './wtt-api';
import { normalizeEventsList } from './events';
import type { NormalizedEvent } from './types';

// One cached copy of the tournaments list shared by /, /events, the
// sitemap, page metadata and getEventData. The status field is computed at
// cache time (up to an hour stale) — fine for sorting and status dots;
// lib/tier.ts recomputes from the raw dates with its own clock.
export async function getEventsList(): Promise<NormalizedEvent[]> {
  'use cache: remote';
  cacheLife('hours');
  return normalizeEventsList(await fetchEventsList());
}
