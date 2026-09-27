'use client';
import { useRouter } from 'next/navigation';
import type { NormalizedEvent } from '@/lib/types';
import { EventCombobox } from './EventCombobox';

// Used from the /events listing page, where there's no existing match
// feed to swap data into client-side — picking an event here is a real
// navigation to that event's page, so this is the one place EventCombobox
// is wired to next/navigation's router instead of MatchFeed's client-side
// fetch-and-swap (see components/MatchFeed.tsx for why that page avoids it).
export function EventNavCombobox({ events }: { events: NormalizedEvent[] }) {
  const router = useRouter();
  return <EventCombobox events={events} onSelect={(eventId) => router.push(`/events/${eventId}`)} />;
}
