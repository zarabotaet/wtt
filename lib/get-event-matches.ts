import { fetchArchive, fetchLiveIds, fetchMatchCard, fetchResults10, fetchSchedule } from './wtt-api';
import { computeMergedMatches, dedupeUnits, fullDocCode, normalizeCode } from './merge-matches';
import type { Match, MatchCard, RawUnit } from './types';

const MISSING_SCORE_CONCURRENCY = 8;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  const queue = items.slice();
  async function worker() {
    let item = queue.shift();
    while (item !== undefined) {
      results.push(await fn(item));
      item = queue.shift();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export async function getEventMatches(eventId: string, revalidateSeconds?: number): Promise<Match[]> {
  const [scheduleRaw, results10Raw, archiveRaw, liveIdsRaw] = await Promise.all([
    fetchSchedule(eventId, revalidateSeconds),
    fetchResults10(eventId, revalidateSeconds).catch(() => []),
    fetchArchive(eventId, revalidateSeconds).catch(() => []),
    fetchLiveIds(eventId, revalidateSeconds).catch(() => []),
  ]);

  // IMPORTANT: each schedule.json item can bundle MANY matches under one
  // Competition.Unit array, not a single match — taking only Unit[0]
  // silently drops the rest (see docs/API_REFERENCE.md §2).
  const allUnits: RawUnit[] = [];
  (Array.isArray(scheduleRaw) ? scheduleRaw : []).forEach((item) => {
    (item.Competition?.Unit || []).forEach((u) => allUnits.push(u));
  });
  const units = dedupeUnits(allUnits);
  const archiveItems = archiveRaw.filter((item) => item.match_card);

  const resultsByCode: Record<string, MatchCard> = {};
  results10Raw.forEach((r) => {
    resultsByCode[normalizeCode(r.documentCode)] = r.match_card;
  });

  const liveDocCodesByNormCode: Record<string, string> = {};
  liveIdsRaw.forEach((item) => {
    if (item?.d) liveDocCodesByNormCode[normalizeCode(item.d)] = item.d;
  });

  // Pass 1: merge without fresh live cards, just to see which matches come
  // out flagged live (via ScheduleStatus or the livematchids.json override).
  const firstPass = computeMergedMatches({
    units,
    archiveItems,
    resultsByCode,
    liveDocCodesByNormCode,
    liveCardsByNormCode: {},
    orphanLiveCards: {},
  });

  const codeByNormCode: Record<string, string> = {};
  units.forEach((u) => { codeByNormCode[normalizeCode(u.Code)] = u.Code; });

  const liveNormCodes = firstPass.filter((m) => m.status === 'live').map((m) => m.normCode);
  const liveCardEntries = await mapLimit(liveNormCodes, MISSING_SCORE_CONCURRENCY, async (normCode) => {
    const rawCode = codeByNormCode[normCode];
    if (!rawCode) return null;
    try {
      return [normCode, await fetchMatchCard(eventId, fullDocCode(rawCode), revalidateSeconds)] as const;
    } catch {
      return null; // keep whatever pass 1 already had
    }
  });
  const liveCardsByNormCode: Record<string, MatchCard> = {};
  liveCardEntries.forEach((entry) => {
    if (entry) liveCardsByNormCode[entry[0]] = entry[1];
  });

  // Live matches livematchids.json knows about that schedule.json/archive
  // have no entry for at all.
  const knownNormCodes = new Set(firstPass.map((m) => m.normCode));
  const orphanEntries = Object.entries(liveDocCodesByNormCode).filter(
    ([normCode]) => !knownNormCodes.has(normCode)
  );
  const orphanResults = await mapLimit(orphanEntries, MISSING_SCORE_CONCURRENCY, async ([normCode, docCode]) => {
    try {
      return [normCode, { docCode, card: await fetchMatchCard(eventId, docCode, revalidateSeconds) }] as const;
    } catch {
      return null; // try again next regeneration
    }
  });
  const orphanLiveCards: Record<string, { docCode: string; card: MatchCard | null }> = {};
  orphanResults.forEach((entry) => {
    if (entry) orphanLiveCards[entry[0]] = entry[1];
  });

  // Pass 2: re-merge with fresh live scores + orphan matches included.
  let matches = computeMergedMatches({
    units,
    archiveItems,
    resultsByCode,
    liveDocCodesByNormCode,
    liveCardsByNormCode,
    orphanLiveCards,
  });

  // Completed matches without a score yet (results10 only covers the last
  // 10 finished matches tournament-wide) get their card fetched
  // individually, capped at MISSING_SCORE_CONCURRENCY parallel requests.
  const missing = matches.filter((m) => m.status === 'done' && !m.gameScores);
  if (missing.length) {
    const filledEntries = await mapLimit(missing, MISSING_SCORE_CONCURRENCY, async (m) => {
      try {
        return [m.normCode, await fetchMatchCard(eventId, fullDocCode(m.code), revalidateSeconds)] as const;
      } catch {
        return null; // no score available for this match either — leave as-is
      }
    });
    const filledByNormCode: Record<string, MatchCard> = {};
    filledEntries.forEach((entry) => {
      if (entry) filledByNormCode[entry[0]] = entry[1];
    });
    if (Object.keys(filledByNormCode).length) {
      matches = computeMergedMatches({
        units,
        archiveItems,
        resultsByCode: { ...resultsByCode, ...filledByNormCode },
        liveDocCodesByNormCode,
        liveCardsByNormCode,
        orphanLiveCards,
      });
    }
  }

  // Sort like the prototype did (sortKey(b) - sortKey(a): future → past).
  // String comparison is safe and hydration-consistent here because every
  // startDate is either the API's own "YYYY-MM-DDTHH:mm:ss" (zero-padded,
  // lexicographic order == chronological order) or an orphan-live match's
  // new Date().toISOString() stamp (also zero-padded ISO, same ordering).
  matches.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));

  return matches;
}
