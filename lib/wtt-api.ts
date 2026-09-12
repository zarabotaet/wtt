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

function cacheBust(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}q=${Date.now()}`;
}

// The `?q=` cache-buster only matters when a fetch intentionally bypasses
// all caching (cache: 'no-store') — it defeats the *caller's own* HTTP
// cache, which the original client-side prototype needed to fight the
// browser's cache. On the server, once a fetch instead asks Next.js's
// Data Cache to reuse a response for `revalidateSeconds`, a fresh
// timestamp baked into the URL on every call would mean every "cached"
// entry only ever matches itself, defeating the very caching being asked
// for — so it must be omitted whenever a revalidate window is requested.
function resolveUrl(url: string, revalidateSeconds?: number): string {
  return revalidateSeconds === undefined ? cacheBust(url) : url;
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
  return fetchJson(`${BASE_URL}/websitestaticapifiles/general/wtt_upcoming_only_events_list.json`, revalidateSeconds);
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
