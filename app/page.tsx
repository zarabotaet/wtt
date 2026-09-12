import { redirect } from 'next/navigation';
import { fetchEventsList } from '@/lib/wtt-api';
import { normalizeEventsList } from '@/lib/events';

export const revalidate = 3600;

export default async function RootPage() {
  const events = normalizeEventsList(await fetchEventsList(3600));
  if (events.length) {
    redirect(`/events/${events[0].eventId}`);
  }
  redirect('/events');
}
