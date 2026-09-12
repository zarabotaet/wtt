'use client';
import { useMemo, useState } from 'react';
import type { Match } from '@/lib/types';
import { applyFilters, deriveFilterOptions, EMPTY_FILTERS, type Filters } from '@/lib/filters';
import { useLiveScoreUpdater } from '@/lib/hooks/useLiveScoreUpdater';
import { FilterBar } from './FilterBar';
import { SectionHeader } from './SectionHeader';
import { MatchCard } from './MatchCard';

export function MatchFeed({ eventId, initialMatches }: { eventId: string; initialMatches: Match[] }) {
  const { matches, refresh, isRefreshing } = useLiveScoreUpdater(eventId, initialMatches);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const options = useMemo(() => deriveFilterOptions(matches), [matches]);
  const filtered = useMemo(() => applyFilters(matches, filters), [matches, filters]);

  const scheduled = filtered.filter((m) => m.status === 'scheduled');
  const live = filtered.filter((m) => m.status === 'live');
  const done = filtered.filter((m) => m.status === 'done');

  return (
    <>
      <FilterBar options={options} filters={filters} onChange={setFilters} />
      <div className="status-line">
        <span><b>{live.length}</b> live</span>
        <span><b>{scheduled.length}</b> upcoming</span>
        <span><b>{done.length}</b> completed</span>
        <div className="spacer" />
        <button
          type="button"
          className={`refresh-btn${isRefreshing ? ' spinning' : ''}`}
          onClick={() => refresh()}
          disabled={isRefreshing}
          aria-label="Refresh"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-2.6-6.4" />
            <path d="M21 3v6h-6" />
          </svg>
          <span>Refresh</span>
        </button>
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
