import { NextResponse } from 'next/server';
import { getEventMatches } from '@/lib/get-event-matches';


export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const matches = await getEventMatches(eventId, 15);
  return NextResponse.json(matches);
}
