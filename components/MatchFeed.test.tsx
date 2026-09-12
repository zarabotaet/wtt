// components/MatchFeed.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MatchFeed } from './MatchFeed';
import type { Match } from '@/lib/types';

// MatchFeed now renders EventCombobox in its header, which calls
// next/navigation's useRouter() — there is no real App Router context
// under a bare `render()` in a Vitest/jsdom test, so it must be mocked.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

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
  it('groups matches into Upcoming/Live/Completed sections, omitting empty ones', () => {
    vi.stubGlobal('fetch', vi.fn());
    const matches = [
      match({ normCode: 'A', status: 'scheduled' }),
      match({ normCode: 'B', status: 'done' }),
    ];
    render(<MatchFeed eventId="EVT1" initialMatches={matches} events={[]} />);
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
  });

  it('shows the empty-state message when there are no matches at all', () => {
    vi.stubGlobal('fetch', vi.fn());
    render(<MatchFeed eventId="EVT1" initialMatches={[]} events={[]} />);
    expect(screen.getByText('No matches for this event')).toBeInTheDocument();
  });
});
