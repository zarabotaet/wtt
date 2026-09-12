'use client';
import { useEffect, useRef, useState } from 'react';
import type { Match } from '@/lib/types';
import { idbGet, idbSet } from '@/lib/client-cache';

const POLL_MS = 30000;

export function useLiveScoreUpdater(eventId: string, initialMatches: Match[]): Match[] {
  const [matches, setMatches] = useState(initialMatches);
  const cacheKey = `matches_${eventId}`;
  const hasLiveRef = useRef(initialMatches.some((m) => m.status === 'live'));

  useEffect(() => {
    idbSet(cacheKey, matches);
  }, [matches, cacheKey]);

  useEffect(() => {
    let cancelled = false;
    const interval = setInterval(async () => {
      if (!hasLiveRef.current) return;
      try {
        const res = await fetch(`/api/events/${eventId}/live`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const fresh: Match[] = await res.json();
        if (cancelled) return;
        hasLiveRef.current = fresh.some((m) => m.status === 'live');
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
