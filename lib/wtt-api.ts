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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

export function fetchEventsList(): Promise<RawEventListItem[]> {
  return fetchJson(`${BASE_URL}/websitestaticapifiles/general/wtt_upcoming_only_events_list.json`);
}

export function fetchSchedule(eventId: string): Promise<RawScheduleItem[]> {
  return fetchJson(cacheBust(`${BASE_URL}/websitecacheddata/${eventId}/schedule/schedule.json`));
}

export function fetchResults10(eventId: string): Promise<RawResults10Item[]> {
  return fetchJson(
    cacheBust(`${BASE_URL}/websitestaticapifiles/${eventId}/${eventId}_take_10_official_results.json`)
  );
}

export function fetchArchive(eventId: string): Promise<RawArchiveItem[]> {
  return fetchJson(cacheBust(`${BASE_URL}/websitearchivedresults/${eventId}/officialresult/officialresult.json`));
}

export function fetchLiveIds(eventId: string): Promise<RawLiveIdsItem[]> {
  return fetchJson(
    cacheBust(`${BASE_URL}/websitestaticapifiles/running-events/${eventId}/${eventId}_livematchids.json`)
  );
}

export function fetchMatchCard(eventId: string, docCode: string): Promise<MatchCard> {
  return fetchJson(cacheBust(`${BASE_URL}/matchdata/${eventId}/${docCode}.json`));
}
