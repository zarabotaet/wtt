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
    const { container } = render(<MatchCard match={baseMatch({
      status: 'done',
      gameScores: [[11, 11, 11, 0, 0], [5, 6, 7, 0, 0]],
      winnerIdx: 0,
    })} />);
    // Only 3 games were actually played (the trailing 0-0 pair is an
    // unplayed slot, trimmed by trimTrailingEmptyGames) — each player's row
    // should render exactly 3 per-game score spans, not 5. This does NOT
    // assert "0" never appears anywhere: the losing side's total sets won
    // can legitimately be 0 (e.g. a straight-sets loss) and the original
    // prototype always displays that real number — hiding it would be an
    // unrequested behavior change, not a trimming fix.
    expect(container.querySelectorAll('.games .g')).toHaveLength(6); // 3 games x 2 players
    expect(screen.getByText('Finished')).toBeInTheDocument();
  });

  it('shows a loading note for a done match with no score yet', () => {
    render(<MatchCard match={baseMatch({ status: 'done', gameScores: null })} />);
    expect(screen.getByText('Loading score…')).toBeInTheDocument();
  });
});
