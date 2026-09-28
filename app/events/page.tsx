import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { getEventsList } from '@/lib/event-list';
import { withBuildFallback } from '@/lib/render-fallback';
import { EventNavCombobox } from '@/components/EventNavCombobox';

export const metadata: Metadata = {
  title: 'All Tournaments — WTT Matches',
  description: 'Browse all World Table Tennis tournaments — ongoing, upcoming, and past.',
};

// The list sits inside <Suspense> so that, with WTT down at build time, it
// can fall back to request-time rendering (lib/render-fallback.ts).
export default function EventsPage() {
  return (
    <main>
      <h1>Tournaments</h1>
      <Suspense fallback={<div className="empty-msg">Loading…</div>}>
        <EventsList />
      </Suspense>
    </main>
  );
}

async function EventsList() {
  const events = await withBuildFallback(getEventsList());
  return (
    <>
      <EventNavCombobox events={events} />
      <ul className="event-list">
        {events.map((e) => (
          <li key={e.eventId}>
            <Link href={`/events/${e.eventId}`}>{e.eventName}</Link>
          </li>
        ))}
      </ul>
    </>
  );
}
