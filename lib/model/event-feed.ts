import { combine, createEffect, createEvent, createStore, sample, scopeBind } from 'effector';
import { idbGet, idbSet } from '@/lib/client-cache';
import type { EventEnvelope } from '@/lib/types';
import { entryKey, toEntry, validEntry, type Entry } from './entry';
import { mergeEntry } from './merge-entry';
import { needsFetch, pollPlan } from './poll-mode';

// Client-only model (the scope is forked in components/FeedProvider.tsx):
// which tournament is showing, the in-memory mirror of IndexedDB, when to
// hit GET /api/events/:id, and the poll timer. Nothing here runs on the
// server — every event is fired from browser effects.

export const STALE_MS = 15_000;
export const PREFETCH_MAX_AGE_MS = 60_000;

interface FreshnessCheck {
  id: string;
  entry: Entry | null;
  maxAgeMs: number;
}

export const appStarted = createEvent();
export const eventOpened = createEvent<{ id: string; pushUrl: boolean }>();
export const refreshClicked = createEvent();
export const eventHovered = createEvent<string>();
export const visibilityChanged = createEvent<boolean>();
export const pollTicked = createEvent<number>();

const fetchRequested = createEvent<string>();
const entryMerged = createEvent<Entry>();
const freshnessChecked = createEvent<FreshnessCheck>();
const fetchFailed = createEvent<{ id: string; message: string }>();

export const idbReadFx = createEffect(async ({ id }: { id: string; maxAgeMs: number }): Promise<Entry | null> =>
  validEntry(await idbGet<unknown>(entryKey(id)), id)
);

export const idbWriteFx = createEffect(async (entry: Entry): Promise<void> => {
  await idbSet(entryKey(entry.eventId), entry);
});

