import { getEventData } from '@/lib/event-data';
import { TIER_CACHE_CONTROL } from '@/lib/tier';

// The one client data endpoint (replaces .../matches and .../live).
// Cache-Control follows the tier so the CDN absorbs repeat requests and a
// final tournament is never requested twice by the same browser.
export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  try {
    const envelope = await getEventData(eventId);
    if (!envelope) {
      return Response.json({ error: 'not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json(envelope, { headers: { 'Cache-Control': TIER_CACHE_CONTROL[envelope.tier] } });
  } catch {
    return Response.json({ error: 'upstream error' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
