import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MatchCard } from './MatchCard';
import type { Match } from '@/lib/types';

function baseMatch(overrides: Partial<Match> = {}): Match {
  return {
    code: 'CODE1',
    normCode: 'CODE1',
    startDate: '2026-09-10T11:00:00',
    endDate: '2026-09-10T12:00:00',
    status: 'scheduled',
    round: "Women's Singles - Round of 32",
    subEvent: "Women's Singles",
    table: 'Table 3',
    venue: 'Macao East Asian Games Dome',
    players: [{ name: 'WANG Yidi', seed: 1 }, { name: 'Dina MESHREF', seed: null }],
    gameScores: null,
    winnerIdx: null,
    isTbd: false,
    ...overrides,
  };
}

describe('MatchCard', () => {
  it('renders both player names', () => {
    render(<MatchCard match={baseMatch()} />);
    expect(screen.getByText('WANG Yidi')).toBeInTheDocument();
    expect(screen.getByText('Dina MESHREF')).toBeInTheDocument();
  });

  it('shows a TBD placeholder instead of hiding an unfilled bracket slot', () => {
    render(<MatchCard match={baseMatch({ players: [], isTbd: true })} />);
    expect(screen.getByText('TBD')).toBeInTheDocument();
  });

  it('marks the winning player row and trims trailing 0-0 games', () => {
    render(<MatchCard match={baseMatch({
      status: 'done',
      gameScores: [[11, 11, 11, 0, 0], [5, 6, 7, 0, 0]],
      winnerIdx: 0,
    })} />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.getByText('Finished')).toBeInTheDocument();
  });

  it('shows a loading note for a done match with no score yet', () => {
    render(<MatchCard match={baseMatch({ status: 'done', gameScores: null })} />);
    expect(screen.getByText('Loading score…')).toBeInTheDocument();
  });
});
