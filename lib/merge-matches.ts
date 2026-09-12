import type {
  Match,
  MatchCard,
  Player,
  RawArchiveItem,
  RawUnit,
} from './types';

const STATUS_PRIORITY: Record<string, number> = {
  Official: 3,
  'Start List': 2,
  Scheduled: 1,
};

export function normalizeCode(code: string | null | undefined): string {
  return (code || '').replace(/-+$/, '');
}

const DOC_CODE_LENGTH = 42;

export function fullDocCode(code: string): string {
  if (!code) return code;
  if (code.length >= DOC_CODE_LENGTH) return code;
  return code + '-'.repeat(DOC_CODE_LENGTH - code.length);
}

export function parseScores(scoresStr: string | null | undefined): number[] {
  if (!scoresStr) return [];
  return scoresStr
    .split(',')
    .map((n) => parseInt(n, 10))
    .filter((n) => !isNaN(n));
}

export function computeSets(scoresA: number[], scoresB: number[]): { setsA: number; setsB: number } {
  const setsA = scoresA.filter((v, i) => v > (scoresB[i] || 0)).length;
  const setsB = scoresB.filter((v, i) => v > (scoresA[i] || 0)).length;
  return { setsA, setsB };
}

export function isDecided(setsA: number, setsB: number, bestOfXGames = 5): boolean {
  const need = Math.ceil(bestOfXGames / 2);
  return setsA >= need || setsB >= need;
}

export function dedupeUnits(units: RawUnit[]): RawUnit[] {
  // WTT's schedule.json can contain several stale snapshots of the same
  // match (Scheduled + Start List + Official all at once) as it was
  // updated over time — keep only the most-advanced one per Code.
  const best: Record<string, RawUnit> = {};
  units.forEach((u) => {
    const c = normalizeCode(u.Code);
    const p = STATUS_PRIORITY[u.ScheduleStatus] || 0;
    const existing = best[c];
    if (!existing || p > (STATUS_PRIORITY[existing.ScheduleStatus] || 0)) {
      best[c] = u;
    }
  });
  return Object.values(best);
}

export function hasRealPlayers(players: Player[]): boolean {
  return players.length > 0 && players.some((p) => p.name !== '—');
}

export function trimTrailingEmptyGames(gameScores: [number[], number[]]): number {
  const [g0, g1] = gameScores;
  const fullLen = Math.max(g0.length, g1.length);
  for (let gi = fullLen - 1; gi >= 0; gi--) {
    if ((g0[gi] || 0) !== 0 || (g1[gi] || 0) !== 0) return gi + 1;
  }
  return fullLen > 0 ? 1 : 0;
}

export function buildMatch(unit: RawUnit, resultCard: MatchCard | null): Match {
  const code = unit.Code;
  const normCode = normalizeCode(code);
  const starts = unit.StartList?.Start || [];
  const players: Player[] = starts.map((s) => {
    const d = s.Competitor?.Description;
    return {
      name: d?.TeamName || '—',
      seed: s.Competitor?.Seed ?? null,
    };
  });
  const descArr = unit.ItemDescription || [];
  const round = descArr[0]?.Value || unit.SubEvent || '';

  let gameScores: [number[], number[]] | null = null;
  let winnerIdx: 0 | 1 | null = null;
  let hasDecidedWinner = false;
  if (resultCard?.competitiors && resultCard.competitiors.length === 2) {
    const c0 = parseScores(resultCard.competitiors[0].scores);
    const c1 = parseScores(resultCard.competitiors[1].scores);
    gameScores = [c0, c1];
    const { setsA, setsB } = computeSets(c0, c1);
    const bestOf = resultCard.matchConfig?.bestOfXGames || 5;
    if (isDecided(setsA, setsB, bestOf)) {
      winnerIdx = setsA > setsB ? 0 : 1;
      hasDecidedWinner = true;
    }
  }

  // WTT's own ScheduleStatus can lag behind reality — if the score itself
  // already shows a decided winner, trust that over the raw status.
  const effectiveStatus = hasDecidedWinner ? 'Official' : unit.ScheduleStatus;
  const isLive = effectiveStatus === 'Start List';
  const isDone = effectiveStatus === 'Official';

  return {
    code,
    normCode,
    startDate: unit.StartDate,
    endDate: unit.EndDate,
    status: isLive ? 'live' : isDone ? 'done' : 'scheduled',
    round,
    subEvent: unit.SubEvent,
    table: unit.VenueDescription?.LocationName || '',
    venue: unit.VenueDescription?.VenueName || '',
    players,
    gameScores,
    winnerIdx,
    isTbd: !hasRealPlayers(players),
  };
}

export function buildMatchFromArchiveItem(item: RawArchiveItem): Match {
  // The archive endpoint (used for tournaments concluded long ago) embeds
  // a full match_card per item — same shape as a matchdata/ fetch, so this
  // mirrors buildMatch's score parsing directly.
  const card = item.match_card;
  const normCode = normalizeCode(item.documentCode);
  let players: Player[] = [];
  let gameScores: [number[], number[]] | null = null;
  let winnerIdx: 0 | 1 | null = null;
  if (card?.competitiors && card.competitiors.length === 2) {
    players = card.competitiors.map((c) => ({ name: c.competitiorName || '—', seed: null }));
    const c0 = parseScores(card.competitiors[0].scores);
    const c1 = parseScores(card.competitiors[1].scores);
    gameScores = [c0, c1];
    const { setsA, setsB } = computeSets(c0, c1);
    const bestOf = card.matchConfig?.bestOfXGames || 5;
    if (isDecided(setsA, setsB, bestOf)) {
      winnerIdx = setsA > setsB ? 0 : 1;
    }
  }
  return {
    code: item.documentCode,
    normCode,
    startDate: item.startDateLocal,
    endDate: item.startDateLocal,
    status: 'done',
    round: card?.subEventDescription || card?.subEventName || '',
    subEvent: card?.subEventName,
    table: card?.tableName || '',
    venue: card?.venueName || '',
    players,
    gameScores,
    winnerIdx,
    isTbd: !hasRealPlayers(players),
  };
}

export function buildOrphanLiveMatch(docCode: string, card: MatchCard | null): Match {
  // livematchids.json can list matches schedule.json hasn't picked up at
  // all yet — build a card straight from a matchdata/ fetch.
  const normCode = normalizeCode(docCode);
  let players: Player[] = [];
  let gameScores: [number[], number[]] | null = null;
  let winnerIdx: 0 | 1 | null = null;
  let status: 'live' | 'done' = 'live';
  if (card?.competitiors && card.competitiors.length === 2) {
    players = card.competitiors.map((c) => ({ name: c.competitiorName || '—', seed: null }));
    const c0 = parseScores(card.competitiors[0].scores);
    const c1 = parseScores(card.competitiors[1].scores);
    gameScores = [c0, c1];
    const { setsA, setsB } = computeSets(c0, c1);
    const bestOf = card.matchConfig?.bestOfXGames || 5;
    // livematchids.json can also lag right at the end of a match — if the
    // score already shows a winner, treat it as finished.
    if (isDecided(setsA, setsB, bestOf)) {
      winnerIdx = setsA > setsB ? 0 : 1;
      status = 'done';
    }
  }
  const now = new Date().toISOString();
  return {
    code: docCode,
    normCode,
    startDate: now,
    endDate: now,
    status,
    round: card?.subEventDescription || card?.subEventName || '',
    subEvent: card?.subEventName,
    table: card?.tableName || '',
    venue: card?.venueName || '',
    players,
    gameScores,
    winnerIdx,
    isTbd: !hasRealPlayers(players),
  };
}
