import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchEventsList, fetchSchedule, fetchMatchCard } from './wtt-api';

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(body) })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchEventsList', () => {
  it('requests the events list JSON and returns the parsed body', async () => {
    mockFetchOnce([{ eventId: '1', eventName: 'Test Open' }]);
    const result = await fetchEventsList();
    expect(result).toEqual([{ eventId: '1', eventName: 'Test Open' }]);
    const [url] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(url).toContain('wtt_upcoming_only_events_list.json');
  });
});

describe('fetchSchedule', () => {
  it('builds a cache-busted URL that includes the eventId', async () => {
    mockFetchOnce([]);
    await fetchSchedule('12345');
    const [url] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string];
    expect(url).toContain('/12345/schedule/schedule.json');
    expect(url).toMatch(/[?&]q=\d+/);
  });

  it('throws when the response is not ok', async () => {
    mockFetchOnce({}, false, 500);
    await expect(fetchSchedule('12345')).rejects.toThrow('500');
  });
});

describe('fetchMatchCard', () => {
  it('builds the matchdata URL from eventId and documentCode', async () => {
    mockFetchOnce({});
    await fetchMatchCard('12345', 'DOC-CODE');
    const [url] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string];
    expect(url).toContain('/matchdata/12345/DOC-CODE.json');
  });
});
