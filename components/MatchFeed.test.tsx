// components/MatchFeed.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MatchFeed } from './MatchFeed';
import type { Match, NormalizedEvent } from '@/lib/types';

function match(overrides: Partial<Match>): Match {
  return {
    code: 'X', normCode: 'X', startDate: '2026-09-10T11:00:00', endDate: '2026-09-10T12:00:00',
    status: 'scheduled', round: 'R', subEvent: 'Singles', table: 'Table 1', venue: 'V',
    players: [{ name: 'A', seed: null }, { name: 'B', seed: null }],
    gameScores: null, winnerIdx: null, isTbd: false,
    ...overrides,
  };
}

beforeEach(() => {
  // MatchFeed's header now also renders ThemeToggle, whose effect calls
  // window.matchMedia unconditionally on mount — jsdom doesn't implement
  // it at all, so every test would throw without this mock (same fix as
  // ThemeToggle's own test needed).
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
});

describe('MatchFeed', () => {
  it('groups matches into Upcoming/Live/Completed sections, omitting empty ones', async () => {
    // Not every match here is 'done', so useLiveScoreUpdater's
    // immediate-on-mount poll (see lib/hooks/useLiveScoreUpdater.ts) fires
    // right away — give fetch a real resolution and wait for it so that
    // state update settles inside act() instead of leaking a warning.
    const matches = [
      match({ normCode: 'A', status: 'scheduled' }),
      match({ normCode: 'B', status: 'done' }),
    ];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(matches) });
    vi.stubGlobal('fetch', fetchMock);
    render(<MatchFeed eventId="EVT1" initialMatches={matches} events={[]} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
  });

  it('shows the empty-state message when there are no matches at all', async () => {
    // An empty initial list isn't treated as "concluded" (that requires
    // at least one match, all done), so the mount poll still fires here —
    // give it a real resolution and wait for it so the resulting state
    // update settles inside act() instead of leaking a warning.
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    vi.stubGlobal('fetch', fetchMock);
    render(<MatchFeed eventId="EVT1" initialMatches={[]} events={[]} />);
    expect(screen.getByText('No matches for this event')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it('switches tournaments via the combobox with a client-side fetch + history.pushState, not a full page navigation', async () => {
    // Every match here starts 'done' so useLiveScoreUpdater's mount-poll
    // (in both the initial render and the post-switch remount) stays
    // silent — isolating the single fetch this test cares about: the
    // combobox's own client-side switch request.
    const eventA = [match({ normCode: 'A1', status: 'done' })];
    const eventB = [match({ normCode: 'B1', status: 'done' })];
    const events: NormalizedEvent[] = [
      { eventId: '1', eventName: 'Event One', startDateTime: '2026-01-01T00:00:00', endDateTime: '2026-01-02T00:00:00', status: 'past' },
      { eventId: '2', eventName: 'Event Two', startDateTime: '2026-02-01T00:00:00', endDateTime: '2026-02-02T00:00:00', status: 'past' },
    ];
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(url.includes('/2/matches') ? eventB : eventA) })
    );
    vi.stubGlobal('fetch', fetchMock);
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    const user = userEvent.setup();

    render(<MatchFeed eventId="1" initialMatches={eventA} events={events} />);
    expect(fetchMock).not.toHaveBeenCalled();

    const input = screen.getByLabelText('Select event');
    await user.click(input);
    await user.clear(input);
    await user.type(input, 'Two');
    await user.click(screen.getByText('Event Two'));

    await waitFor(() => expect(screen.getByDisplayValue('Event Two')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/events/2/matches', { cache: 'no-store' });
    expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/events/2');
    expect(document.title).toBe('Event Two — Matches & Results');
  });
});
