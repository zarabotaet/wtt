import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getEventsList } from '@/lib/event-list';
import { withBuildFallback } from '@/lib/render-fallback';

// Inside <Suspense> so that, with WTT down at build time, the redirect can
// fall back to request-time rendering (lib/render-fallback.ts).
export default function RootPage() {
  return (
    <Suspense>
      <RedirectToCurrentEvent />
    </Suspense>
  );
}

async function RedirectToCurrentEvent(): Promise<null> {
  const events = await withBuildFallback(getEventsList(), []);
  if (events.length) {
    redirect(`/events/${events[0].eventId}`);
  }
  redirect('/events');
}
