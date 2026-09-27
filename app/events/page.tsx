import type { Metadata } from 'next';
import Link from 'next/link';
import { getEventsList } from '@/lib/event-list';
import { EventNavCombobox } from '@/components/EventNavCombobox';

export const metadata: Metadata = {
  title: 'All Tournaments — WTT Matches',
  description: 'Browse all World Table Tennis tournaments — ongoing, upcoming, and past.',
};

export default async function EventsPage() {
  const events = await getEventsList();
  return (
    <main>
      <h1>Tournaments</h1>
      <EventNavCombobox events={events} />
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
