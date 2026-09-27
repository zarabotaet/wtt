// components/MatchFeed.test.tsx
// jsdom has no indexedDB: lib/client-cache.ts swallows that and returns
// null, so these tests also cover "IndexedDB unavailable" (private mode).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MatchFeed } from './MatchFeed';
import type { EventEnvelope, Match, NormalizedEvent } from '@/lib/types';

function match(overrides: Partial<Match>): Match {
  return {
    code: 'X', normCode: 'X', startDate: '2026-09-10T11:00:00', endDate: '2026-09-10T12:00:00',
    status: 'scheduled', round: 'R', subEvent: 'Singles', table: 'Table 1', venue: 'V',
    players: [{ name: 'A', seed: null }, { name: 'B', seed: null }],
    gameScores: null, winnerIdx: null, isTbd: false,
    ...overrides,
  };
}

function envelope(overrides: Partial<EventEnvelope>): EventEnvelope {
  return { eventId: '1', matches: [], tier: 'final', generatedAt: Date.now(), ...overrides };
}

function okResponse(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
}

const flush = () => act(() => new Promise((r) => setTimeout(r, 20)));

beforeEach(() => {
  // ThemeToggle (in the header) calls window.matchMedia on mount; jsdom
  // doesn't implement it.
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('MatchFeed', () => {
  it('groups matches into Upcoming/Live/Completed sections without refetching a fresh snapshot', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const env = envelope({
      tier: 'live',
      matches: [match({ normCode: 'A', status: 'scheduled' }), match({ normCode: 'B', status: 'done' })],
    });
    render(<MatchFeed envelope={env} events={[]} />);
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the empty-state message when there are no matches at all', async () => {
    vi.stubGlobal('fetch', vi.fn());
    render(<MatchFeed envelope={envelope({ tier: 'future' })} events={[]} />);
    expect(screen.getByText('No matches for this event')).toBeInTheDocument();
    await flush();
  });

  it('switches tournaments client-side, then back via browser history without a request', async () => {
    const events: NormalizedEvent[] = [
      { eventId: '1', eventName: 'Event One', startDateTime: '2026-01-01T00:00:00', endDateTime: '2026-01-02T00:00:00', status: 'past' },
      { eventId: '2', eventName: 'Event Two', startDateTime: '2026-02-01T00:00:00', endDateTime: '2026-02-02T00:00:00', status: 'past' },
    ];
    const eventOne = envelope({
      eventId: '1',
      matches: [match({ normCode: 'A1', status: 'done', players: [{ name: 'Alice One', seed: null }, { name: 'Ann One', seed: null }] })],
    });
    const eventTwo = envelope({
      eventId: '2',
      matches: [match({ normCode: 'B1', status: 'done', players: [{ name: 'Bob Two', seed: null }, { name: 'Carl Two', seed: null }] })],
    });
    const fetchMock = vi.fn(() => okResponse(eventTwo));
    vi.stubGlobal('fetch', fetchMock);
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    const user = userEvent.setup();

    render(<MatchFeed envelope={eventOne} events={events} />);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();

    const input = screen.getByLabelText('Select event');
    await user.click(input);
    await user.clear(input);
    await user.type(input, 'Two');
    await user.click(screen.getByText('Event Two'));

    expect(await screen.findByText('Bob Two')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Event Two')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/events/2');
    expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/events/2');
    await waitFor(() => expect(document.title).toBe('Event Two — Matches & Results'));

    window.history.replaceState(null, '', '/events/1');
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(await screen.findByText('Alice One')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(pushStateSpy).toHaveBeenCalledTimes(1);
  });
});
