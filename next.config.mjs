/** @type {import('next').NextConfig} */
const nextConfig = {
  // 'use cache' / cacheLife (lib/event-list.ts, lib/event-data.ts,
  // lib/wtt-api.ts fetchMatchCard). partialPrefetching lets tournaments
  // missing from generateStaticParams be served from an App Shell and
  // cached after their first visit (ISR with Cache Components).
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
