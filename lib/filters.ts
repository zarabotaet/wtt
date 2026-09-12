import type { Match } from './types';

export interface Filters {
  subEvent: string;
  table: string;
  date: string;
}

export const EMPTY_FILTERS: Filters = { subEvent: '', table: '', date: '' };

export interface FilterOptions {
  subEvents: string[];
  tables: string[];
  dates: string[];
}

export function matchDateKey(startDate: string): string {
  // Parsed as plain text, not through Date (which reinterprets a
  // timezone-less string as local time in whatever environment runs it —
  // the server during SSR, the visitor's browser during hydration, and
  // Vitest locally are three different "local"s). This keeps the key
  // identical everywhere and matches the design decision to show venue
  // time as-is, with no timezone conversion at all.
  const match = startDate.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

export function applyFilters(matches: Match[], filters: Filters): Match[] {
  return matches.filter((m) => {
    if (filters.subEvent && m.subEvent !== filters.subEvent) return false;
    if (filters.table && m.table !== filters.table) return false;
    if (filters.date && matchDateKey(m.startDate) !== filters.date) return false;
    return true;
  });
}

export function deriveFilterOptions(matches: Match[]): FilterOptions {
  const subEvents: string[] = [];
  const tables: string[] = [];
  const dates: string[] = [];
  const seenSub = new Set<string>();
  const seenTable = new Set<string>();
  const seenDate = new Set<string>();
  matches.forEach((m) => {
    if (m.subEvent && !seenSub.has(m.subEvent)) { seenSub.add(m.subEvent); subEvents.push(m.subEvent); }
    if (m.table && !seenTable.has(m.table)) { seenTable.add(m.table); tables.push(m.table); }
    const dk = matchDateKey(m.startDate);
    if (dk && !seenDate.has(dk)) { seenDate.add(dk); dates.push(dk); }
  });
  subEvents.sort();
  tables.sort();
  dates.sort();
  return { subEvents, tables, dates };
}
