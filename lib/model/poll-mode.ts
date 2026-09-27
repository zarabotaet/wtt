import type { Entry } from './entry';

export const LIVE_POLL_MS = 30_000;
export const WAIT_MIN_MS = 30_000;
// Match startDate is venue-local time without an offset, parsed in the
// viewer's timezone, so the computed wait can be off by hours. Capping it
// bounds how late we notice a match that has started.
export const WAIT_MAX_MS = 15 * 60_000;
// The scheduled start has passed but WTT hasn't flipped the match live yet.
export const OVERDUE_MS = 5 * 60_000;

export type PollMode = 'off' | 'live' | 'wait';

export interface PollPlan {
  mode: PollMode;
  delayMs: number;
}

export function pollPlan(entry: Entry | null, visible: boolean, now: number): PollPlan {
  if (!entry || entry.tier === 'final' || !visible) return { mode: 'off', delayMs: 0 };
  if (entry.matches.some((m) => m.status === 'live')) return { mode: 'live', delayMs: LIVE_POLL_MS };
  const starts = entry.matches
    .filter((m) => m.status === 'scheduled')
    .map((m) => new Date(m.startDate).getTime())
    .filter((t) => !isNaN(t));
  if (!starts.length) return { mode: 'wait', delayMs: WAIT_MAX_MS };
  const until = Math.min(...starts) - now;
  if (until <= 0) return { mode: 'wait', delayMs: OVERDUE_MS };
  return { mode: 'wait', delayMs: Math.min(WAIT_MAX_MS, Math.max(WAIT_MIN_MS, until)) };
}

export function needsFetch(entry: Entry | null, maxAgeMs: number, now: number): boolean {
  if (!entry) return true;
  if (entry.tier === 'final') return false;
  return now - entry.fetchedAt > maxAgeMs;
}
