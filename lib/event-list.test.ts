import { describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ cacheLife: vi.fn() }));
vi.mock('./wtt-api', () => ({ fetchEventsList: vi.fn() }));

import { cacheLife } from 'next/cache';
import { fetchEventsList } from './wtt-api';
import { getEventsList, getEventsListOrNull } from './event-list';

describe('getEventsList', () => {
  it('caches the normalized events list, refreshed hourly and kept up to 30 days', async () => {
    vi.mocked(fetchEventsList).mockResolvedValue([
      { eventId: '1', eventName: 'Old Open', startDateTime: '2020-01-01T00:00:00Z', endDateTime: '2020-01-05T00:00:00Z' },
    ]);
    const events = await getEventsList();
    expect(cacheLife).toHaveBeenCalledWith({ stale: 300, revalidate: 3600, expire: 30 * 86400 });
    expect(fetchEventsList).toHaveBeenCalledWith();
    expect(events).toEqual([expect.objectContaining({ eventId: '1', status: 'past' })]);
  });
});

describe('getEventsList upstream failure', () => {
  it('caches a failure as null briefly instead of throwing inside the cached scope', async () => {
    vi.mocked(cacheLife).mockClear();
    vi.mocked(fetchEventsList).mockRejectedValue(new Error('HTTP 502'));
    await expect(getEventsListOrNull()).resolves.toBeNull();
    expect(cacheLife).toHaveBeenCalledWith('minutes');
  });

  it('serves the last good list while WTT is down', async () => {
    vi.mocked(fetchEventsList).mockResolvedValue([
      { eventId: '7', eventName: 'Kept Open', startDateTime: '2020-01-01T00:00:00Z', endDateTime: '2020-01-05T00:00:00Z' },
    ]);
    const good = await getEventsList();
    vi.mocked(fetchEventsList).mockRejectedValue(new Error('HTTP 502'));
    await expect(getEventsList()).resolves.toEqual(good);
  });

  it('throws when WTT is down and no list was ever loaded', async () => {
    vi.resetModules();
    vi.mocked(fetchEventsList).mockRejectedValue(new Error('HTTP 502'));
    const fresh = await import('./event-list');
    await expect(fresh.getEventsList()).rejects.toThrow('502');
  });
});
