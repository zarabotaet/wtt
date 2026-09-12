import type { MetadataRoute } from 'next';
import { fetchEventsList } from '@/lib/wtt-api';
import { normalizeEventsList } from '@/lib/events';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://wtt-matches.vercel.app';
  const events = normalizeEventsList(await fetchEventsList(3600));
  return [
    { url: `${base}/events`, changeFrequency: 'daily' },
    ...events.map((e) => ({
      url: `${base}/events/${e.eventId}`,
      lastModified: e.endDateTime,
      changeFrequency: 'hourly' as const,
    })),
  ];
}
