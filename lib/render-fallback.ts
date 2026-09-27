import { connection } from 'next/server';

// A WTT outage during `next build` must not fail the deploy. On error,
// connection() turns this part of the prerender into request-time
// rendering (it never resolves while prerendering), so the page is built on
// its first visit once WTT is back. At request time connection() resolves
// at once: the fallback is returned if one was given, otherwise the error
// is rethrown.
export async function withBuildFallback<T>(promise: Promise<T>, ...fallback: [] | [T]): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    await connection();
    if (fallback.length) return fallback[0] as T;
    throw err;
  }
}
