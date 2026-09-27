'use client';
import { useEffect, useMemo, useState } from 'react';
import { useUnit } from 'effector-react';
import type { EventEnvelope, Match, NormalizedEvent } from '@/lib/types';
import type { Entry } from '@/lib/model/entry';
import { applyFilters, deriveFilterOptions, EMPTY_FILTERS, type Filters } from '@/lib/filters';
import { $current, $currentId, $isFetching, $lastError, eventHovered, eventOpened, refreshClicked } from '@/lib/model/event-feed';
import { FeedProvider } from './FeedProvider';
import { EventCombobox } from './EventCombobox';
import { ThemeToggle } from './ThemeToggle';
import { FilterBar } from './FilterBar';
import { SectionHeader } from './SectionHeader';
import { MatchCard } from './MatchCard';
import { UpdatedAgo } from './UpdatedAgo';

const NO_MATCHES: Match[] = [];

// Switching tournaments never goes through next/navigation's router (that
// would re-run the [eventId] page on the server). The Effector model in
// lib/model/event-feed.ts owns which tournament is showing, its IndexedDB
// cache, background refresh and history.pushState.
export function MatchFeed({ envelope, events }: { envelope: EventEnvelope; events: NormalizedEvent[] }) {
  return (
    <FeedProvider envelope={envelope}>
      <MatchFeedView events={events} />
    </FeedProvider>
  );
}

function MatchFeedView({ events }: { events: NormalizedEvent[] }) {
  const [currentId, current, isFetching, lastError, open, hover, refresh] = useUnit([
    $currentId, $current, $isFetching, $lastError, eventOpened, eventHovered, refreshClicked,
  ]);

  useEffect(() => {
    const ev = events.find((e) => String(e.eventId) === String(currentId));
    if (ev) document.title = `${ev.eventName} — Matches & Results`;
  }, [currentId, events]);

  return (
    <MatchFeedBody
      key={currentId}
      eventId={currentId}
      entry={current}
      events={events}
      isFetching={isFetching}
      lastError={lastError}
      onSelect={(id) => open({ id, pushUrl: true })}
      onHover={hover}
      onRefresh={() => refresh()}
    />
  );
}

// Keyed by tournament, so filters reset on every switch.
function MatchFeedBody({
  eventId,
  entry,
  events,
  isFetching,
  lastError,
  onSelect,
  onHover,
  onRefresh,
}: {
  eventId: string;
  entry: Entry | null;
  events: NormalizedEvent[];
  isFetching: boolean;
  lastError: string | null;
  onSelect: (eventId: string) => void;
  onHover: (eventId: string) => void;
  onRefresh: () => void;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const matches = entry?.matches ?? NO_MATCHES;

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
        <EventCombobox events={events} currentEventId={eventId} onSelect={onSelect} onHover={onHover} />
        <FilterBar options={options} filters={filters} onChange={setFilters} />
        <button
          type="button"
          className={`refresh-btn${isFetching ? ' spinning' : ''}`}
          onClick={onRefresh}
          disabled={isFetching}
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
        {entry && <UpdatedAgo generatedAt={entry.generatedAt} tier={entry.tier} error={lastError} />}
      </div>
      <main>
        <div className="feed">
          {!filtered.length && (
            <div className="empty-msg">
              {!entry
                ? 'Loading…'
                : matches.length
                  ? 'No matches match the selected filters'
                  : 'No matches for this event'}
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
