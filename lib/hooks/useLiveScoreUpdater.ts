'use client';
import { useEffect, useRef, useState } from 'react';
import type { Match } from '@/lib/types';
import { idbGet, idbSet } from '@/lib/client-cache';

const POLL_MS = 30000;

export function useLiveScoreUpdater(eventId: string, initialMatches: Match[]): Match[] {
  const [matches, setMatches] = useState(initialMatches);
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

  useEffect(() => {
    let cancelled = false;
    const interval = setInterval(async () => {
      if (isConcludedRef.current) return;
      try {
        const res = await fetch(`/api/events/${eventId}/live`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const fresh: Match[] = await res.json();
        if (cancelled) return;
        isConcludedRef.current = fresh.length > 0 && fresh.every((m) => m.status === 'done');
        setMatches(fresh);
      } catch {
        // Network hiccup or WTT API failure — fall back to the last
        // successfully polled state instead of showing nothing.
        const cached = await idbGet<Match[]>(cacheKey);
        if (!cancelled && cached) setMatches(cached);
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [eventId, cacheKey]);

  return matches;
}
