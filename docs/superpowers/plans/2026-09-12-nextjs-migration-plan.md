# Next.js Migration Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `prototype/wtt-matches.html` into a Next.js (App Router, TypeScript) app that server-renders WTT tournament match data with ISR, deployed to Vercel, with the prototype's already-debugged data logic ported near-verbatim.

**Architecture:** A pure-function data layer (`lib/merge-matches.ts`, `lib/events.ts`) ported from the prototype's `<script>` block, driven by a server-only fetch layer (`lib/wtt-api.ts`) that is free of the browser CORS restrictions documented in `API_REFERENCE.md` §0. `lib/get-event-matches.ts` orchestrates these into one `Match[]` per tournament, consumed by an ISR'd Server Component page and re-polled by a small Client Component (`MatchFeed` + `useLiveScoreUpdater`) for live scores.

**Tech Stack:** Next.js 14 (App Router, TypeScript), Vitest + Testing Library for tests, `@vercel/analytics`, deployed on Vercel.

**Spec:** `docs/superpowers/specs/2026-09-12-nextjs-migration-design.md`

## Global Constraints

- Hosting is Vercel; no GitHub Pages, no static export.
- English only — no Russian strings, no i18n framework.
- No custom domain yet — deploy to the Vercel-provided subdomain.
- Analytics: `@vercel/analytics` only, nothing else.
- No server-side Redis/KV cache in front of WTT in this spec — rely on ISR + per-route `revalidate`.
- TBD bracket slots (no real players yet) are shown explicitly as "TBD", never hidden.
- Venue-local time is displayed as given by the API, with no timezone conversion.
- Tournament page ISR `revalidate = 60`; tournament list page ISR `revalidate = 3600`.
- All WTT data-parsing/merging logic is ported from `prototype/wtt-matches.html` near-verbatim (same bug fixes, same dedup/merge priorities) — never rewritten from first principles.
- Out of scope for this plan: more tournaments per page, player statistics, H2H history, custom domain, any analytics vendor beyond Vercel Analytics, server-side WTT response cache.

---

