import { NextResponse } from 'next/server';
import { getEventMatches } from '@/lib/get-event-matches';
import { WttApiError } from '@/lib/wtt-api';

export const revalidate = 60;

// Backs client-side tournament switching (see components/MatchFeed.tsx):
// the combobox fetches this instead of letting Next.js's router re-run the
// whole [eventId] page server-side, so picking a different tournament feels
// instant like the original prototype instead of a full page navigation.
// Mirrors the [eventId]/page.tsx SSR fast path exactly (fillMissingScores:
// false) — the client's useLiveScoreUpdater mount-poll against .../live
// fills in the rest moments later.
export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  try {
    const matches = await getEventMatches(eventId, 60, { fillMissingScores: false });
    return NextResponse.json(matches);
  } catch (err) {
    if (err instanceof WttApiError && (err.status === 404 || err.status === 403)) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    throw err;
  }
}
