import type { EventStatus, NormalizedEvent, RawEventListItem } from './types';

const STATUS_RANK: Record<EventStatus, number> = { ongoing: 0, future: 1, past: 2 };
const DAY_MS = 24 * 60 * 60 * 1000;

// WTT gives both startDateTime/endDateTime as a bare calendar date at
// midnight ("...T00:00:00"), not a precise timestamp — comparing the raw
// instant makes a multi-day tournament read as "past" from midnight
// onward on its own final day, even while it still has matches scheduled
// that evening (confirmed live: a tournament with a final at 20:15 local
// showed "past" from 00:00 that same morning). Detected via the raw
// string rather than the parsed Date, since the string is what's
// actually known to mean "this whole day" — the Date's own timezone
// interpretation is irrelevant to that fact.
function isMidnightString(dateTimeStr: string): boolean {
  return /T00:00:00(\.0+)?Z?$/.test(dateTimeStr);
}

export function tournamentStatus(item: RawEventListItem, now: number = Date.now()): EventStatus {
  const start = new Date(item.startDateTime).getTime();
  let end = new Date(item.endDateTime).getTime();
  if (!isNaN(end) && isMidnightString(item.endDateTime)) {
    end += DAY_MS - 1; // extend through the rest of that calendar day
  }
  if (!isNaN(start) && !isNaN(end) && start <= now && now <= end) return 'ongoing';
  if (!isNaN(start) && start > now) return 'future';
  return 'past';
}

export function normalizeEventsList(list: RawEventListItem[], now: number = Date.now()): NormalizedEvent[] {
  // wtt_upcoming_only_events_list.json is, despite the name, the full
  // events list — one row per event with real start/end dates, which lets
  // us derive an actual ongoing/future/past status (the API gives no
  // status field of its own).
  const out: NormalizedEvent[] = list.map((item) => ({
    eventId: item.eventId,
    eventName: item.eventName,
    startDateTime: item.startDateTime,
    endDateTime: item.endDateTime,
    status: tournamentStatus(item, now),
  }));
  out.sort((a, b) => {
    const r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (r !== 0) return r;
    const da = new Date(a.startDateTime).getTime();
    const db = new Date(b.startDateTime).getTime();
    return a.status === 'past' ? db - da : da - db;
  });
  return out;
}
