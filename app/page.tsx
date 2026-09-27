import { redirect } from 'next/navigation';
import { getEventsList } from '@/lib/event-list';

export default async function RootPage() {
  const events = await getEventsList();
  if (events.length) {
    redirect(`/events/${events[0].eventId}`);
  }
  redirect('/events');
}
