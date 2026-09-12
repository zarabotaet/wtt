import type { Metadata } from 'next';
import { getEventMatches } from '@/lib/get-event-matches';
import { fetchEventsList } from '@/lib/wtt-api';
import { normalizeEventsList } from '@/lib/events';
import { EventCombobox } from '@/components/EventCombobox';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ZoomSlider } from '@/components/ZoomSlider';
import { MatchFeed } from '@/components/MatchFeed';
import { Footer } from '@/components/Footer';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { eventId: string } }): Promise<Metadata> {
  const events = normalizeEventsList(await fetchEventsList(3600));
  const event = events.find((e) => String(e.eventId) === String(params.eventId));
  const title = event ? `${event.eventName} — Matches & Results` : 'WTT Matches';
  const description = event ? `Live scores, schedule and results for ${event.eventName}.` : undefined;
  return {
    title,
    description,
    alternates: { canonical: `/events/${params.eventId}` },
    openGraph: { title, description },
  };
}

export default async function EventPage({ params }: { params: { eventId: string } }) {
  const [matches, eventsRaw] = await Promise.all([
    getEventMatches(params.eventId, 60),
    fetchEventsList(3600),
  ]);
  const events = normalizeEventsList(eventsRaw);

  const jsonLd = matches.slice(0, 20).map((m) => ({
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: m.round,
    startDate: m.startDate,
    competitor: m.players.map((p) => ({ '@type': 'Person', name: p.name })),
    location: { '@type': 'Place', name: m.venue },
  }));

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="bar">
        <div className="brand">
          <span className="dot" />
          Matches
        </div>
        <EventCombobox events={events} currentEventId={params.eventId} />
        <div className="spacer" />
        <ThemeToggle />
      </header>
      <MatchFeed eventId={params.eventId} initialMatches={matches} />
      <ZoomSlider />
      <Footer />
    </>
  );
}
