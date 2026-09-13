'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Match } from '@/lib/types';
import { idbGet, idbSet } from '@/lib/client-cache';

const POLL_MS = 30000;

export interface LiveScoreUpdater {
  matches: Match[];
  refresh: () => Promise<void>;
  isRefreshing: boolean;
}

export function useLiveScoreUpdater(eventId: string, initialMatches: Match[]): LiveScoreUpdater {
  const [matches, setMatches] = useState(initialMatches);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const cacheKey = `matches_${eventId}`;
  // Poll unless the tournament is already fully concluded (every match
  // done) — NOT merely "unless nothing is live yet", which would freeze a
  // page opened before play starts and never resume polling once it does.
  const isConcludedRef = useRef(
    initialMatches.length > 0 && initialMatches.every((m) => m.status === 'done')
  );

  useEffect(() => {
    idbSet(cacheKey, matches);
  }, [matches, cacheKey]);

  const poll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/events/${eventId}/live`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const fresh: Match[] = await res.json();
      isConcludedRef.current = fresh.length > 0 && fresh.every((m) => m.status === 'done');
      setMatches(fresh);
    } catch {
      // Network hiccup or WTT API failure — fall back to the last
      // successfully polled state instead of showing nothing.
      const cached = await idbGet<Match[]>(cacheKey);
      if (cached) setMatches(cached);
    } finally {
      setIsRefreshing(false);
    }
  }, [eventId, cacheKey]);

  // The initial SSR render deliberately skips the expensive
  // officialresult-discovery and missing-score fill-in passes (see
  // getEventMatches's `fillMissingScores` option) so switching
  // tournaments doesn't block on dozens of individual matchdata/
  // fetches. Firing a full poll right after mount — instead of waiting
  // up to POLL_MS for the first background refresh — closes that gap
  // within a second or two, matching the "show what you have instantly,
  // fill in the rest shortly after" feel the original prototype had.
  useEffect(() => {
    if (!isConcludedRef.current) poll();
  }, [poll]);

  useEffect(() => {
    let cancelled = false;
    const interval = setInterval(() => {
      if (isConcludedRef.current || cancelled) return;
      poll();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [poll]);

  return { matches, refresh: poll, isRefreshing };
}
