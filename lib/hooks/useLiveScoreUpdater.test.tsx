import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useLiveScoreUpdater } from './useLiveScoreUpdater';
import type { Match } from '@/lib/types';

function match(normCode: string, status: Match['status']): Match {
  return {
    code: normCode, normCode, startDate: '2026-09-10T11:00:00', endDate: '2026-09-10T12:00:00',
    status, round: 'R', subEvent: 'S', table: 'T', venue: 'V',
    players: [{ name: 'A', seed: null }, { name: 'B', seed: null }],
    gameScores: null, winnerIdx: null, isTbd: false,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useLiveScoreUpdater', () => {
  it('returns the initial matches immediately and does not poll when nothing is live', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const initial = [match('M1', 'scheduled')];
    const { result } = renderHook(() => useLiveScoreUpdater('EVT1', initial));
    expect(result.current).toEqual(initial);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('polls the live API route and swaps in the fresh matches when a live match is present', async () => {
    vi.useFakeTimers();
    const fresh = [match('M1', 'done')];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(fresh) });
    vi.stubGlobal('fetch', fetchMock);
    const initial = [match('M1', 'live')];

    const { result } = renderHook(() => useLiveScoreUpdater('EVT1', initial));
    // The hook's setInterval callback does `await fetch(...)` then
    // `await res.json()` before calling setState, so a bare
    // `vi.advanceTimersByTimeAsync(30000)` needs to run inside `act()` for
    // the resulting state update to flush synchronously (otherwise
    // `result.current` isn't updated yet by the time we read it below, and
    // React logs an "not wrapped in act(...)" warning).
    //
    // Separately: @testing-library/react's `waitFor` drains the microtask
    // queue after its check passes via a real `setTimeout(..., 0)`, but it
    // only knows how to nudge *Jest's* fake-timer clock forward while doing
    // so (it feature-detects a global `jest`, which Vitest doesn't define)
    // — under Vitest's fake timers that internal setTimeout is itself faked
    // and never fires, so `waitFor` hangs forever. Switching back to real
    // timers once the timer-driven part of the test is done (we don't need
    // the fake clock anymore — the poll already ran) sidesteps that.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    vi.useRealTimers();
    await waitFor(() => expect(result.current[0].status).toBe('done'));
    expect(fetchMock).toHaveBeenCalledWith('/api/events/EVT1/live', { cache: 'no-store' });
  });
});
