import { getEventData } from '@/lib/event-data';

// Temporary shim until the Effector UI switches to GET /api/events/[eventId]
// (layered-cache plan, Task 8): returns the cached snapshot's matches.
export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const envelope = await getEventData(eventId);
  if (!envelope) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json(envelope.matches);
}
