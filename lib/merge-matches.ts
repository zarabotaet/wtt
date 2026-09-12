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

export function isGameComplete(scoreA: number, scoreB: number): boolean {
  // Table tennis rule: first to 11, must win by at least 2 (extended
  // deuce past 10-10). A live in-progress game's current point tally can
  // have one side temporarily ahead (e.g. 5-3) without the game actually
  // being finished — comparing raw numbers alone would wrongly count that
  // as a won game, which can even make a still-live match look fully
  // decided (e.g. 2 finished games + a leading in-progress 3rd reading as
  // a false 3-0).
  return Math.max(scoreA, scoreB) >= 11 && Math.abs(scoreA - scoreB) >= 2;
}

export function computeSets(scoresA: number[], scoresB: number[]): { setsA: number; setsB: number } {
  let setsA = 0;
  let setsB = 0;
  scoresA.forEach((a, i) => {
    const b = scoresB[i] || 0;
    if (!isGameComplete(a, b)) return; // in-progress or unplayed — not decided yet
    if (a > b) setsA++;
    else if (b > a) setsB++;
  });
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

export function buildOrphanDoneMatch(docCode: string, startDateLocal: string, card: MatchCard | null): Match {
  // officialresult(_minimal).json is the one endpoint that lists EVERY
  // completed match for a tournament — even a long-running active one,
  // where schedule.json's own Competition.Unit[] only carries a partial,
  // near-term window and silently drops matches from days ago. A code
  // found here but missing from schedule.json/the archive endpoint gets
  // its full card fetched by documentCode, and is trusted as finished
  // regardless of what the score parses to (a walkover/retirement
  // scoreline may not cleanly resolve via isDecided()) — officialresult
  // already asserts the match is over.
  const normCode = normalizeCode(docCode);
  let players: Player[] = [];
  let gameScores: [number[], number[]] | null = null;
  let winnerIdx: 0 | 1 | null = null;
  if (card?.competitiors && card.competitiors.length === 2) {
    players = card.competitiors.map((c) => ({ name: c.competitiorName || '—', seed: null }));
    const c0 = parseScores(card.competitiors[0].scores);
    const c1 = parseScores(card.competitiors[1].scores);
    gameScores = [c0, c1];
    const { setsA, setsB } = computeSets(c0, c1);
    if (setsA !== setsB) {
      winnerIdx = setsA > setsB ? 0 : 1;
    }
  }
  return {
    code: docCode,
    normCode,
    startDate: startDateLocal,
    endDate: startDateLocal,
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

export interface MergeInput {
  units: RawUnit[];
  archiveItems: RawArchiveItem[];
  resultsByCode: Record<string, MatchCard>;
  liveDocCodesByNormCode: Record<string, string>;
  liveCardsByNormCode: Record<string, MatchCard>;
  orphanLiveCards: Record<string, { docCode: string; card: MatchCard | null }>;
  orphanDoneCards: Record<string, { docCode: string; startDateLocal: string; card: MatchCard | null }>;
}

function findResultCard(
  normCode: string,
  liveCardsByNormCode: Record<string, MatchCard>,
  resultsByCode: Record<string, MatchCard>
): MatchCard | null {
  return liveCardsByNormCode[normCode] || resultsByCode[normCode] || null;
}

export function computeMergedMatches(input: MergeInput): Match[] {
  const {
    units,
    archiveItems,
    resultsByCode,
    liveDocCodesByNormCode,
    liveCardsByNormCode,
    orphanLiveCards,
    orphanDoneCards,
  } = input;

  const scheduleMatches = units.map((u) =>
    buildMatch(u, findResultCard(normalizeCode(u.Code), liveCardsByNormCode, resultsByCode))
  );
  const archiveMatches = archiveItems.map(buildMatchFromArchiveItem);

  // For a long-concluded tournament, schedule.json often keeps only a
  // handful of matches while the archive endpoint has the full history —
  // so the archive wins whenever both cover the same match.
  const merged: Record<string, Match> = {};
  scheduleMatches.forEach((m) => { merged[m.normCode] = m; });
  archiveMatches.forEach((m) => { merged[m.normCode] = m; });

  // livematchids.json updates faster and more completely than
  // ScheduleStatus — trust it, unless the match's own score already shows
  // it's finished (buildMatch/buildMatchFromArchiveItem already trust the
  // score over a stale status).
  Object.entries(liveDocCodesByNormCode).forEach(([normCode]) => {
    const existing = merged[normCode];
    if (existing && existing.status !== 'done') {
      existing.status = 'live';
    }
  });

  // A live match schedule.json/archive don't have at all: build it
  // directly from its own matchdata/ card.
  Object.entries(orphanLiveCards).forEach(([normCode, entry]) => {
    if (!merged[normCode]) {
      merged[normCode] = buildOrphanLiveMatch(entry.docCode, entry.card);
    }
  });

  // A completed match officialresult.json knows about that schedule.json
  // and the archive endpoint both have no entry for at all (see
  // buildOrphanDoneMatch above for why this endpoint exists).
  Object.entries(orphanDoneCards).forEach(([normCode, entry]) => {
    if (!merged[normCode]) {
      merged[normCode] = buildOrphanDoneMatch(entry.docCode, entry.startDateLocal, entry.card);
    }
  });

  return Object.values(merged);
}
