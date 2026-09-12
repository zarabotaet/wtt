import type { Player, RawUnit } from './types';

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
