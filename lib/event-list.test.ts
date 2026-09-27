import { describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ cacheLife: vi.fn() }));
vi.mock('./wtt-api', () => ({ fetchEventsList: vi.fn() }));

import { cacheLife } from 'next/cache';
import { fetchEventsList } from './wtt-api';
import { getEventsList } from './event-list';

describe('getEventsList', () => {
  it('caches the normalized events list for hours', async () => {
    vi.mocked(fetchEventsList).mockResolvedValue([
      { eventId: '1', eventName: 'Old Open', startDateTime: '2020-01-01T00:00:00Z', endDateTime: '2020-01-05T00:00:00Z' },
    ]);
    const events = await getEventsList();
    expect(cacheLife).toHaveBeenCalledWith('hours');
    expect(fetchEventsList).toHaveBeenCalledWith();
    expect(events).toEqual([expect.objectContaining({ eventId: '1', status: 'past' })]);
  });
});
