import { cacheLife } from 'next/cache';

// How a 'use cache' function reports an upstream (WTT) failure.
//
// At request time the error is thrown: errors are never cached, so a failed
// background regeneration keeps serving the last good entry — the history we
// already have survives a WTT outage.
//
// During `next build` a throw inside a 'use cache' function fails the
// prerender even when the caller catches it (a single WTT 502 broke a
// deploy). There the failure is returned as a plain value instead, cached
// only for seconds — which also keeps it out of the prerender — and the
// caller turns it back into an error outside the cache.
export interface CachedFailure {
  wttFailure: string;
}

function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build';
}

export function failInsideCache(err: unknown): CachedFailure {
  if (!isBuildPhase()) throw err;
  cacheLife('seconds');
  return { wttFailure: err instanceof Error ? err.message : String(err) };
}

export function unwrapCached<T>(value: T | CachedFailure): T {
  if (value && typeof value === 'object' && 'wttFailure' in value) {
    throw new Error((value as CachedFailure).wttFailure);
  }
  return value as T;
}
