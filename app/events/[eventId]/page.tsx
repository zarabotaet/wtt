import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getEventMatches } from '@/lib/get-event-matches';
import { fetchEventsList, WttApiError } from '@/lib/wtt-api';
import { normalizeEventsList } from '@/lib/events';
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
  // Fast path: skip the expensive officialresult-discovery and
  // missing-score fill-in passes here so switching tournaments doesn't
  // block on dozens of individual matchdata/ fetches — the client-side
  // live-poll hook fires an immediate full fetch on mount (see
  // useLiveScoreUpdater) to fill in whatever this fast pass left out,
  // usually within a second or two.
  const matchesPromise = getEventMatches(params.eventId, 60, { fillMissingScores: false }).catch((err) => {
    if (err instanceof WttApiError && (err.status === 404 || err.status === 403)) {
      notFound();
    }
    throw err;
  });
  const [matches, eventsRaw] = await Promise.all([matchesPromise, fetchEventsList(3600)]);
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <MatchFeed eventId={params.eventId} initialMatches={matches} events={events} />
      <ZoomSlider />
      <Footer />
    </>
  );
}