### Task 1: Project scaffold & tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `next-env.d.ts`, `next.config.mjs`, `.eslintrc.json`, `vitest.config.ts`, `vitest.setup.ts`
- Modify: `.gitignore`
- Create (placeholder, replaced in Task 18/8): `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

**Interfaces:**
- Produces: `npm run dev`, `npm run build`, `npm run test` scripts that every later task relies on. Path alias `@/*` → repo root, used by every `import ... from '@/lib/...'` in later tasks.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "wtt-matches",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@vercel/analytics": "^1.3.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "eslint": "^8.57.0",
    "eslint-config-next": "^14.2.0",
    "vitest": "^1.6.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^24.1.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/user-event": "^14.5.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `next-env.d.ts`**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 4: Write `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

- [ ] **Step 5: Write `.eslintrc.json`**

```json
{ "extends": "next/core-web-vitals" }
```

- [ ] **Step 6: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  // Next.js resolves the tsconfig `@/*` path alias on its own at build
  // time, but Vitest does not read tsconfig paths automatically — without
  // this, every test file that pulls in a component or hook using `@/lib/...`
  // / `@/components/...` imports (from Task 9 onward) fails to resolve them.
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    environment: 'node',
    environmentMatchGlobs: [['components/**', 'jsdom'], ['lib/hooks/**', 'jsdom']],
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

- [ ] **Step 7: Write `vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 8: Append to `.gitignore`**

```
node_modules/
.next/
.vercel/
*.tsbuildinfo
.env*.local
```

- [ ] **Step 9: Write placeholder `app/globals.css`**

```css
:root {
  color-scheme: dark;
}
body {
  margin: 0;
}
```

- [ ] **Step 10: Write placeholder `app/layout.tsx`**

```tsx
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 11: Write placeholder `app/page.tsx`**

```tsx
export default function RootPage() {
  return <p>WTT Matches — scaffold OK</p>;
}
```

- [ ] **Step 12: Install dependencies**

Run: `npm install`
Expected: installs without error, creates `package-lock.json`.

- [ ] **Step 13: Verify the build**

Run: `npm run build`
Expected: build succeeds, no type errors.

- [ ] **Step 14: Verify the test runner works with zero tests**

Run: `npm run test`
Expected: `no test files found` (exit code may be non-zero from Vitest when no files match — that's fine at this step; later tasks add real test files).

- [ ] **Step 15: Commit**

```bash
git add package.json package-lock.json tsconfig.json next-env.d.ts next.config.mjs .eslintrc.json vitest.config.ts vitest.setup.ts .gitignore app/
git commit -m "Scaffold Next.js app with TypeScript and Vitest"
```

---

### Task 2: Core parsing/dedup helpers

**Files:**
- Create: `lib/types.ts`
- Create: `lib/merge-matches.ts`
- Test: `lib/merge-matches.test.ts`

**Interfaces:**
- Produces: `Match`, `Player`, `MatchStatus`, `RawUnit`, `RawScheduleItem`, `RawStart`, `MatchCard`, `MatchCardCompetitor`, `RawArchiveItem`, `RawResults10Item`, `RawLiveIdsItem`, `RawEventListItem`, `EventStatus`, `NormalizedEvent` (types, used by every later task). `normalizeCode(code)`, `fullDocCode(code)`, `parseScores(str)`, `computeSets(a, b)`, `isDecided(setsA, setsB, bestOfXGames?)`, `dedupeUnits(units)`, `hasRealPlayers(players)`, `trimTrailingEmptyGames(gameScores)` — all pure, all consumed by Tasks 3, 4, 7, 9.

- [ ] **Step 1: Write `lib/types.ts`**

```ts
export type MatchStatus = 'scheduled' | 'live' | 'done';

export interface Player {
  name: string;
  seed: string | number | null;
}

export interface Match {
  code: string;
  normCode: string;
  startDate: string;
  endDate: string;
  status: MatchStatus;
  round: string;
  subEvent: string | undefined;
  table: string;
  venue: string;
  players: Player[];
  gameScores: [number[], number[]] | null;
  winnerIdx: 0 | 1 | null;
  isTbd: boolean;
}

export type EventStatus = 'ongoing' | 'future' | 'past';

export interface NormalizedEvent {
  eventId: string;
  eventName: string;
  startDateTime: string;
  endDateTime: string;
  status: EventStatus;
}

export interface RawEventListItem {
  eventId: string;
  eventName: string;
  startDateTime: string;
  endDateTime: string;
}

export interface RawStart {
  Competitor?: {
    Description?: { TeamName?: string };
    Seed?: string | number;
  };
}

export interface RawUnit {
  Code: string;
  ScheduleStatus: 'Scheduled' | 'Start List' | 'Official' | string;
  StartDate: string;
  EndDate: string;
  StartList?: { Start?: RawStart[] };
  ItemDescription?: { Value: string }[];
  SubEvent?: string;
  VenueDescription?: { LocationName?: string; VenueName?: string };
}

export interface RawScheduleItem {
  Competition: { Unit: RawUnit[] };
}

export interface MatchCardCompetitor {
  competitiorName?: string;
  scores?: string;
}

export interface MatchCard {
  competitiors?: MatchCardCompetitor[];
  matchConfig?: { bestOfXGames?: number };
  subEventDescription?: string;
  subEventName?: string;
  tableName?: string;
  venueName?: string;
}

export interface RawArchiveItem {
  documentCode: string;
  startDateLocal: string;
  match_card: MatchCard | null;
}

export interface RawResults10Item {
  documentCode: string;
  match_card: MatchCard;
}

export interface RawLiveIdsItem {
  e: string;
  d: string;
  s: string;
}
```

- [ ] **Step 2: Write the failing test for the parsing/dedup helpers**

```ts
// lib/merge-matches.test.ts
import { describe, expect, it } from 'vitest';
import {
  normalizeCode,
  fullDocCode,
  parseScores,
  computeSets,
  isDecided,
  dedupeUnits,
  hasRealPlayers,
  trimTrailingEmptyGames,
} from './merge-matches';
import type { RawUnit } from './types';

describe('normalizeCode', () => {
  it('strips trailing dashes used as documentCode padding', () => {
    expect(normalizeCode('ABC123' + '-'.repeat(36))).toBe('ABC123');
  });
  it('returns empty string for null/undefined', () => {
    expect(normalizeCode(undefined)).toBe('');
  });
});

describe('fullDocCode', () => {
  it('pads a short Code to the fixed 42-character documentCode length', () => {
    const code = 'ABCDEFGH';
    const padded = fullDocCode(code);
    expect(padded).toHaveLength(42);
    expect(padded.startsWith(code)).toBe(true);
    expect(padded.slice(code.length)).toBe('-'.repeat(42 - code.length));
  });
  it('leaves an already-full-length code untouched', () => {
    const full = 'X'.repeat(42);
    expect(fullDocCode(full)).toBe(full);
  });
});

describe('parseScores', () => {
  it('parses a comma-separated score string into numbers', () => {
    expect(parseScores('11,7,11,9,6')).toEqual([11, 7, 11, 9, 6]);
  });
  it('returns an empty array for empty input', () => {
    expect(parseScores('')).toEqual([]);
    expect(parseScores(undefined)).toEqual([]);
  });
});

describe('computeSets / isDecided', () => {
  it('counts games won per side from parallel score arrays', () => {
    const { setsA, setsB } = computeSets([11, 7, 11, 9, 0], [8, 11, 8, 11, 0]);
    expect(setsA).toBe(2);
    expect(setsB).toBe(2);
  });
  it('treats trailing zero games (unplayed) as not won by either side', () => {
    const { setsA, setsB } = computeSets([11, 11, 11, 0, 0], [7, 8, 9, 0, 0]);
    expect(setsA).toBe(3);
    expect(setsB).toBe(0);
    expect(isDecided(setsA, setsB, 5)).toBe(true);
  });
  it('is not decided when neither side has reached the majority', () => {
    expect(isDecided(1, 1, 5)).toBe(false);
  });
});

describe('dedupeUnits', () => {
  it('keeps the most-advanced ScheduleStatus per Code (Official > Start List > Scheduled)', () => {
    const units: RawUnit[] = [
      { Code: 'M1', ScheduleStatus: 'Scheduled', StartDate: '', EndDate: '' },
      { Code: 'M1', ScheduleStatus: 'Start List', StartDate: '', EndDate: '' },
      { Code: 'M1', ScheduleStatus: 'Official', StartDate: '', EndDate: '' },
      { Code: 'M2', ScheduleStatus: 'Scheduled', StartDate: '', EndDate: '' },
    ];
    const result = dedupeUnits(units);
    expect(result).toHaveLength(2);
    const m1 = result.find((u) => u.Code === 'M1');
    expect(m1?.ScheduleStatus).toBe('Official');
  });
});

describe('hasRealPlayers', () => {
  it('is false when every player name is the placeholder em-dash', () => {
    expect(hasRealPlayers([{ name: '—', seed: null }, { name: '—', seed: null }])).toBe(false);
  });
  it('is true when at least one player has a real name', () => {
    expect(hasRealPlayers([{ name: 'WANG Yidi', seed: null }, { name: '—', seed: null }])).toBe(true);
  });
  it('is false for an empty player list', () => {
    expect(hasRealPlayers([])).toBe(false);
  });
});

describe('trimTrailingEmptyGames', () => {
  it('drops unplayed 0-0 trailing games but keeps games that were actually played', () => {
    expect(trimTrailingEmptyGames([[11, 7, 11, 9, 0], [8, 11, 8, 11, 0]])).toBe(4);
  });
  it('returns the full length when every game slot was played', () => {
    expect(trimTrailingEmptyGames([[11, 7, 11], [9, 11, 9]])).toBe(3);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/merge-matches.test.ts`
Expected: FAIL — `lib/merge-matches.ts` does not exist yet.

- [ ] **Step 4: Write `lib/merge-matches.ts` (part 1 — pure helpers only)**

```ts
import type { Player, RawUnit } from './types';

const STATUS_PRIORITY: Record<string, number> = {
  Official: 3,
  'Start List': 2,
  Scheduled: 1,
};

export function normalizeCode(code: string | null | undefined): string {
  return (code || '').replace(/-+$/, '');
}

const DOC_CODE_LENGTH = 42;

export function fullDocCode(code: string): string {
  if (!code) return code;
  if (code.length >= DOC_CODE_LENGTH) return code;
  return code + '-'.repeat(DOC_CODE_LENGTH - code.length);
}

export function parseScores(scoresStr: string | null | undefined): number[] {
  if (!scoresStr) return [];
  return scoresStr
    .split(',')
    .map((n) => parseInt(n, 10))
    .filter((n) => !isNaN(n));
}

export function computeSets(scoresA: number[], scoresB: number[]): { setsA: number; setsB: number } {
  const setsA = scoresA.filter((v, i) => v > (scoresB[i] || 0)).length;
  const setsB = scoresB.filter((v, i) => v > (scoresA[i] || 0)).length;
  return { setsA, setsB };
}

export function isDecided(setsA: number, setsB: number, bestOfXGames = 5): boolean {
  const need = Math.ceil(bestOfXGames / 2);
  return setsA >= need || setsB >= need;
}

export function dedupeUnits(units: RawUnit[]): RawUnit[] {
  // WTT's schedule.json can contain several stale snapshots of the same
  // match (Scheduled + Start List + Official all at once) as it was
  // updated over time — keep only the most-advanced one per Code.
  const best: Record<string, RawUnit> = {};
  units.forEach((u) => {
    const c = normalizeCode(u.Code);
    const p = STATUS_PRIORITY[u.ScheduleStatus] || 0;
    const existing = best[c];
    if (!existing || p > (STATUS_PRIORITY[existing.ScheduleStatus] || 0)) {
      best[c] = u;
    }
  });
  return Object.values(best);
}

export function hasRealPlayers(players: Player[]): boolean {
  return players.length > 0 && players.some((p) => p.name !== '—');
}

export function trimTrailingEmptyGames(gameScores: [number[], number[]]): number {
  const [g0, g1] = gameScores;
  const fullLen = Math.max(g0.length, g1.length);
  for (let gi = fullLen - 1; gi >= 0; gi--) {
    if ((g0[gi] || 0) !== 0 || (g1[gi] || 0) !== 0) return gi + 1;
  }
  return fullLen > 0 ? 1 : 0;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/merge-matches.test.ts`
Expected: PASS (all describe blocks above).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/merge-matches.ts lib/merge-matches.test.ts
git commit -m "Port core score/dedup parsing helpers from the prototype"
```

---

### Task 3: Match builders

**Files:**
- Modify: `lib/merge-matches.ts`
- Modify: `lib/merge-matches.test.ts`

**Interfaces:**
- Consumes: `normalizeCode`, `parseScores`, `computeSets`, `isDecided`, `hasRealPlayers` (Task 2).
- Produces: `buildMatch(unit: RawUnit, resultCard: MatchCard | null): Match`, `buildMatchFromArchiveItem(item: RawArchiveItem): Match`, `buildOrphanLiveMatch(docCode: string, card: MatchCard | null): Match` — consumed by Task 4 (`computeMergedMatches`) and Task 7 (`get-event-matches.ts`).

- [ ] **Step 1: Write the failing tests**

Append to `lib/merge-matches.test.ts`:

```ts
import { buildMatch, buildMatchFromArchiveItem, buildOrphanLiveMatch } from './merge-matches';
import type { MatchCard, RawArchiveItem } from './types';

describe('buildMatch', () => {
  const baseUnit: RawUnit = {
    Code: 'CODE1' + '-'.repeat(37),
    ScheduleStatus: 'Scheduled',
    StartDate: '2026-09-10T11:00:00',
    EndDate: '2026-09-10T12:00:00',
    StartList: {
      Start: [
        { Competitor: { Description: { TeamName: 'WANG Yidi' }, Seed: 1 } },
        { Competitor: { Description: { TeamName: 'Dina MESHREF' }, Seed: 3 } },
      ],
    },
    ItemDescription: [{ Value: "Women's Singles - Round of 32" }],
    SubEvent: "Women's Singles",
    VenueDescription: { LocationName: 'Table 3', VenueName: 'Macao East Asian Games Dome' },
  };

  it('maps players, round, table and venue from the raw unit', () => {
    const m = buildMatch(baseUnit, null);
    expect(m.players.map((p) => p.name)).toEqual(['WANG Yidi', 'Dina MESHREF']);
    expect(m.round).toBe("Women's Singles - Round of 32");
    expect(m.table).toBe('Table 3');
    expect(m.venue).toBe('Macao East Asian Games Dome');
    expect(m.status).toBe('scheduled');
    expect(m.isTbd).toBe(false);
  });

  it('trusts a decided score over a stale ScheduleStatus (WTT can lag)', () => {
    const card: MatchCard = {
      competitiors: [{ scores: '11,11,11,0,0' }, { scores: '5,7,9,0,0' }],
      matchConfig: { bestOfXGames: 5 },
    };
    const m = buildMatch({ ...baseUnit, ScheduleStatus: 'Start List' }, card);
    expect(m.status).toBe('done');
    expect(m.winnerIdx).toBe(0);
  });

  it('flags a bracket slot with no real players as TBD instead of dropping it', () => {
    const tbdUnit: RawUnit = {
      ...baseUnit,
      StartList: { Start: [{ Competitor: { Description: { TeamName: undefined } } }] },
    };
    const m = buildMatch(tbdUnit, null);
    expect(m.isTbd).toBe(true);
  });
});

describe('buildMatchFromArchiveItem', () => {
  it('builds a done match with full score from an archive item', () => {
    const item: RawArchiveItem = {
      documentCode: 'ARCHIVE1' + '-'.repeat(34),
      startDateLocal: '2025-01-05T09:00:00',
      match_card: {
        competitiors: [
          { competitiorName: 'Player A', scores: '11,11,9,11,0' },
          { competitiorName: 'Player B', scores: '7,8,11,6,0' },
        ],
        matchConfig: { bestOfXGames: 5 },
        subEventName: "Men's Doubles",
        tableName: 'Table 1',
        venueName: 'Venue X',
      },
    };
    const m = buildMatchFromArchiveItem(item);
    expect(m.status).toBe('done');
    expect(m.winnerIdx).toBe(0);
    expect(m.players.map((p) => p.name)).toEqual(['Player A', 'Player B']);
  });
});

describe('buildOrphanLiveMatch', () => {
  it('marks the match live when the score is not yet decided', () => {
    const card: MatchCard = {
      competitiors: [{ competitiorName: 'A', scores: '11,7,0,0,0' }, { competitiorName: 'B', scores: '9,11,0,0,0' }],
      matchConfig: { bestOfXGames: 5 },
    };
    const m = buildOrphanLiveMatch('DOC123', card);
    expect(m.status).toBe('live');
  });

  it('marks the match done when livematchids.json lags behind a finished score', () => {
    const card: MatchCard = {
      competitiors: [{ competitiorName: 'A', scores: '11,11,11,0,0' }, { competitiorName: 'B', scores: '5,6,7,0,0' }],
      matchConfig: { bestOfXGames: 5 },
    };
    const m = buildOrphanLiveMatch('DOC123', card);
    expect(m.status).toBe('done');
    expect(m.winnerIdx).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/merge-matches.test.ts`
Expected: FAIL — `buildMatch`, `buildMatchFromArchiveItem`, `buildOrphanLiveMatch` not exported yet.

- [ ] **Step 3: Append the builders to `lib/merge-matches.ts`**

```ts
import type {
  Match,
  MatchCard,
  Player,
  RawArchiveItem,
  RawUnit,
} from './types';

export function buildMatch(unit: RawUnit, resultCard: MatchCard | null): Match {
  const code = unit.Code;
  const normCode = normalizeCode(code);
  const starts = unit.StartList?.Start || [];
  const players: Player[] = starts.map((s) => {
    const d = s.Competitor?.Description;
    return {
      name: d?.TeamName || '—',
      seed: s.Competitor?.Seed ?? null,
    };
  });
  const descArr = unit.ItemDescription || [];
  const round = descArr[0]?.Value || unit.SubEvent || '';

  let gameScores: [number[], number[]] | null = null;
  let winnerIdx: 0 | 1 | null = null;
  let hasDecidedWinner = false;
  if (resultCard?.competitiors && resultCard.competitiors.length === 2) {
    const c0 = parseScores(resultCard.competitiors[0].scores);
    const c1 = parseScores(resultCard.competitiors[1].scores);
    gameScores = [c0, c1];
    const { setsA, setsB } = computeSets(c0, c1);
    const bestOf = resultCard.matchConfig?.bestOfXGames || 5;
    if (isDecided(setsA, setsB, bestOf)) {
      winnerIdx = setsA > setsB ? 0 : 1;
      hasDecidedWinner = true;
    }
  }

  // WTT's own ScheduleStatus can lag behind reality — if the score itself
  // already shows a decided winner, trust that over the raw status.
  const effectiveStatus = hasDecidedWinner ? 'Official' : unit.ScheduleStatus;
  const isLive = effectiveStatus === 'Start List';
  const isDone = effectiveStatus === 'Official';

  return {
    code,
    normCode,
    startDate: unit.StartDate,
    endDate: unit.EndDate,
    status: isLive ? 'live' : isDone ? 'done' : 'scheduled',
    round,
    subEvent: unit.SubEvent,
    table: unit.VenueDescription?.LocationName || '',
    venue: unit.VenueDescription?.VenueName || '',
    players,
    gameScores,
    winnerIdx,
    isTbd: !hasRealPlayers(players),
  };
}

export function buildMatchFromArchiveItem(item: RawArchiveItem): Match {
  // The archive endpoint (used for tournaments concluded long ago) embeds
  // a full match_card per item — same shape as a matchdata/ fetch, so this
  // mirrors buildMatch's score parsing directly.
  const card = item.match_card;
  const normCode = normalizeCode(item.documentCode);
  let players: Player[] = [];
  let gameScores: [number[], number[]] | null = null;
  let winnerIdx: 0 | 1 | null = null;
  if (card?.competitiors && card.competitiors.length === 2) {
    players = card.competitiors.map((c) => ({ name: c.competitiorName || '—', seed: null }));
    const c0 = parseScores(card.competitiors[0].scores);
    const c1 = parseScores(card.competitiors[1].scores);
    gameScores = [c0, c1];
    const { setsA, setsB } = computeSets(c0, c1);
    const bestOf = card.matchConfig?.bestOfXGames || 5;
    if (isDecided(setsA, setsB, bestOf)) {
      winnerIdx = setsA > setsB ? 0 : 1;
    }
  }
  return {
    code: item.documentCode,
    normCode,
    startDate: item.startDateLocal,
    endDate: item.startDateLocal,
    status: 'done',
    round: card?.subEventDescription || card?.subEventName || '',
    subEvent: card?.subEventName,
    table: card?.tableName || '',
    venue: card?.venueName || '',
    players,
    gameScores,
    winnerIdx,
    isTbd: !hasRealPlayers(players),
  };
}

export function buildOrphanLiveMatch(docCode: string, card: MatchCard | null): Match {
  // livematchids.json can list matches schedule.json hasn't picked up at
  // all yet — build a card straight from a matchdata/ fetch.
  const normCode = normalizeCode(docCode);
  let players: Player[] = [];
  let gameScores: [number[], number[]] | null = null;
  let winnerIdx: 0 | 1 | null = null;
  let status: 'live' | 'done' = 'live';
  if (card?.competitiors && card.competitiors.length === 2) {
    players = card.competitiors.map((c) => ({ name: c.competitiorName || '—', seed: null }));
    const c0 = parseScores(card.competitiors[0].scores);
    const c1 = parseScores(card.competitiors[1].scores);
    gameScores = [c0, c1];
    const { setsA, setsB } = computeSets(c0, c1);
    const bestOf = card.matchConfig?.bestOfXGames || 5;
    // livematchids.json can also lag right at the end of a match — if the
    // score already shows a winner, treat it as finished.
    if (isDecided(setsA, setsB, bestOf)) {
      winnerIdx = setsA > setsB ? 0 : 1;
      status = 'done';
    }
  }
  const now = new Date().toISOString();
  return {
    code: docCode,
    normCode,
    startDate: now,
    endDate: now,
    status,
    round: card?.subEventDescription || card?.subEventName || '',
    subEvent: card?.subEventName,
    table: card?.tableName || '',
    venue: card?.venueName || '',
    players,
    gameScores,
    winnerIdx,
    isTbd: !hasRealPlayers(players),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/merge-matches.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/merge-matches.ts lib/merge-matches.test.ts
git commit -m "Port match builders (schedule/archive/orphan-live) from the prototype"
```

---

### Task 4: Merge orchestration (`computeMergedMatches`)

**Files:**
- Modify: `lib/merge-matches.ts`
- Modify: `lib/merge-matches.test.ts`

**Interfaces:**
- Consumes: `buildMatch`, `buildMatchFromArchiveItem`, `buildOrphanLiveMatch`, `normalizeCode` (Task 2-3).
- Produces: `MergeInput` type, `computeMergedMatches(input: MergeInput): Match[]` — consumed by Task 7 (`get-event-matches.ts`).

- [ ] **Step 1: Write the failing test**

Append to `lib/merge-matches.test.ts`:

```ts
import { computeMergedMatches } from './merge-matches';

describe('computeMergedMatches', () => {
  const unit = (code: string, overrides: Partial<RawUnit> = {}): RawUnit => ({
    Code: code,
    ScheduleStatus: 'Scheduled',
    StartDate: '2026-09-10T11:00:00',
    EndDate: '2026-09-10T12:00:00',
    StartList: { Start: [{ Competitor: { Description: { TeamName: 'A' } } }, { Competitor: { Description: { TeamName: 'B' } } }] },
    ...overrides,
  });

  it('lets an archive item override a schedule unit with the same code', () => {
    const matches = computeMergedMatches({
      units: [unit('M1', { ScheduleStatus: 'Scheduled' })],
      archiveItems: [{
        documentCode: 'M1',
        startDateLocal: '2025-01-01T00:00:00',
        match_card: {
          competitiors: [{ competitiorName: 'A', scores: '11,11,11,0,0' }, { competitiorName: 'B', scores: '5,6,7,0,0' }],
          matchConfig: { bestOfXGames: 5 },
        },
      }],
      resultsByCode: {},
      liveDocCodesByNormCode: {},
      liveCardsByNormCode: {},
      orphanLiveCards: {},
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].status).toBe('done');
    expect(matches[0].winnerIdx).toBe(0);
  });

  it('upgrades a match to live via livematchids.json unless the score already shows it is done', () => {
    const matches = computeMergedMatches({
      units: [unit('M1', { ScheduleStatus: 'Scheduled' }), unit('M2', { ScheduleStatus: 'Scheduled' })],
      archiveItems: [],
      resultsByCode: {
        M2: { competitiors: [{ scores: '11,11,11,0,0' }, { scores: '5,6,7,0,0' }], matchConfig: { bestOfXGames: 5 } },
      },
      liveDocCodesByNormCode: { M1: 'M1', M2: 'M2' },
      liveCardsByNormCode: {},
      orphanLiveCards: {},
    });
    const m1 = matches.find((m) => m.normCode === 'M1');
    const m2 = matches.find((m) => m.normCode === 'M2');
    expect(m1?.status).toBe('live');
    expect(m2?.status).toBe('done'); // score already decided, not downgraded to live
  });

  it('adds an orphan live match that has no schedule/archive entry at all', () => {
    const matches = computeMergedMatches({
      units: [],
      archiveItems: [],
      resultsByCode: {},
      liveDocCodesByNormCode: { ORPHAN1: 'ORPHAN1' },
      liveCardsByNormCode: {},
      orphanLiveCards: {
        ORPHAN1: {
          docCode: 'ORPHAN1',
          card: { competitiors: [{ competitiorName: 'A', scores: '11,7,0,0,0' }, { competitiorName: 'B', scores: '9,5,0,0,0' }] },
        },
      },
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].normCode).toBe('ORPHAN1');
    expect(matches[0].status).toBe('live');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/merge-matches.test.ts`
Expected: FAIL — `computeMergedMatches` not exported yet.

- [ ] **Step 3: Append `computeMergedMatches` to `lib/merge-matches.ts`**

```ts
export interface MergeInput {
  units: RawUnit[];
  archiveItems: RawArchiveItem[];
  resultsByCode: Record<string, MatchCard>;
  liveDocCodesByNormCode: Record<string, string>;
  liveCardsByNormCode: Record<string, MatchCard>;
  orphanLiveCards: Record<string, { docCode: string; card: MatchCard | null }>;
}

function findResultCard(
  normCode: string,
  liveCardsByNormCode: Record<string, MatchCard>,
  resultsByCode: Record<string, MatchCard>
): MatchCard | null {
  return liveCardsByNormCode[normCode] || resultsByCode[normCode] || null;
}

export function computeMergedMatches(input: MergeInput): Match[] {
  const {
    units,
    archiveItems,
    resultsByCode,
    liveDocCodesByNormCode,
    liveCardsByNormCode,
    orphanLiveCards,
  } = input;

  const scheduleMatches = units.map((u) =>
    buildMatch(u, findResultCard(normalizeCode(u.Code), liveCardsByNormCode, resultsByCode))
  );
  const archiveMatches = archiveItems.map(buildMatchFromArchiveItem);

  // For a long-concluded tournament, schedule.json often keeps only a
  // handful of matches while the archive endpoint has the full history —
  // so the archive wins whenever both cover the same match.
  const merged: Record<string, Match> = {};
  scheduleMatches.forEach((m) => { merged[m.normCode] = m; });
  archiveMatches.forEach((m) => { merged[m.normCode] = m; });

  // livematchids.json updates faster and more completely than
  // ScheduleStatus — trust it, unless the match's own score already shows
  // it's finished (buildMatch/buildMatchFromArchiveItem already trust the
  // score over a stale status).
  Object.entries(liveDocCodesByNormCode).forEach(([normCode]) => {
    const existing = merged[normCode];
    if (existing && existing.status !== 'done') {
      existing.status = 'live';
    }
  });

  // A live match schedule.json/archive don't have at all: build it
  // directly from its own matchdata/ card.
  Object.entries(orphanLiveCards).forEach(([normCode, entry]) => {
    if (!merged[normCode]) {
      merged[normCode] = buildOrphanLiveMatch(entry.docCode, entry.card);
    }
  });

  return Object.values(merged);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/merge-matches.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/merge-matches.ts lib/merge-matches.test.ts
git commit -m "Port computeMergedMatches source-priority logic from the prototype"
```

---

### Task 5: WTT API client

**Files:**
- Create: `lib/wtt-api.ts`
- Test: `lib/wtt-api.test.ts`

**Interfaces:**
- Consumes: `RawEventListItem`, `RawScheduleItem`, `RawResults10Item`, `RawArchiveItem`, `RawLiveIdsItem`, `MatchCard` (Task 2).
- Produces: `fetchEventsList()`, `fetchSchedule(eventId)`, `fetchResults10(eventId)`, `fetchArchive(eventId)`, `fetchLiveIds(eventId)`, `fetchMatchCard(eventId, docCode)` — consumed by Task 7 and by the tournament list/root pages (Tasks 16-17).

- [ ] **Step 1: Write the failing test**

```ts
// lib/wtt-api.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchEventsList, fetchSchedule, fetchMatchCard } from './wtt-api';

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(body) })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchEventsList', () => {
  it('requests the events list JSON and returns the parsed body', async () => {
    mockFetchOnce([{ eventId: '1', eventName: 'Test Open' }]);
    const result = await fetchEventsList();
    expect(result).toEqual([{ eventId: '1', eventName: 'Test Open' }]);
    const [url] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(url).toContain('wtt_upcoming_only_events_list.json');
  });
});

describe('fetchSchedule', () => {
  it('builds a cache-busted URL that includes the eventId', async () => {
    mockFetchOnce([]);
    await fetchSchedule('12345');
    const [url] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string];
    expect(url).toContain('/12345/schedule/schedule.json');
    expect(url).toMatch(/[?&]q=\d+/);
  });

  it('throws when the response is not ok', async () => {
    mockFetchOnce({}, false, 500);
    await expect(fetchSchedule('12345')).rejects.toThrow('500');
  });
});

describe('fetchMatchCard', () => {
  it('builds the matchdata URL from eventId and documentCode', async () => {
    mockFetchOnce({});
    await fetchMatchCard('12345', 'DOC-CODE');
    const [url] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string];
    expect(url).toContain('/matchdata/12345/DOC-CODE.json');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/wtt-api.test.ts`
Expected: FAIL — `lib/wtt-api.ts` does not exist.

- [ ] **Step 3: Write `lib/wtt-api.ts`**

```ts
import type {
  MatchCard,
  RawArchiveItem,
  RawEventListItem,
  RawLiveIdsItem,
  RawResults10Item,
  RawScheduleItem,
} from './types';

// Server-side fetch is not subject to browser CORS, so unlike the
// prototype we are not restricted to the one WTT mirror that allows
// cross-origin requests (see docs/API_REFERENCE.md §0) — this mirror is
// kept simply because it is the one already proven to serve every
// endpoint below.
const BASE_URL = 'https://wtt-web-frontdoor-cthahjeqhbh6aqe3.a01.azurefd.net';

function cacheBust(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}q=${Date.now()}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

export function fetchEventsList(): Promise<RawEventListItem[]> {
  return fetchJson(`${BASE_URL}/websitestaticapifiles/general/wtt_upcoming_only_events_list.json`);
}

export function fetchSchedule(eventId: string): Promise<RawScheduleItem[]> {
  return fetchJson(cacheBust(`${BASE_URL}/websitecacheddata/${eventId}/schedule/schedule.json`));
}

export function fetchResults10(eventId: string): Promise<RawResults10Item[]> {
  return fetchJson(
    cacheBust(`${BASE_URL}/websitestaticapifiles/${eventId}/${eventId}_take_10_official_results.json`)
  );
}

export function fetchArchive(eventId: string): Promise<RawArchiveItem[]> {
  return fetchJson(cacheBust(`${BASE_URL}/websitearchivedresults/${eventId}/officialresult/officialresult.json`));
}

export function fetchLiveIds(eventId: string): Promise<RawLiveIdsItem[]> {
  return fetchJson(
    cacheBust(`${BASE_URL}/websitestaticapifiles/running-events/${eventId}/${eventId}_livematchids.json`)
  );
}

export function fetchMatchCard(eventId: string, docCode: string): Promise<MatchCard> {
  return fetchJson(cacheBust(`${BASE_URL}/matchdata/${eventId}/${docCode}.json`));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/wtt-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/wtt-api.ts lib/wtt-api.test.ts
git commit -m "Add server-side WTT API fetch client"
```

---

### Task 6: Events list normalization

**Files:**
- Create: `lib/events.ts`
- Test: `lib/events.test.ts`

**Interfaces:**
- Consumes: `RawEventListItem`, `NormalizedEvent`, `EventStatus` (Task 2).
- Produces: `tournamentStatus(item, now?)`, `normalizeEventsList(list, now?)` — consumed by Task 16 (events list page), Task 18 (event page metadata/combobox), Task 19 (sitemap).

- [ ] **Step 1: Write the failing test**

```ts
// lib/events.test.ts
import { describe, expect, it } from 'vitest';
import { tournamentStatus, normalizeEventsList } from './events';
import type { RawEventListItem } from './types';

const NOW = new Date('2026-09-12T12:00:00Z').getTime();

describe('tournamentStatus', () => {
  it('is ongoing when now falls between start and end', () => {
    const e: RawEventListItem = { eventId: '1', eventName: 'A', startDateTime: '2026-09-10T00:00:00Z', endDateTime: '2026-09-15T00:00:00Z' };
    expect(tournamentStatus(e, NOW)).toBe('ongoing');
  });
  it('is future when start is after now', () => {
    const e: RawEventListItem = { eventId: '1', eventName: 'A', startDateTime: '2026-10-01T00:00:00Z', endDateTime: '2026-10-05T00:00:00Z' };
    expect(tournamentStatus(e, NOW)).toBe('future');
  });
  it('is past otherwise', () => {
    const e: RawEventListItem = { eventId: '1', eventName: 'A', startDateTime: '2026-01-01T00:00:00Z', endDateTime: '2026-01-05T00:00:00Z' };
    expect(tournamentStatus(e, NOW)).toBe('past');
  });
});

describe('normalizeEventsList', () => {
  it('sorts ongoing first, then future by soonest, then past by most recent', () => {
    const list: RawEventListItem[] = [
      { eventId: 'past-old', eventName: 'Past Old', startDateTime: '2025-01-01T00:00:00Z', endDateTime: '2025-01-05T00:00:00Z' },
      { eventId: 'future-far', eventName: 'Future Far', startDateTime: '2026-12-01T00:00:00Z', endDateTime: '2026-12-05T00:00:00Z' },
      { eventId: 'ongoing', eventName: 'Ongoing', startDateTime: '2026-09-10T00:00:00Z', endDateTime: '2026-09-15T00:00:00Z' },
      { eventId: 'future-near', eventName: 'Future Near', startDateTime: '2026-09-20T00:00:00Z', endDateTime: '2026-09-25T00:00:00Z' },
      { eventId: 'past-recent', eventName: 'Past Recent', startDateTime: '2026-08-01T00:00:00Z', endDateTime: '2026-08-05T00:00:00Z' },
    ];
    const out = normalizeEventsList(list, NOW);
    expect(out.map((e) => e.eventId)).toEqual(['ongoing', 'future-near', 'future-far', 'past-recent', 'past-old']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/events.test.ts`
Expected: FAIL — `lib/events.ts` does not exist.

- [ ] **Step 3: Write `lib/events.ts`**

```ts
import type { EventStatus, NormalizedEvent, RawEventListItem } from './types';

const STATUS_RANK: Record<EventStatus, number> = { ongoing: 0, future: 1, past: 2 };

export function tournamentStatus(item: RawEventListItem, now: number = Date.now()): EventStatus {
  const start = new Date(item.startDateTime).getTime();
  const end = new Date(item.endDateTime).getTime();
  if (!isNaN(start) && !isNaN(end) && start <= now && now <= end) return 'ongoing';
  if (!isNaN(start) && start > now) return 'future';
  return 'past';
}

export function normalizeEventsList(list: RawEventListItem[], now: number = Date.now()): NormalizedEvent[] {
  // wtt_upcoming_only_events_list.json is, despite the name, the full
  // events list — one row per event with real start/end dates, which lets
  // us derive an actual ongoing/future/past status (the API gives no
  // status field of its own).
  const out: NormalizedEvent[] = list.map((item) => ({
    eventId: item.eventId,
    eventName: item.eventName,
    startDateTime: item.startDateTime,
    endDateTime: item.endDateTime,
    status: tournamentStatus(item, now),
  }));
  out.sort((a, b) => {
    const r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (r !== 0) return r;
    const da = new Date(a.startDateTime).getTime();
    const db = new Date(b.startDateTime).getTime();
    return a.status === 'past' ? db - da : da - db;
  });
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/events.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/events.ts lib/events.test.ts
git commit -m "Port tournament status/sort logic from the prototype"
```

---

### Task 7: Server orchestration (`getEventMatches`)

**Files:**
- Create: `lib/get-event-matches.ts`
- Test: `lib/get-event-matches.test.ts`

**Interfaces:**
- Consumes: `fetchSchedule`, `fetchResults10`, `fetchArchive`, `fetchLiveIds`, `fetchMatchCard` (Task 5, mocked in tests); `dedupeUnits`, `normalizeCode`, `fullDocCode`, `computeMergedMatches` (Tasks 2-4).
- Produces: `getEventMatches(eventId: string): Promise<Match[]>` — consumed by Task 12 (live API route) and Task 18 (tournament page).

- [ ] **Step 1: Write the failing test**

```ts
// lib/get-event-matches.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawArchiveItem, RawLiveIdsItem, RawResults10Item, RawScheduleItem } from './types';

vi.mock('./wtt-api', () => ({
  fetchSchedule: vi.fn(),
  fetchResults10: vi.fn(),
  fetchArchive: vi.fn(),
  fetchLiveIds: vi.fn(),
  fetchMatchCard: vi.fn(),
}));

import { fetchSchedule, fetchResults10, fetchArchive, fetchLiveIds, fetchMatchCard } from './wtt-api';
import { getEventMatches } from './get-event-matches';

const EVENT_ID = 'EVT1';

function unit(code: string, status: string, teamNames: [string, string]) {
  return {
    Code: code,
    ScheduleStatus: status,
    StartDate: '2026-09-10T11:00:00',
    EndDate: '2026-09-10T12:00:00',
    StartList: {
      Start: [
        { Competitor: { Description: { TeamName: teamNames[0] } } },
        { Competitor: { Description: { TeamName: teamNames[1] } } },
      ],
    },
  };
}

beforeEach(() => {
  vi.mocked(fetchResults10).mockResolvedValue([] as RawResults10Item[]);
  vi.mocked(fetchArchive).mockResolvedValue([] as RawArchiveItem[]);
  vi.mocked(fetchLiveIds).mockResolvedValue([] as RawLiveIdsItem[]);
  vi.mocked(fetchMatchCard).mockRejectedValue(new Error('not mocked for this match'));
});

describe('getEventMatches', () => {
  it('flattens every match out of Competition.Unit[], not just the first one (regression for the Unit[0] bug)', async () => {
    const schedule: RawScheduleItem[] = [{
      Competition: {
        Unit: [
          unit('M1', 'Scheduled', ['A1', 'A2']),
          unit('M2', 'Scheduled', ['B1', 'B2']),
          unit('M3', 'Scheduled', ['C1', 'C2']),
        ],
      },
    }];
    vi.mocked(fetchSchedule).mockResolvedValue(schedule);

    const matches = await getEventMatches(EVENT_ID);
    expect(matches.map((m) => m.normCode).sort()).toEqual(['M1', 'M2', 'M3']);
  });

  it('fetches a fresh score for a live match and merges it in', async () => {
    const schedule: RawScheduleItem[] = [{ Competition: { Unit: [unit('LIVE1', 'Start List', ['A', 'B'])] } }];
    vi.mocked(fetchSchedule).mockResolvedValue(schedule);
    vi.mocked(fetchMatchCard).mockImplementation(async (_eventId, docCode) => {
      if (docCode.startsWith('LIVE1')) {
        return {
          competitiors: [{ competitiorName: 'A', scores: '11,7,0,0,0' }, { competitiorName: 'B', scores: '9,11,0,0,0' }],
          matchConfig: { bestOfXGames: 5 },
        };
      }
      throw new Error('unexpected docCode');
    });

    const matches = await getEventMatches(EVENT_ID);
    expect(matches).toHaveLength(1);
    expect(matches[0].status).toBe('live');
    expect(matches[0].gameScores).toEqual([[11, 7, 0, 0, 0], [9, 11, 0, 0, 0]]);
  });

  it('includes a live match that livematchids.json knows about but schedule.json has no entry for at all', async () => {
    vi.mocked(fetchSchedule).mockResolvedValue([]);
    vi.mocked(fetchLiveIds).mockResolvedValue([{ e: EVENT_ID, d: 'ORPHAN1', s: "Men's Singles" }]);
    vi.mocked(fetchMatchCard).mockResolvedValue({
      competitiors: [{ competitiorName: 'A', scores: '11,7,0,0,0' }, { competitiorName: 'B', scores: '9,11,0,0,0' }],
      matchConfig: { bestOfXGames: 5 },
    });

    const matches = await getEventMatches(EVENT_ID);
    expect(matches).toHaveLength(1);
    expect(matches[0].normCode).toBe('ORPHAN1');
    expect(matches[0].status).toBe('live');
  });

  it('fills in a score for a done match missing from the last-10 results, capped at the concurrency limit', async () => {
    const units = Array.from({ length: 10 }, (_, i) => unit(`DONE${i}`, 'Official', [`P${i}a`, `P${i}b`]));
    vi.mocked(fetchSchedule).mockResolvedValue([{ Competition: { Unit: units } }]);
    vi.mocked(fetchMatchCard).mockImplementation(async (_eventId, docCode) => ({
      competitiors: [
        { competitiorName: 'winner', scores: '11,11,11,0,0' },
        { competitiorName: 'loser', scores: '5,6,7,0,0' },
      ],
      matchConfig: { bestOfXGames: 5 },
    }));

    const matches = await getEventMatches(EVENT_ID);
    expect(matches).toHaveLength(10);
    matches.forEach((m) => {
      expect(m.gameScores).not.toBeNull();
      expect(m.winnerIdx).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/get-event-matches.test.ts`
Expected: FAIL — `lib/get-event-matches.ts` does not exist.

- [ ] **Step 3: Write `lib/get-event-matches.ts`**

```ts
import { fetchArchive, fetchLiveIds, fetchMatchCard, fetchResults10, fetchSchedule } from './wtt-api';
import { computeMergedMatches, dedupeUnits, fullDocCode, normalizeCode } from './merge-matches';
import type { Match, MatchCard, RawUnit } from './types';

const MISSING_SCORE_CONCURRENCY = 8;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  const queue = items.slice();
  async function worker() {
    let item = queue.shift();
    while (item !== undefined) {
      results.push(await fn(item));
      item = queue.shift();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export async function getEventMatches(eventId: string): Promise<Match[]> {
  const [scheduleRaw, results10Raw, archiveRaw, liveIdsRaw] = await Promise.all([
    fetchSchedule(eventId),
    fetchResults10(eventId).catch(() => []),
    fetchArchive(eventId).catch(() => []),
    fetchLiveIds(eventId).catch(() => []),
  ]);

  // IMPORTANT: each schedule.json item can bundle MANY matches under one
  // Competition.Unit array, not a single match — taking only Unit[0]
  // silently drops the rest (see docs/API_REFERENCE.md §2).
  const allUnits: RawUnit[] = [];
  scheduleRaw.forEach((item) => {
    (item.Competition.Unit || []).forEach((u) => allUnits.push(u));
  });
  const units = dedupeUnits(allUnits);
  const archiveItems = archiveRaw.filter((item) => item.match_card);

  const resultsByCode: Record<string, MatchCard> = {};
  results10Raw.forEach((r) => {
    resultsByCode[normalizeCode(r.documentCode)] = r.match_card;
  });

  const liveDocCodesByNormCode: Record<string, string> = {};
  liveIdsRaw.forEach((item) => {
    if (item?.d) liveDocCodesByNormCode[normalizeCode(item.d)] = item.d;
  });

  // Pass 1: merge without fresh live cards, just to see which matches come
  // out flagged live (via ScheduleStatus or the livematchids.json override).
  const firstPass = computeMergedMatches({
    units,
    archiveItems,
    resultsByCode,
    liveDocCodesByNormCode,
    liveCardsByNormCode: {},
    orphanLiveCards: {},
  });

  const codeByNormCode: Record<string, string> = {};
  units.forEach((u) => { codeByNormCode[normalizeCode(u.Code)] = u.Code; });

  const liveNormCodes = firstPass.filter((m) => m.status === 'live').map((m) => m.normCode);
  const liveCardEntries = await mapLimit(liveNormCodes, MISSING_SCORE_CONCURRENCY, async (normCode) => {
    const rawCode = codeByNormCode[normCode];
    if (!rawCode) return null;
    try {
      return [normCode, await fetchMatchCard(eventId, fullDocCode(rawCode))] as const;
    } catch {
      return null; // keep whatever pass 1 already had
    }
  });
  const liveCardsByNormCode: Record<string, MatchCard> = {};
  liveCardEntries.forEach((entry) => {
    if (entry) liveCardsByNormCode[entry[0]] = entry[1];
  });

  // Live matches livematchids.json knows about that schedule.json/archive
  // have no entry for at all.
  const knownNormCodes = new Set(firstPass.map((m) => m.normCode));
  const orphanEntries = Object.entries(liveDocCodesByNormCode).filter(
    ([normCode]) => !knownNormCodes.has(normCode)
  );
  const orphanResults = await mapLimit(orphanEntries, MISSING_SCORE_CONCURRENCY, async ([normCode, docCode]) => {
    try {
      return [normCode, { docCode, card: await fetchMatchCard(eventId, docCode) }] as const;
    } catch {
      return null; // try again next regeneration
    }
  });
  const orphanLiveCards: Record<string, { docCode: string; card: MatchCard | null }> = {};
  orphanResults.forEach((entry) => {
    if (entry) orphanLiveCards[entry[0]] = entry[1];
  });

  // Pass 2: re-merge with fresh live scores + orphan matches included.
  let matches = computeMergedMatches({
    units,
    archiveItems,
    resultsByCode,
    liveDocCodesByNormCode,
    liveCardsByNormCode,
    orphanLiveCards,
  });

  // Completed matches without a score yet (results10 only covers the last
  // 10 finished matches tournament-wide) get their card fetched
  // individually, capped at MISSING_SCORE_CONCURRENCY parallel requests.
  const missing = matches.filter((m) => m.status === 'done' && !m.gameScores);
  if (missing.length) {
    const filledEntries = await mapLimit(missing, MISSING_SCORE_CONCURRENCY, async (m) => {
      try {
        return [m.normCode, await fetchMatchCard(eventId, fullDocCode(m.code))] as const;
      } catch {
        return null; // no score available for this match either — leave as-is
      }
    });
    const filledByNormCode: Record<string, MatchCard> = {};
    filledEntries.forEach((entry) => {
      if (entry) filledByNormCode[entry[0]] = entry[1];
    });
    if (Object.keys(filledByNormCode).length) {
      matches = computeMergedMatches({
        units,
        archiveItems,
        resultsByCode: { ...resultsByCode, ...filledByNormCode },
        liveDocCodesByNormCode,
        liveCardsByNormCode,
        orphanLiveCards,
      });
    }
  }

  return matches;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/get-event-matches.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/get-event-matches.ts lib/get-event-matches.test.ts
git commit -m "Add server-side match orchestration (schedule + live + archive + missing scores)"
```

---

### Task 8: Global styles + root layout + Analytics

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Modify: `package.json` (already has `@vercel/analytics` from Task 1; no change needed, just used here)

**Interfaces:**
- Produces: CSS custom properties (`--bg`, `--surface`, `--accent`, `--card-min`, etc.) and the classes every component in Tasks 9-18 renders into (`.card`, `.badge`, `.player-row`, `.filter-bar`, `.event-select`, `.zoom-ctrl`, `.boundary`, `.status-line`, `.bar`, etc.). `RootLayout` wraps every page and mounts `<Analytics />`.

- [ ] **Step 1: Replace `app/globals.css` with the ported design system (English strings, same CSS variables/classes as the prototype)**

```css
:root{
  --bg:#0E1116;
  --surface:#171B22;
  --surface-hi:#1F2430;
  --border:#262B35;
  --text:#EDEFF2;
  --muted:#8A93A3;
  --muted-2:#5B6270;
  --accent:#FF7A3D;
  --accent-dim:#7A3F22;
  --win:#4ADE80;
  --future:#4EA8FF;
  --card-min:280px;
  --radius:14px;
  --panel-bg:rgba(14,17,22,.88);
  --panel-bg-solid:rgba(23,27,34,.92);
  --shadow-color:rgba(0,0,0,.6);
  --hover-a:rgba(255,255,255,.06);
  --hover-a2:rgba(255,255,255,.05);
  --accent-a14:rgba(255,122,61,.14);
  --accent-a35:rgba(255,122,61,.35);
  color-scheme:dark;
}
:root[data-theme="light"]{
  --bg:#F5F6F8;
  --surface:#FFFFFF;
  --surface-hi:#EEF0F4;
  --border:#DEE1E7;
  --text:#1A1D23;
  --muted:#5B6270;
  --muted-2:#8A93A3;
  --accent:#DB5B1E;
  --accent-dim:#FBDCC4;
  --win:#1E9E5A;
  --future:#1D7FE0;
  --panel-bg:rgba(245,246,248,.88);
  --panel-bg-solid:rgba(255,255,255,.92);
  --shadow-color:rgba(30,32,38,.16);
  --hover-a:rgba(20,22,28,.045);
  --hover-a2:rgba(20,22,28,.035);
  --accent-a14:rgba(219,91,30,.12);
  --accent-a35:rgba(219,91,30,.22);
  color-scheme:light;
}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;}
body{
  background:var(--bg);
  color:var(--text);
  font-family:'Manrope',system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;
  min-height:100vh;
}
::selection{background:var(--accent-dim);}
a{color:inherit;text-decoration:none;}

header.bar{
  position:sticky; top:0; z-index:20;
  display:flex; align-items:center; gap:12px;
  padding:12px 16px;
  background:var(--panel-bg);
  backdrop-filter:blur(10px);
  border-bottom:1px solid var(--border);
}
.brand{
  display:flex; align-items:center; gap:8px;
  font-weight:800; font-size:15px; letter-spacing:-0.01em;
  color:var(--text); flex-shrink:0;
}
.brand .dot{
  width:8px;height:8px;border-radius:50%;
  background:var(--accent);
  box-shadow:0 0 0 3px var(--accent-dim);
}
.event-select{ position:relative; flex:1 1 auto; min-width:0; max-width:520px; }
.event-input{
  width:100%;
  background:var(--surface);
  color:var(--text);
  border:1px solid var(--border);
  border-radius:10px;
  padding:9px 12px 9px 30px;
  font-family:inherit; font-size:14px; font-weight:600;
  cursor:text;
}
.event-input::placeholder{color:var(--muted-2); font-weight:600;}
.event-input:focus-visible{outline:2px solid var(--accent); outline-offset:1px;}

.status-dot{
  width:8px; height:8px; border-radius:50%;
  background:var(--muted-2);
  flex-shrink:0;
  display:inline-block;
}
.event-select .status-dot{ position:absolute; left:12px; top:50%; transform:translateY(-50%); z-index:1; }
.status-dot-ongoing{ background:var(--accent); box-shadow:0 0 0 3px var(--accent-a14); }
.status-dot-future{ background:var(--future); }
.status-dot-past{ background:var(--muted-2); }
.event-dropdown{
  position:absolute; top:calc(100% + 6px); left:0; right:0;
  max-height:320px; overflow-y:auto;
  background:var(--surface-hi);
  border:1px solid var(--border);
  border-radius:10px;
  box-shadow:0 14px 34px -14px var(--shadow-color);
  z-index:25;
}
.event-option{
  padding:9px 12px;
  font-size:13.5px; font-weight:600;
  color:var(--text);
  cursor:pointer;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  display:flex; align-items:center; gap:8px;
}
.event-option:hover, .event-option.active{background:var(--hover-a);}
.event-option.selected{color:var(--accent);}
.event-option.no-match{color:var(--muted-2); cursor:default;}
.event-option.no-match:hover{background:none;}

.spacer{flex:1;}

.icon-btn{
  display:flex; align-items:center; justify-content:center;
  width:36px; height:36px; flex-shrink:0;
  background:var(--surface);
  border:1px solid var(--border);
  color:var(--text);
  border-radius:10px;
  cursor:pointer;
  transition:background .15s, border-color .15s;
}
.icon-btn:hover{background:var(--surface-hi); border-color:var(--muted-2);}
.icon-btn:focus-visible{outline:2px solid var(--accent); outline-offset:1px;}
.icon-btn svg{width:17px;height:17px;}

.refresh-btn{
  display:flex; align-items:center; gap:7px;
  background:var(--surface);
  border:1px solid var(--border);
  color:var(--text);
  border-radius:10px;
  padding:9px 14px;
  font-family:inherit; font-weight:700; font-size:13.5px;
  cursor:pointer;
  white-space:nowrap;
  transition:background .15s, border-color .15s;
}
.refresh-btn:hover{background:var(--surface-hi); border-color:var(--muted-2);}
.refresh-btn svg{width:15px;height:15px; transition:transform .5s;}
.refresh-btn.spinning svg{animation:spin .7s linear infinite;}
@keyframes spin{to{transform:rotate(360deg);}}

.status-line{
  padding:8px 16px; font-size:12.5px; color:var(--muted-2);
  display:flex; gap:16px; flex-wrap:wrap;
  border-bottom:1px solid var(--border);
}
.status-line b{color:var(--muted); font-weight:700;}

.filter-bar{
  display:flex; gap:8px; flex-wrap:wrap; align-items:center;
  padding:10px 16px;
  border-bottom:1px solid var(--border);
}
.filter-bar select{
  background:var(--surface);
  color:var(--text);
  border:1px solid var(--border);
  border-radius:8px;
  padding:6px 10px;
  font-family:inherit; font-size:13px; font-weight:600;
  cursor:pointer;
  max-width:200px;
}
.filter-reset{
  background:none;
  color:var(--muted);
  border:none;
  font-family:inherit; font-size:12.5px; font-weight:700;
  text-decoration:underline;
  cursor:pointer;
  padding:6px 4px;
}
.filter-reset:hover{color:var(--text);}

main{ padding:20px 16px 140px; max-width:1600px; margin:0 auto; }
.feed{
  display:grid;
  grid-template-columns:repeat(auto-fill, minmax(var(--card-min), 1fr));
  gap:14px;
  align-items:start;
}
.empty-msg{
  grid-column:1/-1;
  text-align:center;
  color:var(--muted);
  padding:60px 20px 60px;
  font-size:14px;
  line-height:1.6;
  max-width:480px;
  margin:0 auto;
}
.boundary{
  grid-column:1/-1;
  display:flex; align-items:center; gap:10px;
  margin:6px 0;
  color:var(--muted-2);
  font-size:12px; font-weight:700;
  letter-spacing:.02em;
}
.boundary::before,.boundary::after{ content:''; flex:1; height:1px; background:var(--border); }

.card{
  background:var(--surface);
  border:1px solid var(--border);
  border-radius:var(--radius);
  padding:13px 14px 12px;
  display:flex; flex-direction:column; gap:9px;
  scroll-margin-top:90px;
}
.card.live{
  border-color:var(--accent-dim);
  box-shadow:0 0 0 1px var(--accent-dim), 0 8px 24px -12px var(--accent-a35);
}
.card-top{ display:flex; justify-content:space-between; align-items:flex-start; gap:8px; }
.card-round{ font-size:12px; color:var(--muted); font-weight:600; line-height:1.35; }
.card-round .sub{display:block; color:var(--muted-2); font-size:11.5px; margin-top:1px;}

.badge{
  flex-shrink:0;
  font-size:11px; font-weight:800; letter-spacing:.02em;
  padding:3px 8px; border-radius:100px;
  white-space:nowrap;
}
.badge.live{ background:var(--accent-a14); color:var(--accent); display:flex; align-items:center; gap:5px; }
.badge.live .pulse{ width:6px;height:6px;border-radius:50%;background:var(--accent); animation:pulse 1.4s ease-in-out infinite; }
@keyframes pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.35;transform:scale(1.3);}}
.badge.done{background:var(--hover-a); color:var(--muted);}
.badge.upcoming{background:var(--hover-a2); color:var(--muted-2);}

.players{ display:flex; flex-direction:column; gap:6px; }
.player-row{ display:grid; grid-template-columns:1fr auto; align-items:center; gap:10px; padding:5px 0; }
.player-row.winner .p-name{color:var(--text); font-weight:800;}
.player-row:not(.winner) .p-name{color:var(--muted);}
.p-name{ font-size:14px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.p-seed{color:var(--muted-2); font-weight:600; font-size:11.5px; margin-left:4px;}

.games{ display:flex; gap:5px; align-items:center; font-variant-numeric:tabular-nums; }
.games .g{ min-width:20px; text-align:center; font-size:12.5px; color:var(--muted-2); font-weight:700; }
.player-row.winner .games .g.won{color:var(--win);}
.sets{ min-width:22px; text-align:center; font-size:19px; font-weight:800; font-variant-numeric:tabular-nums; color:var(--muted); }
.player-row.winner .sets{color:var(--win);}

.no-score{ font-size:11px; color:var(--muted-2); font-style:italic; line-height:1.4; }
.card-bottom{
  display:flex; justify-content:space-between; align-items:center;
  font-size:11.5px; color:var(--muted-2); font-weight:600;
  padding-top:5px; border-top:1px solid var(--border);
}

.zoom-ctrl{
  position:fixed; bottom:18px; right:18px; z-index:30;
  display:flex; align-items:center; gap:10px;
  background:var(--panel-bg-solid);
  backdrop-filter:blur(10px);
  border:1px solid var(--border);
  border-radius:100px;
  padding:9px 16px 9px 14px;
  box-shadow:0 10px 30px -10px var(--shadow-color);
}
.zoom-ctrl label{font-size:11.5px; color:var(--muted); font-weight:700; white-space:nowrap;}
.zoom-ctrl input[type=range]{ width:110px; accent-color:var(--accent); }

.site-footer{
  text-align:center;
  color:var(--muted-2);
  font-size:12px;
  padding:24px 16px 40px;
}

@media (max-width:640px){
  header.bar{flex-wrap:wrap;}
  .event-select{order:1; flex:1 1 100%; max-width:none;}
  .brand{order:0;}
  .refresh-btn{order:2;}
  .icon-btn{order:2;}
  .zoom-ctrl{right:12px; bottom:12px; padding:7px 12px 7px 12px;}
  .zoom-ctrl input[type=range]{width:80px;}
}
@media (prefers-reduced-motion:reduce){
  .badge.live .pulse, .refresh-btn.spinning svg{animation:none;}
}
```

- [ ] **Step 2: Replace `app/layout.tsx` with the real root layout**

```tsx
import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import './globals.css';

const manrope = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], display: 'swap' });

export const metadata: Metadata = {
  title: 'WTT Matches',
  description: 'Live scores, schedules, and results for World Table Tennis events.',
};

const THEME_INIT_SCRIPT = `
(function(){
  var saved = null;
  try { saved = localStorage.getItem('wtt_theme'); } catch (e) {}
  var theme = saved || (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', theme);
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={manrope.className}>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Verify the build still succeeds**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual check — no flash of wrong theme**

Run: `npm run dev`, open `http://localhost:3000` in a browser with the OS set to dark mode, then to light mode (or toggle `prefers-color-scheme` in devtools). Expected: the page background matches the OS theme immediately on load, no flash of the other theme.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "Port design system CSS and root layout with theme bootstrap + Analytics"
```

---

### Task 9: Match card + section header components

**Files:**
- Create: `components/MatchCard.tsx`
- Create: `components/SectionHeader.tsx`
- Test: `components/MatchCard.test.tsx`

**Interfaces:**
- Consumes: `Match` (Task 2), `trimTrailingEmptyGames` (Task 2).
- Produces: `<MatchCard match={m} />`, `<SectionHeader label="Upcoming" id="sectionLive" />` — consumed by Task 13 (`MatchFeed`).

- [ ] **Step 1: Write the failing test**

```tsx
// components/MatchCard.test.tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MatchCard } from './MatchCard';
import type { Match } from '@/lib/types';

function baseMatch(overrides: Partial<Match> = {}): Match {
  return {
    code: 'CODE1',
    normCode: 'CODE1',
    startDate: '2026-09-10T11:00:00',
    endDate: '2026-09-10T12:00:00',
    status: 'scheduled',
    round: "Women's Singles - Round of 32",
    subEvent: "Women's Singles",
    table: 'Table 3',
    venue: 'Macao East Asian Games Dome',
    players: [{ name: 'WANG Yidi', seed: 1 }, { name: 'Dina MESHREF', seed: null }],
    gameScores: null,
    winnerIdx: null,
    isTbd: false,
    ...overrides,
  };
}

describe('MatchCard', () => {
  it('renders both player names', () => {
    render(<MatchCard match={baseMatch()} />);
    expect(screen.getByText('WANG Yidi')).toBeInTheDocument();
    expect(screen.getByText('Dina MESHREF')).toBeInTheDocument();
  });

  it('shows a TBD placeholder instead of hiding an unfilled bracket slot', () => {
    render(<MatchCard match={baseMatch({ players: [], isTbd: true })} />);
    expect(screen.getByText('TBD')).toBeInTheDocument();
  });

  it('marks the winning player row and trims trailing 0-0 games', () => {
    render(<MatchCard match={baseMatch({
      status: 'done',
      gameScores: [[11, 11, 11, 0, 0], [5, 6, 7, 0, 0]],
      winnerIdx: 0,
    })} />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.getByText('Finished')).toBeInTheDocument();
  });

  it('shows a loading note for a done match with no score yet', () => {
    render(<MatchCard match={baseMatch({ status: 'done', gameScores: null })} />);
    expect(screen.getByText('Loading score…')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/MatchCard.test.tsx`
Expected: FAIL — `components/MatchCard.tsx` does not exist.

- [ ] **Step 3: Write `components/SectionHeader.tsx`**

```tsx
export function SectionHeader({ label, id }: { label: string; id?: string }) {
  return (
    <div className="boundary" id={id}>
      {label}
    </div>
  );
}
```

- [ ] **Step 4: Write `components/MatchCard.tsx`**

```tsx
import type { Match } from '@/lib/types';
import { trimTrailingEmptyGames } from '@/lib/merge-matches';

const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Both formatters parse the API's date-time string as plain text rather
// than through Date/toLocaleString. A string like "2026-09-10T11:00:00"
// carries no timezone offset, so Date would reinterpret it as local time
// in whatever environment parses it — the server during SSR, the
// visitor's browser during hydration — producing a hydration mismatch
// and, for some timezones, a different calendar day entirely. Plain
// parsing also matches the design decision to show venue time exactly as
// given, with no timezone conversion.
function parseDateTimeParts(dateStr: string) {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return { year, month: Number(month), day: Number(day), hour, minute };
}

function formatUpcomingTime(dateStr: string): string {
  const parts = parseDateTimeParts(dateStr);
  if (!parts) return '';
  return `${SHORT_MONTH_NAMES[parts.month - 1]} ${parts.day}, ${parts.hour}:${parts.minute}`;
}

function formatExact(dateStr: string): string {
  const parts = parseDateTimeParts(dateStr);
  if (!parts) return '';
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${day}/${month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

export function MatchCard({ match: m }: { match: Match }) {
  let badge: React.ReactNode;
  if (m.status === 'live') {
    badge = (
      <span className="badge live">
        <span className="pulse" />
        LIVE
      </span>
    );
  } else if (m.status === 'done') {
    badge = <span className="badge done" title={`Finished: ${formatExact(m.endDate || m.startDate)}`}>Finished</span>;
  } else {
    badge = <span className="badge upcoming" title={formatExact(m.startDate)}>{formatUpcomingTime(m.startDate)}</span>;
  }

  const maxGames = m.gameScores ? trimTrailingEmptyGames(m.gameScores) : 0;

  return (
    <article className={`card ${m.status}`} data-code={m.normCode}>
      <div className="card-top">
        <div className="card-round">
          {m.round}
          <span className="sub">{m.subEvent || ''}</span>
        </div>
        {badge}
      </div>
      <div className="players">
        {m.isTbd || m.players.length === 0 ? (
          <div className="player-row">
            <span className="p-name">TBD</span>
          </div>
        ) : (
          m.players.map((p, idx) => {
            const isWinner = m.winnerIdx === idx;
            const own = m.gameScores?.[idx] ?? [];
            const opp = m.gameScores?.[(1 - idx) as 0 | 1] ?? [];
            const setsWon = own.filter((v, i) => v > (opp[i] || 0)).length;
            return (
              <div key={idx} className={`player-row${isWinner ? ' winner' : ''}`}>
                <span className="p-name">
                  {p.name}
                  {p.seed ? <span className="p-seed">({p.seed})</span> : null}
                </span>
                {m.gameScores && (
                  <span className="games">
                    {own.slice(0, maxGames).map((g, gi) => (
                      <span key={gi} className={`g${g > (opp[gi] || 0) ? ' won' : ''}`}>{g}</span>
                    ))}
                    <span className="sets">{setsWon}</span>
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
      {m.status === 'done' && !m.gameScores && <div className="no-score">Loading score…</div>}
      <div className="card-bottom">
        <span>{m.table}</span>
        <span>{m.venue}</span>
      </div>
    </article>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run components/MatchCard.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/MatchCard.tsx components/SectionHeader.tsx components/MatchCard.test.tsx
git commit -m "Port match card and section header components"
```

---

### Task 10: Filter bar — pure logic + component

**Files:**
- Create: `lib/filters.ts`
- Create: `components/FilterBar.tsx`
- Test: `lib/filters.test.ts`

**Interfaces:**
- Consumes: `Match` (Task 2).
- Produces: `Filters`, `FilterOptions` types, `matchDateKey(startDate)`, `applyFilters(matches, filters)`, `deriveFilterOptions(matches)`, `<FilterBar options={...} filters={...} onChange={...} />` — consumed by Task 13 (`MatchFeed`).

- [ ] **Step 1: Write the failing test**

```ts
// lib/filters.test.ts
import { describe, expect, it } from 'vitest';
import { applyFilters, deriveFilterOptions, matchDateKey } from './filters';
import type { Match } from './types';

function match(overrides: Partial<Match>): Match {
  return {
    code: 'X', normCode: 'X', startDate: '2026-09-10T11:00:00', endDate: '2026-09-10T12:00:00',
    status: 'scheduled', round: 'R', subEvent: 'Singles', table: 'Table 1', venue: 'V',
    players: [{ name: 'A', seed: null }, { name: 'B', seed: null }],
    gameScores: null, winnerIdx: null, isTbd: false,
    ...overrides,
  };
}

describe('matchDateKey', () => {
  it('returns a YYYY-MM-DD key from a match start date', () => {
    expect(matchDateKey('2026-09-10T11:00:00')).toBe('2026-09-10');
  });
});

describe('applyFilters', () => {
  const matches = [
    match({ normCode: 'A', subEvent: 'Singles', table: 'Table 1', startDate: '2026-09-10T11:00:00' }),
    match({ normCode: 'B', subEvent: 'Doubles', table: 'Table 2', startDate: '2026-09-11T11:00:00' }),
  ];

  it('filters by subEvent, table and date independently', () => {
    expect(applyFilters(matches, { subEvent: 'Doubles', table: '', date: '' }).map((m) => m.normCode)).toEqual(['B']);
    expect(applyFilters(matches, { subEvent: '', table: 'Table 1', date: '' }).map((m) => m.normCode)).toEqual(['A']);
    expect(applyFilters(matches, { subEvent: '', table: '', date: '2026-09-11' }).map((m) => m.normCode)).toEqual(['B']);
  });

  it('returns everything when no filter is active', () => {
    expect(applyFilters(matches, { subEvent: '', table: '', date: '' })).toHaveLength(2);
  });
});

describe('deriveFilterOptions', () => {
  it('collects unique, sorted subEvents/tables/dates', () => {
    const matches = [
      match({ subEvent: 'Doubles', table: 'Table 2', startDate: '2026-09-11T11:00:00' }),
      match({ subEvent: 'Singles', table: 'Table 1', startDate: '2026-09-10T11:00:00' }),
      match({ subEvent: 'Singles', table: 'Table 1', startDate: '2026-09-10T11:00:00' }),
    ];
    const options = deriveFilterOptions(matches);
    expect(options.subEvents).toEqual(['Doubles', 'Singles']);
    expect(options.tables).toEqual(['Table 1', 'Table 2']);
    expect(options.dates).toEqual(['2026-09-10', '2026-09-11']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/filters.test.ts`
Expected: FAIL — `lib/filters.ts` does not exist.

- [ ] **Step 3: Write `lib/filters.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run lib/filters.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `components/FilterBar.tsx` (no dedicated test — thin controlled-select wrapper over the tested pure logic above)**

```tsx
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
```

- [ ] **Step 6: Commit**

```bash
git add lib/filters.ts lib/filters.test.ts components/FilterBar.tsx
git commit -m "Port match filter logic and filter bar component"
```

---

### Task 11: Client cache + live score updater hook

**Files:**
- Create: `lib/client-cache.ts`
- Create: `lib/hooks/useLiveScoreUpdater.ts`
- Test: `lib/hooks/useLiveScoreUpdater.test.tsx`

**Interfaces:**
- Consumes: `Match` (Task 2).
- Produces: `idbGet<T>(key)`, `idbSet<T>(key, value)`; `useLiveScoreUpdater(eventId, initialMatches): Match[]` — consumed by Task 13 (`MatchFeed`).

- [ ] **Step 1: Write `lib/client-cache.ts` (ported IndexedDB helpers, browser-only)**

```ts
const DB_NAME = 'wtt_cache_db';
const DB_STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function idbSet<T>(key: string, value: T): Promise<boolean> {
  try {
    const db = await openDb();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Write the failing test for the polling hook**

```tsx
// lib/hooks/useLiveScoreUpdater.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useLiveScoreUpdater } from './useLiveScoreUpdater';
import type { Match } from '@/lib/types';

function match(normCode: string, status: Match['status']): Match {
  return {
    code: normCode, normCode, startDate: '2026-09-10T11:00:00', endDate: '2026-09-10T12:00:00',
    status, round: 'R', subEvent: 'S', table: 'T', venue: 'V',
    players: [{ name: 'A', seed: null }, { name: 'B', seed: null }],
    gameScores: null, winnerIdx: null, isTbd: false,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useLiveScoreUpdater', () => {
  it('returns the initial matches immediately and does not poll when nothing is live', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const initial = [match('M1', 'scheduled')];
    const { result } = renderHook(() => useLiveScoreUpdater('EVT1', initial));
    expect(result.current).toEqual(initial);
  });

  it('polls the live API route and swaps in the fresh matches when a live match is present', async () => {
    vi.useFakeTimers();
    const fresh = [match('M1', 'done')];
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(fresh) });
    vi.stubGlobal('fetch', fetchMock);
    const initial = [match('M1', 'live')];

    const { result } = renderHook(() => useLiveScoreUpdater('EVT1', initial));
    await vi.advanceTimersByTimeAsync(30000);
    await waitFor(() => expect(result.current[0].status).toBe('done'));
    expect(fetchMock).toHaveBeenCalledWith('/api/events/EVT1/live', { cache: 'no-store' });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run lib/hooks/useLiveScoreUpdater.test.tsx`
Expected: FAIL — `lib/hooks/useLiveScoreUpdater.ts` does not exist.

- [ ] **Step 4: Write `lib/hooks/useLiveScoreUpdater.ts`**

```ts
'use client';
import { useEffect, useRef, useState } from 'react';
import type { Match } from '@/lib/types';
import { idbGet, idbSet } from '@/lib/client-cache';

const POLL_MS = 30000;

export function useLiveScoreUpdater(eventId: string, initialMatches: Match[]): Match[] {
  const [matches, setMatches] = useState(initialMatches);
  const cacheKey = `matches_${eventId}`;
  const hasLiveRef = useRef(initialMatches.some((m) => m.status === 'live'));

  useEffect(() => {
    idbSet(cacheKey, matches);
  }, [matches, cacheKey]);

  useEffect(() => {
    let cancelled = false;
    const interval = setInterval(async () => {
      if (!hasLiveRef.current) return;
      try {
        const res = await fetch(`/api/events/${eventId}/live`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const fresh: Match[] = await res.json();
        if (cancelled) return;
        hasLiveRef.current = fresh.some((m) => m.status === 'live');
        setMatches(fresh);
      } catch {
        // Network hiccup or WTT API failure — fall back to the last
        // successfully polled state instead of showing nothing.
        const cached = await idbGet<Match[]>(cacheKey);
        if (!cancelled && cached) setMatches(cached);
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [eventId, cacheKey]);

  return matches;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run lib/hooks/useLiveScoreUpdater.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/client-cache.ts lib/hooks/useLiveScoreUpdater.ts lib/hooks/useLiveScoreUpdater.test.tsx
git commit -m "Port IndexedDB cache and add client-side live score polling hook"
```

---

### Task 12: Live API route handler

**Files:**
- Create: `app/api/events/[eventId]/live/route.ts`

**Interfaces:**
- Consumes: `getEventMatches` (Task 7).
- Produces: `GET /api/events/:eventId/live` → `Match[]` JSON — consumed by `useLiveScoreUpdater` (Task 11).

- [ ] **Step 1: Write `app/api/events/[eventId]/live/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { getEventMatches } from '@/lib/get-event-matches';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { eventId: string } }) {
  const matches = await getEventMatches(params.eventId);
  return NextResponse.json(matches);
}
```

- [ ] **Step 2: Verify the build succeeds**

Run: `npm run build`
Expected: PASS (route compiles; it has no unit test of its own since `getEventMatches` is already covered by Task 7's tests and this handler is a one-line pass-through).

- [ ] **Step 3: Manual check against the live WTT API**

Run: `npm run dev`, then in another terminal: `curl -s http://localhost:3000/api/events/<a real current eventId from https://worldtabletennis.com>/live | head -c 500`
Expected: a JSON array of match objects (or `[]` if that event has no matches yet) — confirms the whole server-side fetch chain reaches the real WTT API end-to-end.

- [ ] **Step 4: Commit**

```bash
git add app/api/events/\[eventId\]/live/route.ts
git commit -m "Add live match-score API route for client polling"
```

---

### Task 13: MatchFeed component

**Files:**
- Create: `components/MatchFeed.tsx`
- Test: `components/MatchFeed.test.tsx`

**Interfaces:**
- Consumes: `useLiveScoreUpdater` (Task 11), `applyFilters`, `deriveFilterOptions`, `EMPTY_FILTERS` (Task 10), `FilterBar` (Task 10), `SectionHeader`, `MatchCard` (Task 9).
- Produces: `<MatchFeed eventId={eventId} initialMatches={matches} />` — consumed by Task 18 (tournament page).

- [ ] **Step 1: Write the failing test**

```tsx
// components/MatchFeed.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MatchFeed } from './MatchFeed';
import type { Match } from '@/lib/types';

function match(overrides: Partial<Match>): Match {
  return {
    code: 'X', normCode: 'X', startDate: '2026-09-10T11:00:00', endDate: '2026-09-10T12:00:00',
    status: 'scheduled', round: 'R', subEvent: 'Singles', table: 'Table 1', venue: 'V',
    players: [{ name: 'A', seed: null }, { name: 'B', seed: null }],
    gameScores: null, winnerIdx: null, isTbd: false,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MatchFeed', () => {
  it('groups matches into Upcoming/Live/Completed sections, omitting empty ones', () => {
    vi.stubGlobal('fetch', vi.fn());
    const matches = [
      match({ normCode: 'A', status: 'scheduled' }),
      match({ normCode: 'B', status: 'done' }),
    ];
    render(<MatchFeed eventId="EVT1" initialMatches={matches} />);
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
  });

  it('shows the empty-state message when there are no matches at all', () => {
    vi.stubGlobal('fetch', vi.fn());
    render(<MatchFeed eventId="EVT1" initialMatches={[]} />);
    expect(screen.getByText('No matches for this event')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/MatchFeed.test.tsx`
Expected: FAIL — `components/MatchFeed.tsx` does not exist.

- [ ] **Step 3: Write `components/MatchFeed.tsx`**

```tsx
'use client';
import { useMemo, useState } from 'react';
import type { Match } from '@/lib/types';
import { applyFilters, deriveFilterOptions, EMPTY_FILTERS, type Filters } from '@/lib/filters';
import { useLiveScoreUpdater } from '@/lib/hooks/useLiveScoreUpdater';
import { FilterBar } from './FilterBar';
import { SectionHeader } from './SectionHeader';
import { MatchCard } from './MatchCard';

export function MatchFeed({ eventId, initialMatches }: { eventId: string; initialMatches: Match[] }) {
  const matches = useLiveScoreUpdater(eventId, initialMatches);
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/MatchFeed.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/MatchFeed.tsx components/MatchFeed.test.tsx
git commit -m "Add MatchFeed component composing filters, sections and live polling"
```

---

### Task 14: Theme toggle

**Files:**
- Create: `components/ThemeToggle.tsx`
- Test: `components/ThemeToggle.test.tsx`

**Interfaces:**
- Produces: `<ThemeToggle />` — consumed by Task 18 (tournament page header).

- [ ] **Step 1: Write the failing test**

```tsx
// components/ThemeToggle.test.tsx
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from './ThemeToggle';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeToggle', () => {
  it('toggles data-theme on the html element and persists the choice', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: /toggle theme/i });
    await userEvent.click(button);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('wtt_theme')).toBe('light');
    await userEvent.click(button);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/ThemeToggle.test.tsx`
Expected: FAIL — `components/ThemeToggle.tsx` does not exist.

- [ ] **Step 3: Write `components/ThemeToggle.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';

const THEME_KEY = 'wtt_theme';

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 3v2.2M12 18.8V21M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M3 12h2.2M18.8 12H21M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5" />
    </svg>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    setTheme((document.documentElement.getAttribute('data-theme') as 'dark' | 'light') || 'dark');
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (e: MediaQueryListEvent) => {
      if (localStorage.getItem(THEME_KEY)) return; // user override takes precedence
      const next = e.matches ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      setTheme(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
    setTheme(next);
  }

  return (
    <button className="icon-btn" type="button" aria-label="Toggle theme" onClick={toggle}>
      {theme === 'light' ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/ThemeToggle.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ThemeToggle.tsx components/ThemeToggle.test.tsx
git commit -m "Port theme toggle component"
```

---

### Task 15: Zoom slider

**Files:**
- Create: `components/ZoomSlider.tsx`
- Test: `components/ZoomSlider.test.tsx`

**Interfaces:**
- Produces: `<ZoomSlider />` — consumed by Task 18 (tournament page).

- [ ] **Step 1: Write the failing test**

```tsx
// components/ZoomSlider.test.tsx
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ZoomSlider } from './ZoomSlider';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.style.removeProperty('--card-min');
});

describe('ZoomSlider', () => {
  it('updates the --card-min CSS variable as the slider moves', () => {
    render(<ZoomSlider />);
    const slider = screen.getByLabelText('Card size');
    // Use RTL's fireEvent.change (not a manual .value assignment +
    // dispatchEvent) — it goes through the input's native value setter,
    // which is what makes React's own change-tracking notice the update.
    fireEvent.change(slider, { target: { value: '360' } });
    expect(document.documentElement.style.getPropertyValue('--card-min')).toBe('360px');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run components/ZoomSlider.test.tsx`
Expected: FAIL — `components/ZoomSlider.tsx` does not exist.

- [ ] **Step 3: Write `components/ZoomSlider.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';

const ZOOM_KEY = 'wtt_card_min';
const DEFAULT_MIN = 280;

export function ZoomSlider() {
  const [value, setValue] = useState(DEFAULT_MIN);

  useEffect(() => {
    const saved = localStorage.getItem(ZOOM_KEY);
    if (saved) {
      setValue(Number(saved));
      document.documentElement.style.setProperty('--card-min', `${saved}px`);
    }
  }, []);

  function apply(v: number) {
    setValue(v);
    document.documentElement.style.setProperty('--card-min', `${v}px`);
  }

  return (
    <div className="zoom-ctrl">
      <label htmlFor="zoomSlider">Card size</label>
      <input
        id="zoomSlider"
        aria-label="Card size"
        type="range"
        min={220}
        max={440}
        step={10}
        value={value}
        onChange={(e) => apply(Number(e.target.value))}
        onMouseUp={() => localStorage.setItem(ZOOM_KEY, String(value))}
        onTouchEnd={() => localStorage.setItem(ZOOM_KEY, String(value))}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run components/ZoomSlider.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ZoomSlider.tsx components/ZoomSlider.test.tsx
git commit -m "Port card-size zoom slider component"
```

---

### Task 16: Event combobox + tournament list page

**Files:**
- Create: `components/EventCombobox.tsx`
- Create: `app/events/page.tsx`

**Interfaces:**
- Consumes: `NormalizedEvent` (Task 2), `fetchEventsList` (Task 5), `normalizeEventsList` (Task 6).
- Produces: `<EventCombobox events={events} currentEventId={id} />` — consumed here and by Task 18 (tournament page header).

- [ ] **Step 1: Write `components/EventCombobox.tsx`**

```tsx
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
```

- [ ] **Step 2: Write `app/events/page.tsx`**

```tsx
import type { Metadata } from 'next';
import { fetchEventsList } from '@/lib/wtt-api';
import { normalizeEventsList } from '@/lib/events';
import { EventCombobox } from '@/components/EventCombobox';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'All Tournaments — WTT Matches',
  description: 'Browse all World Table Tennis tournaments — ongoing, upcoming, and past.',
};

export default async function EventsPage() {
  const events = normalizeEventsList(await fetchEventsList());
  return (
    <main>
      <h1>Tournaments</h1>
      <EventCombobox events={events} />
    </main>
  );
}
```

- [ ] **Step 3: Verify the build succeeds**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual check**

Run: `npm run dev`, open `http://localhost:3000/events`. Expected: a searchable list of tournaments loads with real WTT event names (not placeholder text), typing filters the dropdown, arrow keys move the active row, Enter/click navigates.

- [ ] **Step 5: Commit**

```bash
git add components/EventCombobox.tsx app/events/page.tsx
git commit -m "Add tournament list page with searchable event combobox"
```

---

### Task 17: Root redirect page

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `fetchEventsList` (Task 5), `normalizeEventsList` (Task 6).

- [ ] **Step 1: Replace the placeholder `app/page.tsx`**

```tsx
import { redirect } from 'next/navigation';
import { fetchEventsList } from '@/lib/wtt-api';
import { normalizeEventsList } from '@/lib/events';

export const revalidate = 3600;

export default async function RootPage() {
  const events = normalizeEventsList(await fetchEventsList());
  if (events.length) {
    redirect(`/events/${events[0].eventId}`);
  }
  redirect('/events');
}
```

- [ ] **Step 2: Verify the build succeeds**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Manual check**

Run: `npm run dev`, open `http://localhost:3000/`. Expected: redirects to `/events/<id>` of the nearest ongoing/upcoming tournament.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "Redirect root page to the nearest active/upcoming tournament"
```

---

### Task 18: Tournament page assembly

**Files:**
- Create: `app/events/[eventId]/page.tsx`
- Create: `components/Footer.tsx`

**Interfaces:**
- Consumes: `getEventMatches` (Task 7), `fetchEventsList` (Task 5), `normalizeEventsList` (Task 6), `EventCombobox` (Task 16), `ThemeToggle` (Task 14), `ZoomSlider` (Task 15), `MatchFeed` (Task 13).

- [ ] **Step 1: Write `components/Footer.tsx`**

```tsx
export function Footer() {
  return (
    <footer className="site-footer">
      Unofficial fan project. Not affiliated with WTT/ITTF.
    </footer>
  );
}
```

- [ ] **Step 2: Write `app/events/[eventId]/page.tsx`**

```tsx
import type { Metadata } from 'next';
import { getEventMatches } from '@/lib/get-event-matches';
import { fetchEventsList } from '@/lib/wtt-api';
import { normalizeEventsList } from '@/lib/events';
import { EventCombobox } from '@/components/EventCombobox';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ZoomSlider } from '@/components/ZoomSlider';
import { MatchFeed } from '@/components/MatchFeed';
import { Footer } from '@/components/Footer';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { eventId: string } }): Promise<Metadata> {
  const events = normalizeEventsList(await fetchEventsList());
  const event = events.find((e) => String(e.eventId) === String(params.eventId));
  const title = event ? `${event.eventName} — Matches & Results` : 'WTT Matches';
  const description = event ? `Live scores, schedule and results for ${event.eventName}.` : undefined;
  return {
    title,
    description,
    alternates: { canonical: `/events/${params.eventId}` },
    openGraph: { title, description },
  };
}

export default async function EventPage({ params }: { params: { eventId: string } }) {
  const [matches, eventsRaw] = await Promise.all([
    getEventMatches(params.eventId),
    fetchEventsList(),
  ]);
  const events = normalizeEventsList(eventsRaw);

  const jsonLd = matches.slice(0, 20).map((m) => ({
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: m.round,
    startDate: m.startDate,
    competitor: m.players.map((p) => ({ '@type': 'Person', name: p.name })),
    location: { '@type': 'Place', name: m.venue },
  }));

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="bar">
        <div className="brand">
          <span className="dot" />
          Matches
        </div>
        <EventCombobox events={events} currentEventId={params.eventId} />
        <div className="spacer" />
        <ThemeToggle />
      </header>
      <MatchFeed eventId={params.eventId} initialMatches={matches} />
      <ZoomSlider />
      <Footer />
    </>
  );
}
```

- [ ] **Step 3: Verify the build succeeds**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual check — confirm SSR actually renders content (not an empty shell)**

Run: `npm run dev`, open `http://localhost:3000/events/<a real current eventId>`, then View Source (`Ctrl+U`/`Cmd+Option+U`, not devtools' Elements panel — that shows the post-hydration DOM). Expected: the raw HTML already contains real player names and scores, confirming SSR/ISR is working and this is not a client-only render like the prototype.

- [ ] **Step 5: Manual check — filters, theme, zoom, live polling**

In the same running dev server: change the type/table/date filters and confirm the feed updates and the "Reset" link appears/disappears correctly; toggle the theme button and confirm colors switch and persist across a reload; drag the zoom slider and confirm card width changes; if the tournament has a live match, leave the tab open for 30+ seconds and confirm the live card's score updates without a manual reload.

- [ ] **Step 6: Commit**

```bash
git add "app/events/[eventId]/page.tsx" components/Footer.tsx
git commit -m "Assemble the tournament page: SSR/ISR shell, metadata, JSON-LD, live feed"
```

---

### Task 19: SEO — sitemap and robots

**Files:**
- Create: `app/sitemap.ts`
- Create: `app/robots.ts`

**Interfaces:**
- Consumes: `fetchEventsList` (Task 5), `normalizeEventsList` (Task 6).

- [ ] **Step 1: Write `app/sitemap.ts`**

```ts
import type { MetadataRoute } from 'next';
import { fetchEventsList } from '@/lib/wtt-api';
import { normalizeEventsList } from '@/lib/events';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://wtt-matches.vercel.app';
  const events = normalizeEventsList(await fetchEventsList());
  return [
    { url: `${base}/events`, changeFrequency: 'daily' },
    ...events.map((e) => ({
      url: `${base}/events/${e.eventId}`,
      lastModified: e.endDateTime,
      changeFrequency: 'hourly' as const,
    })),
  ];
}
```

- [ ] **Step 2: Write `app/robots.ts`**

```ts
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
  };
}
```

- [ ] **Step 3: Verify the build succeeds**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual check**

Run: `npm run dev`, open `http://localhost:3000/sitemap.xml` and `http://localhost:3000/robots.txt`. Expected: sitemap lists `/events` plus one `<url>` per tournament; robots.txt disallows `/api/`.

- [ ] **Step 5: Commit**

```bash
git add app/sitemap.ts app/robots.ts
git commit -m "Add sitemap and robots.txt"
```

---

### Task 20: Deploy to Vercel + end-to-end smoke test

This task requires the user's own GitHub and Vercel accounts — an autonomous engineer cannot complete the account-linking steps below without that access. Do the setup steps yourself; ask the user to confirm each account-level action (repo visibility, Vercel project creation) before doing it, per the risk-confirmation rules for actions on shared/external systems.

**Files:** none (infrastructure/deployment only).

- [ ] **Step 1: Push the repository to GitHub**

Confirm with the user: repository name and visibility (public/private). Then:
```bash
gh repo create <owner>/<repo-name> --source=. --remote=origin --push
```
Expected: repo created on GitHub, `main` pushed, `git remote -v` shows `origin`.

- [ ] **Step 2: Import the project into Vercel**

Ask the user to do this step themselves (it requires their Vercel account): go to vercel.com → **Add New → Project** → import the GitHub repo just created. Leave build settings at the Next.js defaults (`npm run build`, output auto-detected). Deploy.

- [ ] **Step 3: Verify the production deployment**

Once Vercel reports the deploy succeeded, open the given `*.vercel.app` URL. Expected: redirects to a tournament page exactly like the local dev server did in Task 18.

- [ ] **Step 4: Confirm SSR works in production (not just locally)**

Run: `curl -s https://<project>.vercel.app/events/<a real eventId> | grep -o '<title>[^<]*</title>'`
Expected: a real tournament name in the `<title>`, and (spot-check) `curl -s .../events/<id> | grep -c 'p-name'` returns a nonzero count — confirms the deployed server is actually rendering player names into the HTML response, not just serving an empty shell.

- [ ] **Step 5: Confirm Vercel Analytics is receiving events**

In the Vercel dashboard, open the project's **Analytics** tab after browsing a couple of pages on the deployed URL. Expected: pageviews start appearing (may take a few minutes to show up).

- [ ] **Step 6: Record the deployed URL**

Update `README.md`'s "Статус" line (translate it to English while at it, consistent with the rest of the app) to link the live deployment, so the next person picking this up has the URL without digging through Vercel.

- [ ] **Step 7: Commit**

```bash
git add README.md
git commit -m "Link the deployed Vercel URL from the README"
```
