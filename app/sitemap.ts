import type { MetadataRoute } from 'next';
import { getEventsList } from '@/lib/event-list';
import { withBuildFallback } from '@/lib/render-fallback';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://wtt-matches.vercel.app';
  const events = await withBuildFallback(getEventsList(), []);
  return [
    { url: `${base}/events`, changeFrequency: 'daily' },
    ...events.map((e) => ({
      url: `${base}/events/${e.eventId}`,
      lastModified: e.endDateTime,
      changeFrequency: 'hourly' as const,
    })),
  ];
}
