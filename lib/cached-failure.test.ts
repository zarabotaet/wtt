import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ cacheLife: vi.fn() }));

import { cacheLife } from 'next/cache';
import { failInsideCache, unwrapCached } from './cached-failure';

const phase = process.env.NEXT_PHASE;

beforeEach(() => {
  vi.mocked(cacheLife).mockClear();
});

afterEach(() => {
  if (phase === undefined) delete process.env.NEXT_PHASE;
  else process.env.NEXT_PHASE = phase;
});

describe('failInsideCache', () => {
  it('rethrows at request time, so a failed regeneration keeps the last good entry', () => {
    delete process.env.NEXT_PHASE;
    expect(() => failInsideCache(new Error('HTTP 503'))).toThrow('503');
    expect(cacheLife).not.toHaveBeenCalled();
  });

  it('returns the failure as a short-lived value during next build', () => {
    process.env.NEXT_PHASE = 'phase-production-build';
    expect(failInsideCache(new Error('HTTP 503'))).toEqual({ wttFailure: 'HTTP 503' });
    expect(cacheLife).toHaveBeenCalledWith('seconds');
  });
});

describe('unwrapCached', () => {
  it('passes real values through, including null', () => {
    expect(unwrapCached([1])).toEqual([1]);
    expect(unwrapCached(null)).toBeNull();
  });

  it('turns a cached failure back into an error outside the cache', () => {
    expect(() => unwrapCached({ wttFailure: 'HTTP 503' })).toThrow('HTTP 503');
  });
});
