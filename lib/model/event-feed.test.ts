import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { allSettled, fork, scopeBind } from 'effector';
import type { EventEnvelope, Match } from '@/lib/types';
import { SCHEMA_VERSION, type Entry } from './entry';
import { LIVE_POLL_MS } from './poll-mode';
import {
  $current, $currentId, $entries, $isFetching, $lastError,
  appStarted, eventHovered, eventOpened, fetchEventFx, idbReadFx, idbWriteFx,
  navigateFx, pollTicked, pushUrlFx, refreshClicked, scheduleTickFx, visibilityChanged,
} from './event-feed';

const NOW = new Date(2026, 8, 20, 12, 0, 0).getTime();
const MIN = 60_000;

function localIso(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function match(normCode: string, overrides: Partial<Match> = {}): Match {
  return {
    code: normCode, normCode, startDate: localIso(NOW - 60 * MIN), endDate: '',
    status: 'done', round: 'R', subEvent: 'Singles', table: 'T1', venue: 'V',
    players: [{ name: 'A', seed: null }, { name: 'B', seed: null }],
    gameScores: [[11, 11, 11], [5, 5, 5]], winnerIdx: 0, isTbd: false,
    ...overrides,
  };
}

const LIVE = match('LIVE', { status: 'live', gameScores: null, winnerIdx: null });

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    eventId: 'E1', matches: [match('A')], tier: 'live',
    generatedAt: NOW - MIN, fetchedAt: NOW - MIN, v: SCHEMA_VERSION,
    ...overrides,
  };
}

