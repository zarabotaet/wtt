import type { EventStatus, NormalizedEvent, RawEventListItem } from './types';

const STATUS_RANK: Record<EventStatus, number> = { ongoing: 0, future: 1, past: 2 };

export function tournamentStatus(item: RawEventListItem, now: number = Date.now()): EventStatus {
  const start = new Date(item.startDateTime).getTime();
  const end = new Date(item.endDateTime).getTime();
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
