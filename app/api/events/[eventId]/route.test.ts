import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventEnvelope, Tier } from '@/lib/types';

vi.mock('@/lib/event-data', () => ({ getEventData: vi.fn() }));

import { getEventData } from '@/lib/event-data';
import { GET } from './route';

function call(eventId: string) {
  return GET(new Request(`http://localhost/api/events/${eventId}`), { params: Promise.resolve({ eventId }) });
}

function envelope(tier: Tier): EventEnvelope {
  return { eventId: 'E1', matches: [], tier, generatedAt: 1 };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/events/[eventId]', () => {
  it.each([
    ['final', 'public, max-age=31536000, s-maxage=31536000, immutable'],
    ['live', 'public, s-maxage=15, stale-while-revalidate=60'],
    ['future', 'public, s-maxage=3600, stale-while-revalidate=86400'],
  ] as const)('serves a %s envelope with its Cache-Control', async (tier, header) => {
    vi.mocked(getEventData).mockResolvedValue(envelope(tier));
    const res = await call('E1');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe(header);
    expect(await res.json()).toEqual(envelope(tier));
    expect(getEventData).toHaveBeenCalledWith('E1');
  });

  it('returns an uncacheable 404 for an unknown tournament', async () => {
    vi.mocked(getEventData).mockResolvedValue(null);
    const res = await call('NOPE');
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: 'not found' });
  });

  it('returns an uncacheable 502 when WTT fails', async () => {
    vi.mocked(getEventData).mockRejectedValue(new Error('boom'));
    const res = await call('E1');
    expect(res.status).toBe(502);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
