'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { fork } from 'effector';
import { Provider, useUnit } from 'effector-react';
import type { EventEnvelope } from '@/lib/types';
import { toEntry } from '@/lib/model/entry';
import { $currentId, $entries, appStarted, eventOpened, visibilityChanged } from '@/lib/model/event-feed';

// One Effector scope per page load, forked from the server-rendered
// envelope on the server and the client alike so hydration matches. The
// envelope's fetchedAt is its generatedAt, so a stale CDN/SSR copy is
// refreshed right after start.
export function FeedProvider({ envelope, children }: { envelope: EventEnvelope; children: ReactNode }) {
  const [scope] = useState(() => {
    const id = String(envelope.eventId);
    return fork({
      values: [
        [$currentId, id],
        [$entries, { [id]: toEntry(envelope, envelope.generatedAt) }],
      ],
    });
  });
  return (
    <Provider value={scope}>
      <Boot />
      {children}
    </Provider>
  );
}

function Boot() {
  const [start, setVisible, open] = useUnit([appStarted, visibilityChanged, eventOpened]);
  useEffect(() => {
    if (document.visibilityState === 'hidden') setVisible(false);
    start();
    function onVisibilityChange() {
      setVisible(document.visibilityState === 'visible');
    }
    // We change the URL ourselves via history.pushState, so back/forward
    // must be mapped back to a tournament by hand.
    function onPopState() {
      const m = window.location.pathname.match(/\/events\/([^/]+)/);
      if (m) open({ id: m[1], pushUrl: false });
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('popstate', onPopState);
    };
  }, [start, setVisible, open]);
  return null;
}
