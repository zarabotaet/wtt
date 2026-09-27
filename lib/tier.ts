import { DAY_MS, eventEndMs, tournamentStatus } from './events';
import type { Match, RawEventListItem, Tier } from './types';

// "final" is cached forever — server 'max' lifetime, CDN + browser
// immutable, IndexedDB never refetches — so it needs two independent
// signals: the calendar (a full day of grace after the last day, for late
// results) AND every known match being done. An event missing from the
// events list has no dates, so it can never be final.
export function computeTier(event: RawEventListItem | undefined, matches: Match[], now: number): Tier {
  if (!event) return 'live';
  if (tournamentStatus(event, now) === 'future' && matches.every((m) => m.status === 'scheduled')) {
    return 'future';
  }
  const end = eventEndMs(event.endDateTime);
  if (!isNaN(end) && end + DAY_MS < now && matches.length > 0 && matches.every((m) => m.status === 'done')) {
    return 'final';
  }
  return 'live';
}

// s-maxage is what Vercel's CDN honours; max-age alone only reaches the
// browser, so final carries both.
export const TIER_CACHE_CONTROL: Record<Tier, string> = {
  final: 'public, max-age=31536000, s-maxage=31536000, immutable',
  live: 'public, s-maxage=15, stale-while-revalidate=60',
  future: 'public, s-maxage=3600, stale-while-revalidate=86400',
};
