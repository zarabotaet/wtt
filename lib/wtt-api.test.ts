import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchEventsList, fetchSchedule, fetchMatchCard, fetchOfficialResult } from './wtt-api';
import { cacheLife } from 'next/cache';

vi.mock('next/cache', () => ({ cacheLife: vi.fn() }));

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
  it('requests the events list JSON and returns the parsed body, cache-busted like every other endpoint', async () => {
    mockFetchOnce([{ eventId: '1', eventName: 'Test Open' }]);
    const result = await fetchEventsList();
    expect(result).toEqual([{ eventId: '1', eventName: 'Test Open' }]);
    const [url] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(url).toContain('wtt_upcoming_only_events_list.json');
    expect(url).toMatch(/[?&]q=\d+/);
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

  it('keeps the same cache-busting value across calls within one revalidate window, so Next\'s Data Cache can still reuse a response — but always includes one, so WTT\'s own CDN cache is never served stale (regression: WTT confirmed serving a 17+ hour stale response for an unbusted URL)', async () => {
    mockFetchOnce([]);
    await fetchSchedule('12345', 60);
    const [urlA] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string];
    mockFetchOnce([]);
    await fetchSchedule('12345', 60);
    const [urlB] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string];
    expect(urlA).toMatch(/[?&]q=\d+/);
    expect(urlA).toBe(urlB); // same bucket, called moments apart with the same revalidate window
  });

  it('omits the revalidate option and uses cache: no-store when no revalidateSeconds is given, still cache-busted', async () => {
    mockFetchOnce([]);
    await fetchSchedule('12345');
    const [, options] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string, RequestInit];
    expect(options).toEqual({ cache: 'no-store' });
  });

  it('passes next.revalidate instead of cache: no-store when revalidateSeconds is given', async () => {
    mockFetchOnce([]);
    await fetchSchedule('12345', 60);
    const [, options] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string, RequestInit];
    expect(options).toEqual({ next: { revalidate: 60 } });
  });
});

describe('fetchMatchCard', () => {
  beforeEach(() => {
    vi.mocked(cacheLife).mockClear();
  });

  it('builds a cache-busted matchdata URL from eventId and documentCode', async () => {
    mockFetchOnce({});
    await fetchMatchCard('12345', 'DOC-CODE');
    const [url] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string];
    expect(url).toContain('/matchdata/12345/DOC-CODE.json');
    expect(url).toMatch(/[?&]q=\d+/);
  });

  it('caches a card with a decided winner for the maximum lifetime', async () => {
    mockFetchOnce({
      competitiors: [{ scores: '11,11,11,0,0' }, { scores: '5,6,7,0,0' }],
      matchConfig: { bestOfXGames: 5 },
    });
    await fetchMatchCard('12345', 'DOC');
    expect(cacheLife).toHaveBeenCalledTimes(1);
    expect(cacheLife).toHaveBeenCalledWith('max');
  });

  it('keeps an undecided card only for a couple of seconds', async () => {
    mockFetchOnce({
      competitiors: [{ scores: '11,5,0,0,0' }, { scores: '5,11,0,0,0' }],
      matchConfig: { bestOfXGames: 5 },
    });
    await fetchMatchCard('12345', 'DOC');
    expect(cacheLife).toHaveBeenCalledTimes(1);
    expect(cacheLife).toHaveBeenCalledWith({ stale: 0, revalidate: 1, expire: 2 });
  });

  it('treats a card without two competitors as undecided', async () => {
    mockFetchOnce({});
    await fetchMatchCard('12345', 'DOC');
    expect(cacheLife).toHaveBeenCalledWith({ stale: 0, revalidate: 1, expire: 2 });
  });
  it('treats a best-of-7 card at 3-0 in sets as undecided', async () => {
    mockFetchOnce({
      competitiors: [{ scores: '11,11,11,0,0,0,0' }, { scores: '5,6,7,0,0,0,0' }],
      matchConfig: { bestOfXGames: 7 },
    });
    await fetchMatchCard('12345', 'DOC');
    expect(cacheLife).toHaveBeenCalledWith({ stale: 0, revalidate: 1, expire: 2 });
  });

  it('defaults to best-of-5 when matchConfig is missing and caches a decided card for max', async () => {
    mockFetchOnce({ competitiors: [{ scores: '11,11,11,0,0' }, { scores: '5,6,7,0,0' }] });
    await fetchMatchCard('12345', 'DOC');
    expect(cacheLife).toHaveBeenCalledWith('max');
  });
});

describe('fetchOfficialResult', () => {
  it('builds a cache-busted URL to officialresult_minimal.json for the eventId', async () => {
    mockFetchOnce([]);
    await fetchOfficialResult('12345');
    const [url] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string];
    expect(url).toContain('/12345/officialresult/officialresult_minimal.json');
    expect(url).toMatch(/[?&]q=\d+/);
  });
});
