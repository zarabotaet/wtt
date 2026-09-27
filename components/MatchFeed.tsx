'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Match, NormalizedEvent } from '@/lib/types';
import { applyFilters, deriveFilterOptions, EMPTY_FILTERS, type Filters } from '@/lib/filters';
import { useLiveScoreUpdater } from '@/lib/hooks/useLiveScoreUpdater';
import { EventCombobox } from './EventCombobox';
import { ThemeToggle } from './ThemeToggle';
import { FilterBar } from './FilterBar';
import { SectionHeader } from './SectionHeader';
import { MatchCard } from './MatchCard';

// Owns which tournament is showing. Switching tournaments must NOT go
// through next/navigation's router — that re-runs the whole [eventId]
// page server-side on every click, which is exactly the "why is this so
// slow, it used to be a fast SPA" complaint this replaces. Instead we
// fetch the fast-path JSON directly and swap it in client-side, updating
// the URL via the History API so it stays correct for sharing/back-forward
// without triggering Next's own data fetch.
export function MatchFeed({
  eventId: initialEventId,
  initialMatches,
  events,
}: {
  eventId: string;
  initialMatches: Match[];
  events: NormalizedEvent[];
}) {
  const [eventId, setEventId] = useState(initialEventId);
  const [seedMatches, setSeedMatches] = useState(initialMatches);
  const [isSwitching, setIsSwitching] = useState(false);
  const eventIdRef = useRef(eventId);
  eventIdRef.current = eventId;

  const selectEvent = useCallback(async (newEventId: string, opts: { pushState?: boolean } = {}) => {
    const { pushState = true } = opts;
    if (String(newEventId) === String(eventIdRef.current)) return;
    setIsSwitching(true);
    try {
      const res = await fetch(`/api/events/${newEventId}/matches`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const fresh: Match[] = await res.json();
      if (pushState) window.history.pushState(null, '', `/events/${newEventId}`);
      setSeedMatches(fresh);
      setEventId(newEventId);
    } catch {
      // Client-side fetch failed (network hiccup, or a genuinely missing
      // event) — fall back to a real navigation so Next's own error
      // handling (e.g. notFound()) still applies.
      window.location.href = `/events/${newEventId}`;
    } finally {
      setIsSwitching(false);
    }
  }, []);

  // Keep the URL's tournament in sync with browser back/forward, since we
  // update it ourselves via history.pushState instead of the router.
  useEffect(() => {
    function onPopState() {
      const match = window.location.pathname.match(/\/events\/([^/]+)/);
      if (match) selectEvent(match[1], { pushState: false });
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [selectEvent]);

  useEffect(() => {
    const ev = events.find((e) => String(e.eventId) === String(eventId));
    if (ev) document.title = `${ev.eventName} — Matches & Results`;
  }, [eventId, events]);

  return (
    <MatchFeedBody
      key={eventId}
      eventId={eventId}
      initialMatches={seedMatches}
      events={events}
      onSelectEvent={selectEvent}
      isSwitching={isSwitching}
    />
  );
}

function MatchFeedBody({
  eventId,
  initialMatches,
  events,
  onSelectEvent,
  isSwitching,
}: {
  eventId: string;
  initialMatches: Match[];
  events: NormalizedEvent[];
  onSelectEvent: (eventId: string) => void;
  isSwitching: boolean;
}) {
  const { matches, refresh, isRefreshing } = useLiveScoreUpdater(eventId, initialMatches);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const options = useMemo(() => deriveFilterOptions(matches), [matches]);
  const filtered = useMemo(() => applyFilters(matches, filters), [matches, filters]);

  const scheduled = filtered.filter((m) => m.status === 'scheduled');
  const live = filtered.filter((m) => m.status === 'live');
  const done = filtered.filter((m) => m.status === 'done');

  return (
    <>
      {/* Event switcher, filters and refresh live in the same sticky
          header row as the theme toggle — on a narrow screen the header's
          own flex-wrap keeps this whole group pinned to the top instead
          of scrolling away, since filters/refresh/switch-event are the
          controls someone actually wants reachable while scrolling a long
          match list. */}
      <header className="bar">
        <div className="brand">
          <span className="dot" />
          Matches
        </div>
        <EventCombobox events={events} currentEventId={eventId} onSelect={onSelectEvent} />
        <FilterBar options={options} filters={filters} onChange={setFilters} />
        <button
          type="button"
          className={`refresh-btn${isRefreshing || isSwitching ? ' spinning' : ''}`}
          onClick={() => refresh()}
          disabled={isRefreshing || isSwitching}
          aria-label="Refresh"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-2.6-6.4" />
            <path d="M21 3v6h-6" />
          </svg>
          <span>Refresh</span>
        </button>
        <div className="spacer" />
        <ThemeToggle />
      </header>
      <div className="status-line">
        <span><b>{live.length}</b> live</span>
        <span><b>{scheduled.length}</b> upcoming</span>
        <span><b>{done.length}</b> completed</span>
      </div>
      <main>
        <div className="feed">
          {!filtered.length && (
            <div className="empty-msg">
              {matches.length ? 'No matches match the selected filters' : 'No matches for this event'}
            </div>
          )}
          {!!scheduled.length && <SectionHeader label="Upcoming" />}
          {scheduled.map((m) => <MatchCard key={m.normCode} match={m} />)}
          {!!live.length && <SectionHeader label="Live" id="sectionLive" />}
          {live.map((m) => <MatchCard key={m.normCode} match={m} />)}
          {!!done.length && <SectionHeader label="Completed" id="sectionPast" />}
          {done.map((m) => <MatchCard key={m.normCode} match={m} />)}
        </div>
      </main>
    </>
  );
}
