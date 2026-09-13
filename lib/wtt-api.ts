import type {
  MatchCard,
  RawArchiveItem,
  RawEventListItem,
  RawLiveIdsItem,
  RawResults10Item,
  RawScheduleItem,
} from './types';

// Server-side fetch is not subject to browser CORS, so unlike the
// prototype we are not restricted to the one WTT mirror that allows
// cross-origin requests (see docs/API_REFERENCE.md §0) — this mirror is
// kept simply because it is the one already proven to serve every
// endpoint below.
const BASE_URL = 'https://wtt-web-frontdoor-cthahjeqhbh6aqe3.a01.azurefd.net';

function cacheBust(url: string, bucketMs: number): string {
  const bucket = Math.floor(Date.now() / bucketMs);
  return `${url}${url.includes('?') ? '&' : '?'}q=${bucket}`;
}

// WTT's own CDN (Azure Front Door) caches these files independently of
// whatever revalidate window we ask Next.js's Data Cache for — confirmed
// live: an unbusted request returned a response over 17 hours stale
// (x-cache: TCP_HIT, last-modified from the previous day, missing 4
// newly-finished matches) while a cache-busted request to the exact same
// URL got a response seconds old (TCP_MISS). So the cache-busting query
// param must ALWAYS be present — the only question is how often its
// value changes.
//
// Bucketing it to the size of our own revalidate window (instead of a
// per-call-unique timestamp) means the URL stays IDENTICAL across calls
// within that window — so Next's Data Cache can still reuse a response
// instead of re-fetching WTT on every call — while still changing often
// enough to force a genuinely fresh WTT origin read (bypassing WTT's own
// stale CDN cache) at least once per window. With no revalidate window
// (cache: 'no-store', always-fresh contexts), bucket by 1ms — i.e.
// unique on every call, matching the old always-fresh behavior.
function resolveUrl(url: string, revalidateSeconds?: number): string {
  const bucketMs = revalidateSeconds === undefined ? 1 : revalidateSeconds * 1000;
  return cacheBust(url, bucketMs);
}

export class WttApiError extends Error {
  constructor(public status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'WttApiError';
  }
}

async function fetchJson<T>(url: string, revalidateSeconds?: number): Promise<T> {
  const res = await fetch(
    url,
    revalidateSeconds === undefined ? { cache: 'no-store' } : { next: { revalidate: revalidateSeconds } }
  );
  if (!res.ok) throw new WttApiError(res.status, url);
  return res.json() as Promise<T>;
}

export function fetchEventsList(revalidateSeconds?: number): Promise<RawEventListItem[]> {
  return fetchJson(
    resolveUrl(`${BASE_URL}/websitestaticapifiles/general/wtt_upcoming_only_events_list.json`, revalidateSeconds),
    revalidateSeconds
  );
}

export function fetchSchedule(eventId: string, revalidateSeconds?: number): Promise<RawScheduleItem[]> {
  return fetchJson(
    resolveUrl(`${BASE_URL}/websitecacheddata/${eventId}/schedule/schedule.json`, revalidateSeconds),
    revalidateSeconds
  );
}

export function fetchResults10(eventId: string, revalidateSeconds?: number): Promise<RawResults10Item[]> {
  return fetchJson(
    resolveUrl(
      `${BASE_URL}/websitestaticapifiles/${eventId}/${eventId}_take_10_official_results.json`,
      revalidateSeconds
    ),
    revalidateSeconds
  );
}

export function fetchArchive(eventId: string, revalidateSeconds?: number): Promise<RawArchiveItem[]> {
  return fetchJson(
    resolveUrl(`${BASE_URL}/websitearchivedresults/${eventId}/officialresult/officialresult.json`, revalidateSeconds),
    revalidateSeconds
  );
}

export function fetchLiveIds(eventId: string, revalidateSeconds?: number): Promise<RawLiveIdsItem[]> {
  return fetchJson(
    resolveUrl(
      `${BASE_URL}/websitestaticapifiles/running-events/${eventId}/${eventId}_livematchids.json`,
      revalidateSeconds
    ),
    revalidateSeconds
  );
}

export function fetchMatchCard(eventId: string, docCode: string, revalidateSeconds?: number): Promise<MatchCard> {
  return fetchJson(
    resolveUrl(`${BASE_URL}/matchdata/${eventId}/${docCode}.json`, revalidateSeconds),
    revalidateSeconds
  );
}

// The ONLY endpoint listing every completed match of an active tournament
// (see docs/API_REFERENCE.md §4b) — schedule.json's own Competition.Unit[]
// only carries a partial, near-term window and silently drops matches from
// days ago on a long-running tournament. match_card inside is always null
// here; this is used purely to discover documentCodes schedule.json/the
// archive endpoint don't have, each then point-fetched via fetchMatchCard.
export function fetchOfficialResult(eventId: string, revalidateSeconds?: number): Promise<RawArchiveItem[]> {
  return fetchJson(
    resolveUrl(
      `${BASE_URL}/websitecacheddata/${eventId}/officialresult/officialresult_minimal.json`,
      revalidateSeconds
    ),
    revalidateSeconds
  );
}
