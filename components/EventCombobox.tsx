'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { NormalizedEvent } from '@/lib/types';

function statusDotClass(status: string): string {
  return `status-dot status-dot-${status}`;
}

export function EventCombobox({
  events,
  currentEventId,
}: {
  events: NormalizedEvent[];
  currentEventId?: string;
}) {
  const router = useRouter();
  const current = events.find((e) => String(e.eventId) === String(currentEventId));
  const [query, setQuery] = useState(current?.eventName ?? '');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? events.filter((e) => e.eventName.toLowerCase().includes(q)) : events;
  }, [events, query]);

  function choose(evt: NormalizedEvent | undefined) {
    if (!evt) return;
    setOpen(false);
    setQuery(evt.eventName);
    inputRef.current?.blur();
    if (String(evt.eventId) !== String(currentEventId)) {
      router.push(`/events/${evt.eventId}`);
    }
  }

  return (
    <div className="event-select" id="eventCombo">
      <span className={statusDotClass(current?.status ?? 'past')} />
      <input
        ref={inputRef}
        type="text"
        className="event-input"
        aria-label="Select event"
        placeholder="Search events…"
        autoComplete="off"
        value={query}
        onFocus={() => { inputRef.current?.select(); setOpen(true); setActiveIndex(0); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActiveIndex(0); }}
        onBlur={() => setTimeout(() => setOpen(false), 100)}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return; }
          if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, filtered.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); choose(filtered[activeIndex]); }
          else if (e.key === 'Escape') { setOpen(false); setQuery(current?.eventName ?? ''); inputRef.current?.blur(); }
        }}
      />
      {open && (
        <div className="event-dropdown">
          {filtered.length === 0 ? (
            <div className="event-option no-match">No matches found</div>
          ) : (
            filtered.map((e, i) => (
              <div
                key={e.eventId}
                className={`event-option${String(e.eventId) === String(currentEventId) ? ' selected' : ''}${i === activeIndex ? ' active' : ''}`}
                onMouseDown={() => choose(e)}
              >
                <span className={statusDotClass(e.status)} />
                {e.eventName}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
