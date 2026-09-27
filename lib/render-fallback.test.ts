import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({ connection: vi.fn(() => Promise.resolve()) }));

import { connection } from 'next/server';
import { withBuildFallback } from './render-fallback';

beforeEach(() => {
  vi.mocked(connection).mockClear();
});

describe('withBuildFallback', () => {
  it('passes a successful value through without deferring the render', async () => {
    await expect(withBuildFallback(Promise.resolve(1), 0)).resolves.toBe(1);
    expect(connection).not.toHaveBeenCalled();
  });

  it('defers to request time and returns the fallback on failure', async () => {
    await expect(withBuildFallback(Promise.reject(new Error('HTTP 503')), [])).resolves.toEqual([]);
    expect(connection).toHaveBeenCalledTimes(1);
  });

  it('defers to request time and rethrows when there is no fallback', async () => {
    await expect(withBuildFallback(Promise.reject(new Error('HTTP 503')))).rejects.toThrow('503');
    expect(connection).toHaveBeenCalledTimes(1);
  });
});
