# Design: Next.js migration foundation (prototype → SSR/ISR on Vercel)

Status: approved by user on 2026-09-12. Scope decomposition: this is the
**foundation** spec only. A follow-up spec (not yet written) will add
features on top: more tournaments on one page, player statistics,
head-to-head (H2H) history. Do not add those features under this spec —
open a new brainstorming pass for them instead.

## Context

`prototype/wtt-matches.html` is a working, single-file client-side viewer
for World Table Tennis (WTT) matches, built against WTT's undocumented API
(see `docs/API_REFERENCE.md`). It fetches directly from the browser, which
means:

- Zero SEO (content renders after JS runs, search engines see an empty shell).
- It only works against the one WTT mirror domain that allows cross-origin
  browser requests (see API_REFERENCE.md §0) — the other two mirrors 400/422
  or block it outright.
- No shared deploy/analytics/domain.

All of the prototype's data-handling logic (dedup, source merging, status
recomputation from score, `Unit[]` array bug fix, `documentCode` padding) is
already debugged against live WTT data over many iterations — see
`docs/KNOWN_ISSUES.md` for the bug history. **This logic is not rewritten
from scratch**; it is ported near-verbatim into the new project, per
`CLAUDE.md` and `docs/ARCHITECTURE_PLAN.md`.

## Decisions locked in with the user

- **Hosting: Vercel.** Server-side fetch is not subject to browser CORS, so
  moving fetches to the server (Route Handlers / Server Components) makes
  the domain restrictions in API_REFERENCE.md §0 irrelevant — the server can
  hit any WTT mirror directly. GitHub Pages was considered and rejected: it
  only serves static files, so it cannot run the server-side fetch this
  migration depends on.
- **Repo: GitHub**, connected to Vercel for auto-deploy on push to `main`.
- **Domain:** no custom domain yet — deploy to the Vercel-provided
  subdomain (`<project>.vercel.app`). Custom domain can be attached later
  without any code changes.
- **Language: English only.** All Russian text (UI strings, comments) from
  the prototype is removed, not translated. No i18n framework — single
  language, no need for one.
- **Priority after this spec:** features (more tournaments, stats, H2H)
  over further polish — noted here so the next spec picks that up first.

## Architecture

### Stack
- Next.js 14+, App Router, TypeScript, scaffolded via `create-next-app`.
- No CSS framework migration: the prototype's existing CSS-variable-based
  design language (light/dark theme) moves into `app/globals.css` as-is.

### Data layer (`lib/`)
- `lib/wtt-api.ts` — all WTT endpoint calls. Ported near-verbatim from the
  prototype's `<script>` block; only the fetch execution context changes
  (browser → server). Endpoints, `documentCode` padding (`fullDocCode`),
  and the `Unit[]` full-array handling (never `Unit[0]`) come straight from
  API_REFERENCE.md §2 and §5.
- `lib/merge-matches.ts` — ports `dedupeUnits`, `buildMatch`,
  `buildMatchFromArchiveItem`, `buildOrphanLiveMatch`,
  `computeMergedMatches`, `hasRealPlayers`, `normalizeCode`, `parseScores`
  from the prototype, preserving: dedup by `Code` with status priority
  (`Official` > `Start List` > `Scheduled`), status recomputed from actual
  score rather than trusted from `ScheduleStatus`, and the archive-first /
  active-tournament-fallback strategy from API_REFERENCE.md §4c.
- `lib/types.ts` — `Match`, `Player`, `EventStatus` etc., derived from how
  the prototype already shapes these objects.

### Routes
```
app/
├── page.tsx                              → redirect to nearest active/upcoming event
├── events/
│   ├── page.tsx                          list of tournaments
│   └── [eventId]/page.tsx                match cards for one tournament (Server Component)
├── api/events/[eventId]/live/route.ts    lightweight JSON endpoint for client polling
├── sitemap.ts
└── robots.ts
components/
├── MatchCard.tsx
├── SectionHeader.tsx      (Upcoming / Live / Completed — omitted when empty)
├── FilterBar.tsx          (event type / table / date)
├── EventCombobox.tsx      (tournament search)
├── ThemeToggle.tsx
└── ZoomSlider.tsx
```

### Rendering & caching strategy
- Tournament page: Server Component, ISR `revalidate: 60`.
- Tournament list: ISR `revalidate: 3600`.
- `<LiveScoreUpdater>` Client Component polls `/api/events/[eventId]/live`
  every 30s (ports `fetchLiveScores`/`fillMissingScores`) to keep live
  scores current between ISR regenerations — search engines see a static
  snapshot, real visitors see it update.
- IndexedDB cache of completed-match scores is ported as-is as an
  additional client-side layer on top of ISR — it protects against
  redundant point lookups (`matchdata/`) on scroll/filter; it does not
  replace ISR, which is what protects WTT's origin from repeated
  full-page regeneration load.

### Decisions on previously-open questions (`KNOWN_ISSUES.md`)
- **Server-side cache (Redis/KV) in front of WTT:** not built in this spec.
  Rely on Next.js's built-in fetch cache + ISR. Revisit if real traffic
  shows load on WTT's API becoming a problem.
- **TBD bracket slots** (opponent not yet determined): shown explicitly as
  a "TBD" block instead of being hidden entirely (previous prototype
  behavior was to hide via the `hasRealPlayers` fallback).
- **Timezone:** display venue-local time as given by the API, labeled
  explicitly (e.g. "local venue time"). No conversion to the visitor's
  timezone, since the API gives no explicit UTC offset to convert from
  reliably.

### SEO
- `generateMetadata` per tournament page: title/description including
  tournament name and current stage (e.g. "Round of 32").
- Open Graph + Twitter Card tags.
- JSON-LD `SportsEvent` markup per match card.
- `app/sitemap.ts` (one URL per tournament), `app/robots.ts` (disallow
  `/api/*`).
- Semantic HTML (`<article>`, `<time datetime="...">`) in match cards.
- Footer disclaimer: unofficial, not affiliated with WTT/ITTF.

### Analytics
Vercel Analytics (`@vercel/analytics/react`) — free, two-line integration,
obvious choice given Vercel hosting. No other analytics vendor needed for
this spec.

### Testing
- Unit tests over the pure data-layer functions (dedup, merge, status
  recomputation, `documentCode` padding, score parsing) — these already
  encode debugged-on-live-data behavior; tests pin that behavior down
  before it gets refactored to run server-side.
- Manual check: `view-source:` on a tournament page must show real player
  names and scores in the raw HTML (confirms SSR is actually rendering
  content, not shipping an empty shell for client JS to fill).

## Out of scope (deferred to the next spec)

- More tournaments displayed together / cross-tournament browsing.
- Player statistics.
- Head-to-head (H2H) match history between players — note: WTT API
  endpoint for this is not yet known; will require its own reverse-
  engineering pass, same as the rest of API_REFERENCE.md.
- Custom domain.
- Any analytics vendor beyond Vercel Analytics.
- Server-side cache (Redis/KV) in front of WTT's API.
