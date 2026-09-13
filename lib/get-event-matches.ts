import { fetchArchive, fetchLiveIds, fetchMatchCard, fetchOfficialResult, fetchResults10, fetchSchedule } from './wtt-api';
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

export interface GetEventMatchesOptions {
  // The officialresult(_minimal).json discovery pass and the final
  // missing-score fill-in pass each cost one whole batch of individually
  // fetched matchdata/ cards (concurrency-limited, but still real
  // network round-trips) — cheap for a tournament with a handful of
  // finished matches, but for one deep into its bracket (dozens of
  // completed matches schedule.json no longer lists in full) this can
  // add multiple seconds to a single call. Set false for a fast,
  // render-blocking SSR pass (schedule + last-10 results + live scores
  // for whatever's *currently* live are usually cheap); the client-side
  // live-poll route always calls with this at its default (true) shortly
  // after the page mounts, so the fuller picture still arrives within a
  // couple of seconds — same "show what you have, fill in the rest in
  // the background" shape the original prototype had, just moved from
  // client-side IndexedDB to a fast-SSR-then-poll split.
  fillMissingScores?: boolean;
}

export async function getEventMatches(
  eventId: string,
  revalidateSeconds?: number,
  { fillMissingScores = true }: GetEventMatchesOptions = {}
): Promise<Match[]> {
  const [scheduleRaw, results10Raw, archiveRaw, liveIdsRaw, officialResultRaw] = await Promise.all([
    fetchSchedule(eventId, revalidateSeconds),
    fetchResults10(eventId, revalidateSeconds).catch(() => []),
    fetchArchive(eventId, revalidateSeconds).catch(() => []),
    fetchLiveIds(eventId, revalidateSeconds).catch(() => []),
    fillMissingScores ? fetchOfficialResult(eventId, revalidateSeconds).catch(() => []) : Promise.resolve([]),
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

  // officialresult(_minimal).json lists EVERY completed match of the
  // tournament — unlike schedule.json, which only carries a partial,
  // near-term window and silently drops matches from days ago once a
  // tournament has run long enough. Anything it lists that schedule.json
  // and the archive endpoint both have no entry for gets its own matchdata/
  // card fetched individually, same concurrency-limited pattern as the
  // other point lookups below. Skipped entirely in the fast path.
  const orphanDoneCards: Record<string, { docCode: string; startDateLocal: string; card: MatchCard | null }> = {};
  if (fillMissingScores) {
    const knownScheduleCodes = new Set(units.map((u) => normalizeCode(u.Code)));
    const knownArchiveCodes = new Set(archiveItems.map((item) => normalizeCode(item.documentCode)));
    const officialResultCandidates = (Array.isArray(officialResultRaw) ? officialResultRaw : []).filter(
      (item) => {
        const normCode = normalizeCode(item.documentCode);
        return !knownScheduleCodes.has(normCode) && !knownArchiveCodes.has(normCode);
      }
    );
    const orphanDoneEntries = await mapLimit(officialResultCandidates, MISSING_SCORE_CONCURRENCY, async (item) => {
      const normCode = normalizeCode(item.documentCode);
      try {
        return [
          normCode,
          {
            docCode: item.documentCode,
            startDateLocal: item.startDateLocal,
            card: await fetchMatchCard(eventId, item.documentCode, revalidateSeconds),
          },
        ] as const;
      } catch {
        return null; // try again next regeneration
      }
    });
    orphanDoneEntries.forEach((entry) => {
      if (entry) orphanDoneCards[entry[0]] = entry[1];
    });
  }

  // Pass 1: merge without fresh live cards, just to see which matches come
  // out flagged live (via ScheduleStatus or the livematchids.json override).
  const firstPass = computeMergedMatches({
    units,
    archiveItems,
    resultsByCode,
    liveDocCodesByNormCode,
    liveCardsByNormCode: {},
    orphanLiveCards: {},
    orphanDoneCards,
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
    orphanDoneCards,
  });

  // Completed matches without a score yet (results10 only covers the last
  // 10 finished matches tournament-wide) get their card fetched
  // individually, capped at MISSING_SCORE_CONCURRENCY parallel requests.
  // Skipped in the fast path — these render with a "Loading score…" note
  // until the next full (client-polled) fetch fills them in.
  const missing = fillMissingScores ? matches.filter((m) => m.status === 'done' && !m.gameScores) : [];
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
        orphanDoneCards,
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
