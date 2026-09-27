import { cacheLife } from 'next/cache';
import { getEventMatches } from './get-event-matches';
import { getEventsList } from './event-list';
import { computeTier } from './tier';
import { WttApiError } from './wtt-api';
import type { EventEnvelope, Match, NormalizedEvent } from './types';

type Tier = ReturnType<typeof computeTier>;

// 'final' is cached forever (server, CDN, browser) and never refetched, so it
// must only be granted to a snapshot we trust. A transient WTT failure can
// yield a truncated list whose matches all happen to be done; in that case,
// or when a done match still has no score, stay 'live' and retry soon.
export function finalizeTier(tier: Tier, matches: Match[], complete: boolean): Tier {
  if (tier !== 'final') return tier;
  if (!complete || matches.some((m) => m.status === 'done' && !m.gameScores)) return 'live';
  return tier;
}

// The single server-side source for a tournament: page SSR and
// GET /api/events/[eventId] both read this. The lifetime is picked after
// the data is known (conditional cacheLife); an explicit outer cacheLife
// overrides the short lifetimes of the nested match-card caches.
// Not-found is returned as null rather than thrown: an error crossing the
// 'use cache' boundary is not guaranteed to keep its class.
export async function getEventData(eventId: string): Promise<EventEnvelope | null> {
  'use cache: remote';
  let matches: Match[];
  let events: NormalizedEvent[];
  const stats = { complete: true };
  try {
    [matches, events] = await Promise.all([
      getEventMatches(eventId, stats),
      getEventsList().catch((err) => {
        console.warn(`getEventData(${eventId}): events list unavailable`, err);
        return [];
      }),
    ]);
  } catch (err) {
    if (err instanceof WttApiError && (err.status === 404 || err.status === 403)) {
      cacheLife('minutes');
      return null;
    }
    throw err;
  }

  const now = Date.now();
  const event = events.find((e) => String(e.eventId) === String(eventId));
  const tier = finalizeTier(computeTier(event, matches, now), matches, stats.complete);
  if (tier === 'final') cacheLife('max');
  else if (tier === 'live') cacheLife({ revalidate: 15, expire: 86400 });
  else cacheLife({ revalidate: 3600, expire: 604800 });

  return { eventId: String(eventId), matches, tier, generatedAt: now };
}
