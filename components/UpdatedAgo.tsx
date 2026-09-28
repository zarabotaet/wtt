'use client';
import { useSyncExternalStore } from 'react';
import type { Tier } from '@/lib/types';

function subscribe(onTick: () => void) {
  const t = setInterval(onTick, 1000);
  return () => clearInterval(t);
}
const getNowSec = () => Math.floor(Date.now() / 1000);
// null on the server and during hydration: the age depends on the viewer's
// clock, so it only appears after mount and never causes a mismatch.
const getServerNowSec = () => null;

export function formatAgo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)} h ago`;
}

// Age of the data itself (generatedAt, when the server built it), not of
// the request — a CDN copy can be older than the moment we fetched it.
export function UpdatedAgo({ generatedAt, tier, error }: { generatedAt: number; tier: Tier; error: string | null }) {
  const nowSec = useSyncExternalStore<number | null>(subscribe, getNowSec, getServerNowSec);
  if (error) return <span className="updated-ago error">Update failed</span>;
  if (tier === 'final' || nowSec === null) return null;
  return <span className="updated-ago">Updated {formatAgo(nowSec * 1000 - generatedAt)}</span>;
}
