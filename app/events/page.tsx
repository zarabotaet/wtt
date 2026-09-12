import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchEventsList } from '@/lib/wtt-api';
import { normalizeEventsList } from '@/lib/events';
import { EventCombobox } from '@/components/EventCombobox';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'All Tournaments — WTT Matches',
  description: 'Browse all World Table Tennis tournaments — ongoing, upcoming, and past.',
};

export default async function EventsPage() {
  const events = normalizeEventsList(await fetchEventsList(3600));
  return (
    <main>
      <h1>Tournaments</h1>
      <EventCombobox events={events} />
      <ul className="event-list">
        {events.map((e) => (
          <li key={e.eventId}>
            <Link href={`/events/${e.eventId}`}>{e.eventName}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
