import { NextResponse } from 'next/server';
import { getEventMatches } from '@/lib/get-event-matches';

export const revalidate = 15;

export async function GET(_req: Request, { params }: { params: { eventId: string } }) {
  const matches = await getEventMatches(params.eventId, 15);
  return NextResponse.json(matches);
}
