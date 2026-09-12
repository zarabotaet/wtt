'use client';
import type { Filters, FilterOptions } from '@/lib/filters';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDateOption(dateKey: string): string {
  // Same reasoning as matchDateKey in lib/filters.ts: plain string parsing,
  // not Date/toLocaleDateString, so server-rendered and client-hydrated
  // output can never disagree by a day depending on which timezone ran it.
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateKey;
  const [, , month, day] = match;
  return `${MONTH_NAMES[Number(month) - 1]} ${Number(day)}`;
}

export function FilterBar({
  options,
  filters,
  onChange,
}: {
  options: FilterOptions;
  filters: Filters;
  onChange: (f: Filters) => void;
}) {
  const anyActive = filters.subEvent || filters.table || filters.date;
  return (
    <div className="filter-bar">
      <select aria-label="Event type" value={filters.subEvent} onChange={(e) => onChange({ ...filters, subEvent: e.target.value })}>
        <option value="">All types</option>
        {options.subEvents.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select aria-label="Table" value={filters.table} onChange={(e) => onChange({ ...filters, table: e.target.value })}>
        <option value="">All tables</option>
        {options.tables.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <select aria-label="Date" value={filters.date} onChange={(e) => onChange({ ...filters, date: e.target.value })}>
        <option value="">All dates</option>
        {options.dates.map((d) => <option key={d} value={d}>{formatDateOption(d)}</option>)}
      </select>
      {anyActive ? (
        <button className="filter-reset" type="button" onClick={() => onChange({ subEvent: '', table: '', date: '' })}>
          Reset
        </button>
      ) : null}
    </div>
  );
}
