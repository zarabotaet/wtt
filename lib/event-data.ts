import { cacheLife } from 'next/cache';
import { getEventMatches } from './get-event-matches';
import { getEventsList } from './event-list';
import { computeTier } from './tier';
import { WttApiError } from './wtt-api';
import type { EventEnvelope, Match, NormalizedEvent } from './types';

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
  try {
    [matches, events] = await Promise.all([getEventMatches(eventId), getEventsList().catch(() => [])]);
  } catch (err) {
    if (err instanceof WttApiError && (err.status === 404 || err.status === 403)) {
      cacheLife('minutes');
      return null;
    }
    throw err;
  }

  const now = Date.now();
  const event = events.find((e) => String(e.eventId) === String(eventId));
  const tier = computeTier(event, matches, now);
  if (tier === 'final') cacheLife('max');
  else if (tier === 'live') cacheLife({ revalidate: 15, expire: 86400 });
  else cacheLife({ revalidate: 3600, expire: 604800 });

  return { eventId: String(eventId), matches, tier, generatedAt: now };
}