export const fetchEventFx = createEffect(async (id: string): Promise<EventEnvelope | null> => {
  const res = await fetch(`/api/events/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as EventEnvelope;
});

export const pushUrlFx = createEffect((id: string) => {
  window.history.pushState(null, '', `/events/${id}`);
});

export const navigateFx = createEffect((id: string) => {
  window.location.href = `/events/${id}`;
});

// Fire-and-forget: the handler returns at once so nothing ever awaits the
// timer. scopeBind is called synchronously, while the handler still runs
// inside the scope, so the later tick lands in the same scope. Superseded
// timers are not cleared — their tick carries an outdated token and is
// ignored.
export const scheduleTickFx = createEffect(({ delayMs, token }: { delayMs: number; token: number }) => {
  const tick = scopeBind(pollTicked, { safe: true });
  setTimeout(() => tick(token), delayMs);
});

export const $entries = createStore<Record<string, Entry>>({});
export const $currentId = createStore('');
export const $current = combine($entries, $currentId, (entries, id) => entries[id] ?? null);
const $inFlight = createStore<Record<string, true>>({});
export const $isFetching = combine($inFlight, $currentId, (inFlight, id) => Boolean(inFlight[id]));
export const $lastError = createStore<string | null>(null);
export const $visible = createStore(true);
const $pollToken = createStore(0);

// --- cache: memory <-> IndexedDB ---

$entries.on(entryMerged, (entries, entry) => ({ ...entries, [entry.eventId]: entry }));
sample({ clock: entryMerged, target: idbWriteFx });

// Merge whatever IndexedDB had with memory (e.g. the SSR snapshot) and
// write the result back, so a server-rendered tournament is cached too.
const idbLoaded = sample({
  clock: idbReadFx.done,
  source: $entries,
  fn: (entries, { params, result }): FreshnessCheck => {
    const inMemory = entries[params.id] ?? null;
    return { id: params.id, maxAgeMs: params.maxAgeMs, entry: result ? mergeEntry(inMemory, result) : inMemory };
  },
});
sample({ clock: idbLoaded, filter: ({ entry }) => entry !== null, fn: ({ entry }) => entry as Entry, target: entryMerged });
sample({ clock: idbLoaded, target: freshnessChecked });

// --- network ---

sample({
  clock: freshnessChecked,
  filter: ({ entry, maxAgeMs }) => needsFetch(entry, maxAgeMs, Date.now()),
  fn: ({ id }) => id,
  target: fetchRequested,
});

// One request per tournament at a time.
sample({
  clock: fetchRequested,
  source: $inFlight,
  filter: (inFlight, id) => !inFlight[id],
  fn: (_, id) => id,
  target: fetchEventFx,
});
$inFlight
  .on(fetchEventFx, (inFlight, id) => ({ ...inFlight, [id]: true as const }))
  .on(fetchEventFx.finally, (inFlight, { params }) => {
    const next = { ...inFlight };
    delete next[params];
    return next;
  });

sample({
  clock: fetchEventFx.done,
  source: $entries,
  filter: (_, { result }) => result !== null,
  fn: (entries, { params, result }) =>
    mergeEntry(entries[params] ?? null, toEntry({ ...(result as EventEnvelope), eventId: params }, Date.now())),
  target: entryMerged,
});

sample({
  clock: fetchEventFx.fail,
  fn: ({ params, error }) => ({ id: params, message: error instanceof Error ? error.message : String(error) }),
  target: fetchFailed,
});
sample({
  clock: fetchEventFx.done,
  filter: ({ result }) => result === null,
  fn: ({ params }) => ({ id: params, message: 'not found' }),
  target: fetchFailed,
});

// Only failures of the tournament on screen matter. With nothing cached to
// show, hand over to a real page load so the server renders not-found or
// its error page.
const currentFailed = sample({
  clock: fetchFailed,
  source: { currentId: $currentId, entries: $entries },
  filter: ({ currentId }, { id }) => id === currentId,
  fn: ({ entries }, { id, message }) => ({ id, message, hasEntry: Boolean(entries[id]) }),
});
sample({ clock: currentFailed, filter: ({ hasEntry }) => !hasEntry, fn: ({ id }) => id, target: navigateFx });
sample({ clock: currentFailed, filter: ({ hasEntry }) => hasEntry, fn: ({ message }) => message, target: $lastError });
sample({
  clock: fetchEventFx.done,
  source: $currentId,
  filter: (currentId, { params, result }) => params === currentId && result !== null,
  fn: () => null,
  target: $lastError,
});

// --- UI intents ---

sample({
  clock: appStarted,
  source: $currentId,
  fn: (id) => ({ id, maxAgeMs: STALE_MS }),
  target: idbReadFx,
});

const switched = sample({
  clock: eventOpened,
  source: $currentId,
  filter: (currentId, { id }) => String(id) !== currentId,
  fn: (_, { id, pushUrl }) => ({ id: String(id), pushUrl }),
});
$currentId.on(switched, (_, { id }) => id);
$lastError.reset(switched);
sample({ clock: switched, filter: ({ pushUrl }) => pushUrl, fn: ({ id }) => id, target: pushUrlFx });
sample({
  clock: switched,
  source: $entries,
  filter: (entries, { id }) => Boolean(entries[id]),
  fn: (entries, { id }) => ({ id, entry: entries[id], maxAgeMs: STALE_MS }),
  target: freshnessChecked,
});
sample({
  clock: switched,
  source: $entries,
  filter: (entries, { id }) => !entries[id],
  fn: (_, { id }) => ({ id, maxAgeMs: STALE_MS }),
  target: idbReadFx,
});

sample({ clock: refreshClicked, source: $currentId, target: fetchRequested });

const hovered = sample({
  clock: eventHovered,
  source: { entries: $entries, currentId: $currentId },
  filter: ({ currentId }, id) => String(id) !== currentId,
  fn: ({ entries }, id) => ({ id: String(id), entry: entries[String(id)] ?? null }),
});
sample({
  clock: hovered,
  filter: ({ entry }) => entry !== null,
  fn: ({ id, entry }) => ({ id, entry, maxAgeMs: PREFETCH_MAX_AGE_MS }),
  target: freshnessChecked,
});
sample({
  clock: hovered,
  filter: ({ entry }) => entry === null,
  fn: ({ id }) => ({ id, maxAgeMs: PREFETCH_MAX_AGE_MS }),
  target: idbReadFx,
});

$visible.on(visibilityChanged, (_, visible) => visible);
sample({
  clock: visibilityChanged,
  source: { id: $currentId, entries: $entries },
  filter: (_, visible) => visible,
  fn: ({ id, entries }) => ({ id, entry: entries[id] ?? null, maxAgeMs: STALE_MS }),
  target: freshnessChecked,
});

// --- poll timer ---

// Re-plan whenever what we show, visibility, or the current request's
// outcome changes. Each plan gets a new token; a tick only counts if its
// token is still the latest.
const currentFetchSettled = sample({
  clock: fetchEventFx.finally,
  source: $currentId,
  filter: (currentId, { params }) => params === currentId,
});
const planned = sample({
  clock: [appStarted, $current, $visible, currentFetchSettled],
  source: { entry: $current, visible: $visible, token: $pollToken },
  fn: ({ entry, visible, token }) => ({ plan: pollPlan(entry, visible, Date.now()), token: token + 1 }),
});
$pollToken.on(planned, (_, { token }) => token);
sample({
  clock: planned,
  filter: ({ plan }) => plan.mode !== 'off',
  fn: ({ plan, token }) => ({ delayMs: plan.delayMs, token }),
  target: scheduleTickFx,
});
sample({
  clock: pollTicked,
  source: { token: $pollToken, id: $currentId },
  filter: ({ token }, tick) => token === tick,
  fn: ({ id }) => id,
  target: fetchRequested,
});
