// components/MatchFeed.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MatchFeed } from './MatchFeed';
import type { Match } from '@/lib/types';

function match(overrides: Partial<Match>): Match {
  return {
    code: 'X', normCode: 'X', startDate: '2026-09-10T11:00:00', endDate: '2026-09-10T12:00:00',
    status: 'scheduled', round: 'R', subEvent: 'Singles', table: 'Table 1', venue: 'V',
    players: [{ name: 'A', seed: null }, { name: 'B', seed: null }],
    gameScores: null, winnerIdx: null, isTbd: false,
    ...overrides,
  };
}

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
    render(<MatchFeed eventId="EVT1" initialMatches={matches} />);
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
  });

  it('shows the empty-state message when there are no matches at all', () => {
    vi.stubGlobal('fetch', vi.fn());
    render(<MatchFeed eventId="EVT1" initialMatches={[]} />);
    expect(screen.getByText('No matches for this event')).toBeInTheDocument();
  });
});
