import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getEventData } from '@/lib/event-data';
import { getEventsList } from '@/lib/event-list';
import { ZoomSlider } from '@/components/ZoomSlider';
import { MatchFeed } from '@/components/MatchFeed';
import { Footer } from '@/components/Footer';

// Cache Components requires at least one param. Prerender the top of the
// list (ongoing first); every other tournament is served from the App
// Shell on its first visit and cached from then on.
export async function generateStaticParams() {
  const events = await getEventsList();
  return events.slice(0, 1).map((e) => ({ eventId: String(e.eventId) }));
}

export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> {
  const { eventId } = await params;
  const events = await getEventsList();
  const event = events.find((e) => String(e.eventId) === String(eventId));
  const title = event ? `${event.eventName} — Matches & Results` : 'WTT Matches';
  const description = event ? `Live scores, schedule and results for ${event.eventName}.` : undefined;
  return {
    title,
    description,
    alternates: { canonical: `/events/${eventId}` },
    openGraph: { title, description },
  };
}

// params are awaited inside the boundary so tournaments outside
// generateStaticParams still get an App Shell.
export default function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  return (
    <>
      <Suspense fallback={<FeedFallback />}>
        <EventContent params={params} />
      </Suspense>
      <ZoomSlider />
      <Footer />
    </>
  );
}

function FeedFallback() {
  return (
    <main>
      <div className="feed">
        <div className="empty-msg">Loading…</div>
      </div>
    </main>
  );
}

async function EventContent({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const [envelope, events] = await Promise.all([getEventData(eventId), getEventsList()]);
  if (!envelope) notFound();

  const jsonLd = envelope.matches.slice(0, 20).map((m) => ({
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
      <MatchFeed envelope={envelope} events={events} />
    </>
  );
}
