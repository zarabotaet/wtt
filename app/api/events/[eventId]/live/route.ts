import { NextResponse } from 'next/server';
import { getEventMatches } from '@/lib/get-event-matches';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { eventId: string } }) {
  const matches = await getEventMatches(params.eventId);
  return NextResponse.json(matches);
}