function envelope(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return { eventId: 'E1', matches: [match('A')], tier: 'live', generatedAt: NOW, ...overrides };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

interface SetupOptions {
  currentId?: string;
  entries?: Record<string, Entry>;
  idb?: Record<string, Entry>;
  fetchImpl?: (id: string) => Promise<EventEnvelope | null>;
}

function setup(opts: SetupOptions = {}) {
  const calls = {
    fetch: [] as string[],
    idbRead: [] as string[],
    idbWrite: [] as Entry[],
    push: [] as string[],
    navigate: [] as string[],
    ticks: [] as { delayMs: number; token: number }[],
  };
  const fetchImpl = opts.fetchImpl ?? (async (id: string) => envelope({ eventId: id }));
  const scope = fork({
    values: [
      [$currentId, opts.currentId ?? 'E1'],
      [$entries, opts.entries ?? {}],
    ],
    handlers: [
      [idbReadFx, async ({ id }: { id: string; maxAgeMs: number }) => { calls.idbRead.push(id); return opts.idb?.[id] ?? null; }],
      [idbWriteFx, async (e: Entry) => { calls.idbWrite.push(e); }],
      [fetchEventFx, async (id: string) => { calls.fetch.push(id); return fetchImpl(id); }],
      [pushUrlFx, (id: string) => { calls.push.push(id); }],
      [navigateFx, (id: string) => { calls.navigate.push(id); }],
      [scheduleTickFx, (p: { delayMs: number; token: number }) => { calls.ticks.push(p); }],
    ],
  });
  const lastTick = () => calls.ticks[calls.ticks.length - 1];
  return { scope, calls, lastTick };
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('start', () => {
  it('never touches the network or schedules polling for a final tournament', async () => {
    const { scope, calls } = setup({ entries: { E1: entry({ tier: 'final', fetchedAt: 0 }) } });
    await allSettled(appStarted, { scope });
    expect(calls.fetch).toEqual([]);
    expect(calls.ticks).toEqual([]);
  });

  it('persists the server-rendered snapshot to IndexedDB', async () => {
    const { scope, calls } = setup({ entries: { E1: entry({ tier: 'final' }) } });
    await allSettled(appStarted, { scope });
    expect(calls.idbRead).toEqual(['E1']);
    expect(calls.idbWrite.map((e) => e.eventId)).toContain('E1');
  });

  it('refetches a stale live snapshot and schedules a 30 s live poll', async () => {
    const { scope, calls, lastTick } = setup({
      entries: { E1: entry({ matches: [LIVE], fetchedAt: NOW - MIN }) },
      fetchImpl: async (id) => envelope({ eventId: id, matches: [LIVE] }),
    });
    await allSettled(appStarted, { scope });
    expect(calls.fetch).toEqual(['E1']);
    expect(scope.getState($current)?.fetchedAt).toBe(NOW);
    expect(lastTick()?.delayMs).toBe(LIVE_POLL_MS);
  });

  it('does not refetch a snapshot younger than 15 s', async () => {
    const { scope, calls, lastTick } = setup({ entries: { E1: entry({ matches: [LIVE], fetchedAt: NOW - 5_000 }) } });
    await allSettled(appStarted, { scope });
    expect(calls.fetch).toEqual([]);
    expect(lastTick()?.delayMs).toBe(LIVE_POLL_MS);
  });

  it('prefers a newer IndexedDB snapshot over an older server-rendered one', async () => {
    const newer = entry({ generatedAt: NOW - 2_000, fetchedAt: NOW - 2_000, matches: [match('A'), match('B')] });
    const { scope } = setup({ entries: { E1: entry({ generatedAt: NOW - 10 * MIN, fetchedAt: NOW - 10 * MIN }) }, idb: { E1: newer } });
    await allSettled(appStarted, { scope });
    expect(scope.getState($current)?.matches.map((m) => m.normCode).sort()).toEqual(['A', 'B']);
  });

  it('keeps newer data when the network returns an older (stale CDN) snapshot', async () => {
    const { scope } = setup({
      entries: { E1: entry({ generatedAt: NOW - 20_000, fetchedAt: NOW - 20_000, matches: [match('A')] }) },
      fetchImpl: async () => envelope({ generatedAt: NOW - 50_000, matches: [match('A', { status: 'live', gameScores: null, winnerIdx: null })] }),
    });
    await allSettled(appStarted, { scope });
    const current = scope.getState($current);
    expect(current?.matches[0].status).toBe('done');
    expect(current?.generatedAt).toBe(NOW - 20_000);
    expect(current?.fetchedAt).toBe(NOW);
  });
});

describe('polling', () => {
  it('waits for the nearest scheduled match when nothing is live', async () => {
    const soon = match('S', { status: 'scheduled', gameScores: null, winnerIdx: null, startDate: localIso(NOW + 10 * MIN) });
    const { scope, lastTick } = setup({ entries: { E1: entry({ matches: [soon], fetchedAt: NOW }) } });
    await allSettled(appStarted, { scope });
    expect(lastTick()?.delayMs).toBe(10 * MIN);
  });

  it('ignores an outdated tick and fetches on the current one', async () => {
    const { scope, calls, lastTick } = setup({ entries: { E1: entry({ matches: [LIVE], fetchedAt: NOW }) } });
    await allSettled(appStarted, { scope });
    const { token } = lastTick()!;
    await allSettled(pollTicked, { scope, params: token - 1 });
    expect(calls.fetch).toEqual([]);
    await allSettled(pollTicked, { scope, params: token });
    expect(calls.fetch).toEqual(['E1']);
  });

  it('stops polling in a hidden tab and catches up when it becomes visible', async () => {
    const { scope, calls, lastTick } = setup({ entries: { E1: entry({ matches: [LIVE], fetchedAt: NOW }) } });
    await allSettled(appStarted, { scope });
    const { token } = lastTick()!;
    const ticksBefore = calls.ticks.length;
    await allSettled(visibilityChanged, { scope, params: false });
    expect(calls.ticks.length).toBe(ticksBefore);
    await allSettled(pollTicked, { scope, params: token });
    expect(calls.fetch).toEqual([]);

    vi.mocked(Date.now).mockReturnValue(NOW + MIN);
    await allSettled(visibilityChanged, { scope, params: true });
    expect(calls.fetch).toEqual(['E1']);
  });
});

describe('switching tournaments', () => {
  it('opens a tournament already in memory without IndexedDB or network', async () => {
    const { scope, calls } = setup({ entries: { E1: entry({ fetchedAt: NOW }), E2: entry({ eventId: 'E2', tier: 'final' }) } });
    await allSettled(eventOpened, { scope, params: { id: 'E2', pushUrl: true } });
    expect(scope.getState($currentId)).toBe('E2');
    expect(scope.getState($current)?.eventId).toBe('E2');
    expect(calls.push).toEqual(['E2']);
    expect(calls.idbRead).toEqual([]);
    expect(calls.fetch).toEqual([]);
  });

  it('does not push a URL when opened from browser history', async () => {
    const { scope, calls } = setup({ entries: { E2: entry({ eventId: 'E2', tier: 'final' }) } });
    await allSettled(eventOpened, { scope, params: { id: 'E2', pushUrl: false } });
    expect(calls.push).toEqual([]);
  });

  it('shows the IndexedDB snapshot before the background refresh finishes', async () => {
    const pending = deferred<EventEnvelope | null>();
    const cached = entry({ eventId: 'E2', fetchedAt: NOW - 2 * MIN });
    const { scope, calls } = setup({ idb: { E2: cached }, fetchImpl: () => pending.promise });
    const settled = allSettled(eventOpened, { scope, params: { id: 'E2', pushUrl: true } });
    await vi.waitFor(() => expect(calls.fetch).toEqual(['E2']));
    expect(scope.getState($current)?.fetchedAt).toBe(cached.fetchedAt);
    expect(scope.getState($isFetching)).toBe(true);
    pending.resolve(envelope({ eventId: 'E2' }));
    await settled;
    expect(scope.getState($current)?.fetchedAt).toBe(NOW);
    expect(scope.getState($isFetching)).toBe(false);
  });

  it('fetches a tournament that is in no cache', async () => {
    const { scope, calls } = setup();
    await allSettled(eventOpened, { scope, params: { id: 'E2', pushUrl: true } });
    expect(calls.idbRead).toEqual(['E2']);
    expect(calls.fetch).toEqual(['E2']);
    expect(scope.getState($current)?.eventId).toBe('E2');
  });

  it('falls back to a full page load when an uncached tournament fails', async () => {
    const { scope, calls } = setup({ fetchImpl: async () => { throw new Error('HTTP 502'); } });
    await allSettled(eventOpened, { scope, params: { id: 'E2', pushUrl: true } });
    expect(calls.navigate).toEqual(['E2']);
  });

  it('falls back to a full page load for an uncached 404', async () => {
    const { scope, calls } = setup({ fetchImpl: async () => null });
    await allSettled(eventOpened, { scope, params: { id: 'E2', pushUrl: true } });
    expect(calls.navigate).toEqual(['E2']);
  });

  it('does not navigate away when a tournament the user already left fails', async () => {
    const pending = deferred<EventEnvelope | null>();
    const { scope, calls } = setup({
      entries: { E1: entry({ fetchedAt: NOW }), E3: entry({ eventId: 'E3', tier: 'final' }) },
      fetchImpl: () => pending.promise,
    });
    const settled = allSettled(eventOpened, { scope, params: { id: 'E2', pushUrl: true } });
    await vi.waitFor(() => expect(calls.fetch).toEqual(['E2']));
    scopeBind(eventOpened, { scope })({ id: 'E3', pushUrl: true });
    pending.reject(new Error('HTTP 502'));
    await settled;
    await allSettled(scope);
    expect(calls.navigate).toEqual([]);
    expect(scope.getState($currentId)).toBe('E3');
    expect(scope.getState($lastError)).toBeNull();
  });
});

describe('refresh and errors', () => {
  it('keeps cached data and reports the error when a refresh fails', async () => {
    const cached = entry({ fetchedAt: NOW - MIN });
    const { scope, calls } = setup({ entries: { E1: cached }, fetchImpl: async () => { throw new Error('HTTP 502'); } });
    await allSettled(appStarted, { scope });
    expect(scope.getState($lastError)).toBe('HTTP 502');
    expect(scope.getState($current)?.matches).toEqual(cached.matches);
    expect(calls.navigate).toEqual([]);
  });

  it('clears the error after a successful refresh', async () => {
    let fail = true;
    const { scope } = setup({
      entries: { E1: entry({ fetchedAt: NOW - MIN }) },
      fetchImpl: async (id) => { if (fail) throw new Error('HTTP 502'); return envelope({ eventId: id }); },
    });
    await allSettled(appStarted, { scope });
    fail = false;
    await allSettled(refreshClicked, { scope });
    expect(scope.getState($lastError)).toBeNull();
  });

  it('sends a single request for repeated refresh clicks', async () => {
    const { scope, calls } = setup({ entries: { E1: entry({ fetchedAt: NOW }) } });
    const refresh = scopeBind(refreshClicked, { scope });
    refresh();
    refresh();
    await allSettled(scope);
    expect(calls.fetch).toEqual(['E1']);
  });
});

describe('hover prefetch', () => {
  it('prefetches a hovered tournament without switching to it', async () => {
    const { scope, calls } = setup({ entries: { E1: entry({ fetchedAt: NOW }) } });
    await allSettled(eventHovered, { scope, params: 'E2' });
    expect(calls.fetch).toEqual(['E2']);
    expect(scope.getState($currentId)).toBe('E1');
    expect(scope.getState($entries).E2?.eventId).toBe('E2');
  });

  it('skips a tournament fetched less than a minute ago', async () => {
    const { scope, calls } = setup({ entries: { E1: entry({ fetchedAt: NOW }), E2: entry({ eventId: 'E2', fetchedAt: NOW - 30_000 }) } });
    await allSettled(eventHovered, { scope, params: 'E2' });
    expect(calls.fetch).toEqual([]);
  });

  it('ignores hovering the tournament already shown', async () => {
    const { scope, calls } = setup({ entries: { E1: entry({ fetchedAt: NOW - 5 * MIN }) } });
    await allSettled(eventHovered, { scope, params: 'E1' });
    expect(calls.fetch).toEqual([]);
  });
});

describe('scheduleTickFx default handler', () => {
  it('delivers the tick to the same scope after the delay', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetched: string[] = [];
    const scope = fork({
      values: [
        [$currentId, 'E1'],
        [$entries, { E1: entry({ matches: [LIVE], fetchedAt: NOW - 1_000 }) }],
      ],
      handlers: [
        [idbReadFx, async () => null],
        [idbWriteFx, async () => {}],
        [fetchEventFx, async (id: string) => { fetched.push(id); return envelope({ eventId: id, matches: [LIVE] }); }],
      ],
    });
    await allSettled(appStarted, { scope });
    expect(fetched).toEqual([]);
    vi.advanceTimersByTime(LIVE_POLL_MS);
    await allSettled(scope);
    expect(fetched).toEqual(['E1']);
  });
});
