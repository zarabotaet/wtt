# Многослойный кэш — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next.js-версия переключает турниры так же мгновенно, как прототип: с сервера приходит только первая загрузка, дальше всё идёт из IndexedDB, сервер и CDN кэшируют турнир по его tier (final / live / future).

**Architecture:** На сервере `getEventData(eventId)` находится под `'use cache: remote'` и собирает конверт `{eventId, matches, tier, generatedAt}`. `cacheLife` выбирается по tier. Карточки матчей кэшируются отдельно: решённые навсегда, остальные на 1–2 с. Один роут `GET /api/events/[eventId]` отдаёт конверт с `Cache-Control` по tier. На клиенте Effector-модель (scope только на клиенте) держит `$entries` как зеркало IndexedDB, решает, когда ходить в сеть, и планирует опрос: live — каждые 30 с, иначе один таймер до ближайшего матча.

**Tech Stack:** Next 16.3 (App Router, Cache Components), React 19.3, TypeScript 5, Node 24, effector 23 + effector-react 23, vitest 5 (+ jsdom, Testing Library).

**Spec:** `docs/superpowers/specs/2026-09-27-layered-cache-design.md`. Исполнитель читает спецификацию и этот план. Прочитай также `CLAUDE.md` и `docs/API_REFERENCE.md` §2.

## Global Constraints

- Node 24: каждая shell-команда начинается с `source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && `. Состояние shell между вызовами не сохраняется.
- TypeScript остаётся 5.x: TS 7 не поддерживается typescript-eslint. Next 16.3.x, React 19.3.x, vitest 5.
- Зависимости: только `effector@^23` и `effector-react@^23`. Без `patronum`, без `@effector/next` и без SWC-плагина effector.
- Логику WTT API не переписываем (правило `CLAUDE.md`): `Competition.Unit[]` берётся целиком, параметр `q=` для обхода кэша есть всегда, `computeMergedMatches` не трогаем.
- «Финальный» турнир: конец дня `endDate` плюс 24 ч < now **и** `matches.length > 0` **и** все матчи `status === 'done'`. Турнира нет в списке → никогда не final.
- `Cache-Control` роута:
  - final: `public, max-age=31536000, s-maxage=31536000, immutable`;
  - live: `public, s-maxage=15, stale-while-revalidate=60`;
  - future: `public, s-maxage=3600, stale-while-revalidate=86400`;
  - 404/502: `no-store`.
- Тексты интерфейса остаются на английском, как сейчас: «Updated 12s ago», «Update failed», «Loading…».
- Ветка `upgrade-next16`. **В `main` не вливать.** После коммита каждой задачи делать `git push`.
- `git add` только с явными путями, никогда `-A` или `.`.
- Каждый коммит заканчивается пустой строкой и трейлером `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Сообщения коммитов на английском, в повелительном наклонении, как в истории репозитория.

## Отклонения от спецификации (осознанные)

1. **Без `patronum`.** Таймеры сделаны через `scopeBind` + `setTimeout` и счётчик-токен: устаревшие тики игнорируются. Debounce наведения (150 мс) сидит в `EventCombobox`, а не в модели.
2. **Без `CardNotFinalError` и `unstable_cache`.** `fetchMatchCard` целиком под `'use cache: remote'`, а время жизни выбирается условным `cacheLife`: решённая карточка получает `'max'`, нерешённая `{stale:0, revalidate:1, expire:2}`. Документация Next 16 подтверждает, что условный `cacheLife` допустим. Поэтому отдельный спайк из §8 спецификации не нужен.
3. **Final на сервере — `cacheLife('max')`** (перегенерация фоном раз в 30 дней), а не `Infinity`.
4. **`getEventData` возвращает `null` для 404/403**, а не бросает ошибку. Ошибка, проброшенная через границу `'use cache'`, может потерять класс, и тогда `instanceof WttApiError` на вызывающей стороне ненадёжен.
5. **Future требует ещё и того, чтобы все матчи были `scheduled`.** Если WTT ошибся с датами и матчи уже идут, турнир считается live.
6. **«Обновлено N назад» считается от `generatedAt`,** а не от `fetchedAt`: ответ CDN может быть старше момента запроса.
7. **`WAIT_MAX` = 15 мин вместо 1 ч.** `startDate` — время площадки без смещения, и в чужом часовом поясе ожидание может ошибаться на часы.
8. **Просроченный scheduled-матч даёт ожидание 5 мин** (`OVERDUE_MS`).
9. **Добавлен `needsFetch()`**, типы `Tier`/`EventEnvelope` лежат в `lib/types.ts`.
10. **К final добавлен `s-maxage`:** Vercel CDN кэширует только по `s-maxage`.
11. **Для ISR под Cache Components** добавлены `generateStaticParams` (хотя бы 1 параметр) и `partialPrefetching: true`.
12. **Несуществующий id может получить soft-404** (200 + `noindex`), потому что `notFound()` срабатывает внутри `<Suspense>` после начала стрима. Это приемлемо.

## Review Focus

1. **Старый снимок из CDN/SSR новее IndexedDB не затирает.** Побеждает запись с большим `generatedAt`, а сыгранные матчи со счётом не откатываются. Тесты: Task 5 (`mergeEntry`), Task 7 (модель).
2. **Часовой пояс зрителя ≠ пояс площадки.** Таймер ожидания никогда не больше 15 мин. Тест: Task 6.
3. **Турнир ложно помечен final.** Даты прошли, но матчи не доиграны; список матчей пуст; турнира нет в списке; дата не парсится — во всех случаях это не final. Тесты: Task 1.
4. **IndexedDB недоступна или повреждена** (приватный режим, jsdom, чужая схема). Страница работает от SSR-данных, мусорная запись игнорируется. Тесты: Task 5 (`validEntry`), Task 8 (jsdom без `indexedDB`).
5. **Быстрое переключение: турнир, с которого уже ушли, упал** — полной навигации нет. А турнир без кэша, который упал, пока он текущий, ведёт на `/events/<id>`. Тесты: Task 7.

---

## Карта файлов

| Файл | Ответственность | Задача |
|---|---|---|
| `lib/types.ts` | + `Tier`, `EventEnvelope` | 1 |
| `lib/events.ts` | + `DAY_MS` export, `eventEndMs()` | 1 |
| `lib/tier.ts` (+test) | `computeTier`, `TIER_CACHE_CONTROL` | 1 |
| `next.config.mjs` | `cacheComponents`, `partialPrefetching` | 2 |
| `lib/event-list.ts` (+test) | кэшированный список турниров | 2 |
| `app/page.tsx`, `app/events/page.tsx`, `app/sitemap.ts`, `app/events/[eventId]/page.tsx`, `app/api/events/[eventId]/{live,matches}/route.ts` | снять `revalidate`, перейти на `getEventsList` | 2 |
| `lib/wtt-api.ts` (+test) | `fetchMatchCard` под `'use cache: remote'` | 3 |
| `lib/get-event-matches.ts` (+test) | только `(eventId)`, всегда полный проход | 3, 4 |
| `lib/event-data.ts` (+test) | `getEventData` — конверт + `cacheLife` по tier | 4 |
| `app/api/events/[eventId]/route.ts` (+test) | единый эндпоинт | 4 |
| `vitest.config.ts` | тесты в `app/**` | 4 |
| `lib/model/entry.ts` (+test) | `Entry`, `SCHEMA_VERSION`, `toEntry`, `validEntry` | 5 |
| `lib/model/merge-entry.ts` (+test) | чистое слияние | 5 |
| `lib/model/poll-mode.ts` (+test) | `pollPlan`, `needsFetch` | 6 |
| `lib/model/event-feed.ts` (+test) | Effector-модель | 7 |
| `components/FeedProvider.tsx` | scope + подписки на браузерные события | 8 |
| `components/UpdatedAgo.tsx` (+test) | «Updated N ago» | 8 |
| `components/MatchFeed.tsx` (+test) | UI на `useUnit` | 8 |
| `components/EventCombobox.tsx` (+test) | `onHover` с debounce | 8 |
| удалить: `lib/hooks/useLiveScoreUpdater.ts` (+test), `app/api/events/[eventId]/{live,matches}/route.ts` | | 8 |
| `eslint.config.mjs`, `app/globals.css` | правила, стиль `.updated-ago` | 8 |
| `docs/KNOWN_ISSUES.md` | заметки | 9 |

---

### Task 1: Чистая логика tier

**Files:**
- Modify: `lib/types.ts` (в конец файла)
- Modify: `lib/events.ts`
- Create: `lib/tier.ts`, `lib/tier.test.ts`
- Test: `lib/events.test.ts` (дописать)

**Interfaces:**
- Consumes: `tournamentStatus(item: RawEventListItem, now?: number): EventStatus` из `lib/events.ts`.
- Produces:
  - `type Tier = 'final' | 'live' | 'future'`;
  - `interface EventEnvelope { eventId: string; matches: Match[]; tier: Tier; generatedAt: number }` (`lib/types.ts`);
  - `export const DAY_MS`, `export function eventEndMs(endDateTime: string): number` (`lib/events.ts`);
  - `computeTier(event: RawEventListItem | undefined, matches: Match[], now: number): Tier`, `TIER_CACHE_CONTROL: Record<Tier, string>` (`lib/tier.ts`).

- [ ] **Step 1: Подготовка окружения (один раз, без коммита)**

```bash
cd /Users/zarabotaet/wtt && git status --short && git branch --show-current
```

Ожидается ветка `upgrade-next16`. Если в выводе есть `M lib/wtt-api.ts` (старая правка на `unstable_cache` из другой сессии; она ломает один тест), спрячь её. Её заменит Task 3:

```bash
cd /Users/zarabotaet/wtt && git stash push -m "wip: unstable_cache match cards (superseded by layered-cache Task 3)" -- lib/wtt-api.ts
```

Проверь, что база зелёная:

```bash
cd /Users/zarabotaet/wtt && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && npm test
```

Ожидается: все тесты PASS.

- [ ] **Step 2: Написать падающие тесты**

Допиши в `lib/events.test.ts`: добавь `eventEndMs` в существующий импорт из `./events` и новый `describe` в конец файла.

```ts
describe('eventEndMs', () => {
  it('extends a bare midnight end date through the end of that calendar day', () => {
    expect(eventEndMs('2026-09-14T00:00:00Z')).toBe(Date.parse('2026-09-15T00:00:00Z') - 1);
  });

  it('keeps a precise end timestamp as is', () => {
    expect(eventEndMs('2026-09-14T18:00:00Z')).toBe(Date.parse('2026-09-14T18:00:00Z'));
  });

  it('returns NaN for an unparseable date', () => {
    expect(Number.isNaN(eventEndMs('not a date'))).toBe(true);
  });
});
```

Создай `lib/tier.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeTier, TIER_CACHE_CONTROL } from './tier';
import type { Match, RawEventListItem } from './types';

function match(status: Match['status']): Match {
  return {
    code: 'X', normCode: 'X', startDate: '2026-09-12T11:00:00', endDate: '2026-09-12T12:00:00',
    status, round: 'R', subEvent: 'Singles', table: 'T1', venue: 'V',
    players: [{ name: 'A', seed: null }, { name: 'B', seed: null }],
    gameScores: status === 'done' ? [[11, 11, 11], [5, 5, 5]] : null,
    winnerIdx: status === 'done' ? 0 : null, isTbd: false,
  };
}

// Midnight end date: the tournament runs through 2026-09-14 23:59:59.999Z,
// so "24 h after the end of the day" is 2026-09-15 23:59:59.999Z.
const EVENT: RawEventListItem = {
  eventId: '1', eventName: 'Open',
  startDateTime: '2026-09-10T00:00:00Z', endDateTime: '2026-09-14T00:00:00Z',
};
const AFTER_GRACE = Date.parse('2026-09-16T00:00:00Z');
const WITHIN_GRACE = Date.parse('2026-09-15T23:00:00Z');
const BEFORE_START = Date.parse('2026-09-01T00:00:00Z');
const DURING = Date.parse('2026-09-12T12:00:00Z');

describe('computeTier', () => {
  it('is final a full day after the last day when every match is done', () => {
    expect(computeTier(EVENT, [match('done'), match('done')], AFTER_GRACE)).toBe('final');
  });

  it('stays live during the 24 h grace period even if every match is done', () => {
    expect(computeTier(EVENT, [match('done')], WITHIN_GRACE)).toBe('live');
  });

  it('stays live after the dates when some match is not done', () => {
    expect(computeTier(EVENT, [match('done'), match('scheduled')], AFTER_GRACE)).toBe('live');
    expect(computeTier(EVENT, [match('done'), match('live')], AFTER_GRACE)).toBe('live');
  });

  it('is never final with no matches at all', () => {
    expect(computeTier(EVENT, [], AFTER_GRACE)).toBe('live');
  });

  it('is live when the tournament is missing from the events list', () => {
    expect(computeTier(undefined, [match('done')], AFTER_GRACE)).toBe('live');
  });

  it('is live when the end date cannot be parsed', () => {
    expect(computeTier({ ...EVENT, endDateTime: 'garbage' }, [match('done')], AFTER_GRACE)).toBe('live');
  });

  it('counts the grace period from a precise end timestamp', () => {
    const precise = { ...EVENT, endDateTime: '2026-09-14T18:00:00Z' };
    expect(computeTier(precise, [match('done')], Date.parse('2026-09-15T17:00:00Z'))).toBe('live');
    expect(computeTier(precise, [match('done')], Date.parse('2026-09-15T19:00:00Z'))).toBe('final');
  });

  it('is future before the start while every match is still scheduled', () => {
    expect(computeTier(EVENT, [match('scheduled')], BEFORE_START)).toBe('future');
    expect(computeTier(EVENT, [], BEFORE_START)).toBe('future');
  });

  it('is live before the official start if a match is already under way', () => {
    expect(computeTier(EVENT, [match('scheduled'), match('live')], BEFORE_START)).toBe('live');
  });

  it('is live while the tournament is running', () => {
    expect(computeTier(EVENT, [match('done'), match('scheduled')], DURING)).toBe('live');
  });
});

describe('TIER_CACHE_CONTROL', () => {
  it('maps each tier to its CDN/browser header', () => {
    expect(TIER_CACHE_CONTROL).toEqual({
      final: 'public, max-age=31536000, s-maxage=31536000, immutable',
      live: 'public, s-maxage=15, stale-while-revalidate=60',
      future: 'public, s-maxage=3600, stale-while-revalidate=86400',
    });
  });
});
```

- [ ] **Step 3: Запустить, убедиться, что падают**

```bash
cd /Users/zarabotaet/wtt && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && npx vitest run lib/tier.test.ts lib/events.test.ts
```

Ожидается: FAIL. Причины: `Failed to resolve import "./tier"` и `eventEndMs is not a function` (или `not exported`).

- [ ] **Step 4: Реализация**

В конец `lib/types.ts` добавь:

```ts
// Server-side cache class of a tournament snapshot — see lib/tier.ts.
export type Tier = 'final' | 'live' | 'future';

export interface EventEnvelope {
  eventId: string;
  matches: Match[];
  tier: Tier;
  generatedAt: number; // ms epoch when the server built this snapshot
}
```

В `lib/events.ts`:

1. Замени `const DAY_MS = 24 * 60 * 60 * 1000;` на `export const DAY_MS = 24 * 60 * 60 * 1000;`.
2. Функцию `tournamentStatus` целиком замени на следующий блок. Комментарий и `isMidnightString` над ней не трогай.

```ts
export function eventEndMs(endDateTime: string): number {
  const end = new Date(endDateTime).getTime();
  // extend a bare midnight date through the rest of that calendar day
  return !isNaN(end) && isMidnightString(endDateTime) ? end + DAY_MS - 1 : end;
}

export function tournamentStatus(item: RawEventListItem, now: number = Date.now()): EventStatus {
  const start = new Date(item.startDateTime).getTime();
  const end = eventEndMs(item.endDateTime);
  if (!isNaN(start) && !isNaN(end) && start <= now && now <= end) return 'ongoing';
  if (!isNaN(start) && start > now) return 'future';
  return 'past';
}
```

Создай `lib/tier.ts`:

```ts
import { DAY_MS, eventEndMs, tournamentStatus } from './events';
import type { Match, RawEventListItem, Tier } from './types';

// "final" is cached forever — server 'max' lifetime, CDN + browser
// immutable, IndexedDB never refetches — so it needs two independent
// signals: the calendar (a full day of grace after the last day, for late
// results) AND every known match being done. An event missing from the
// events list has no dates, so it can never be final.
export function computeTier(event: RawEventListItem | undefined, matches: Match[], now: number): Tier {
  if (!event) return 'live';
  if (tournamentStatus(event, now) === 'future' && matches.every((m) => m.status === 'scheduled')) {
    return 'future';
  }
  const end = eventEndMs(event.endDateTime);
  if (!isNaN(end) && end + DAY_MS < now && matches.length > 0 && matches.every((m) => m.status === 'done')) {
    return 'final';
  }
  return 'live';
}

// s-maxage is what Vercel's CDN honours; max-age alone only reaches the
// browser, so final carries both.
export const TIER_CACHE_CONTROL: Record<Tier, string> = {
  final: 'public, max-age=31536000, s-maxage=31536000, immutable',
  live: 'public, s-maxage=15, stale-while-revalidate=60',
  future: 'public, s-maxage=3600, stale-while-revalidate=86400',
};
```

- [ ] **Step 5: Тесты проходят**

```bash
cd /Users/zarabotaet/wtt && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && npm test && npx tsc --noEmit
```

Ожидается: всё PASS, `tsc` без ошибок.

- [ ] **Step 6: Commit**

```bash
cd /Users/zarabotaet/wtt && git add lib/types.ts lib/events.ts lib/events.test.ts lib/tier.ts lib/tier.test.ts && git commit -m "$(cat <<'EOF'
Add tournament cache tier computation

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)" && git push
```

---

### Task 2: Включить Cache Components

**Files:**
- Modify: `next.config.mjs`
- Create: `lib/event-list.ts`, `lib/event-list.test.ts`
- Modify: `app/page.tsx`, `app/events/page.tsx`, `app/sitemap.ts`, `app/events/[eventId]/page.tsx`, `app/api/events/[eventId]/live/route.ts`, `app/api/events/[eventId]/matches/route.ts`

**Interfaces:**
- Consumes: `fetchEventsList()` из `lib/wtt-api.ts`, `normalizeEventsList()` из `lib/events.ts`.
- Produces: `getEventsList(): Promise<NormalizedEvent[]>` (`lib/event-list.ts`), кэшируется на час. Во всём приложении больше нет `export const revalidate` (с `cacheComponents` он запрещён).

- [ ] **Step 1: Падающий тест**

`lib/event-list.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ cacheLife: vi.fn() }));
vi.mock('./wtt-api', () => ({ fetchEventsList: vi.fn() }));

import { cacheLife } from 'next/cache';
import { fetchEventsList } from './wtt-api';
import { getEventsList } from './event-list';

describe('getEventsList', () => {
  it('caches the normalized events list for hours', async () => {
    vi.mocked(fetchEventsList).mockResolvedValue([
      { eventId: '1', eventName: 'Old Open', startDateTime: '2020-01-01T00:00:00Z', endDateTime: '2020-01-05T00:00:00Z' },
    ]);
    const events = await getEventsList();
    expect(cacheLife).toHaveBeenCalledWith('hours');
    expect(fetchEventsList).toHaveBeenCalledWith();
    expect(events).toEqual([expect.objectContaining({ eventId: '1', status: 'past' })]);
  });
});
```

- [ ] **Step 2: Убедиться, что падает**

```bash
cd /Users/zarabotaet/wtt && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && npx vitest run lib/event-list.test.ts
```

Ожидается: FAIL, `Failed to resolve import "./event-list"`.

- [ ] **Step 3: Реализация `lib/event-list.ts`**

```ts
import { cacheLife } from 'next/cache';
import { fetchEventsList } from './wtt-api';
import { normalizeEventsList } from './events';
import type { NormalizedEvent } from './types';

// One cached copy of the tournaments list shared by /, /events, the
// sitemap, page metadata and getEventData. The status field is computed at
// cache time (up to an hour stale) — fine for sorting and status dots;
// lib/tier.ts recomputes from the raw dates with its own clock.
export async function getEventsList(): Promise<NormalizedEvent[]> {
  'use cache: remote';
  cacheLife('hours');
  return normalizeEventsList(await fetchEventsList());
}
```

- [ ] **Step 4: Конфиг**

`next.config.mjs` целиком:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // 'use cache' / cacheLife (lib/event-list.ts, lib/event-data.ts,
  // lib/wtt-api.ts fetchMatchCard). partialPrefetching lets tournaments
  // missing from generateStaticParams be served from an App Shell and
  // cached after their first visit (ISR with Cache Components).
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
```

- [ ] **Step 5: Потребители списка**

`app/page.tsx` целиком:

```tsx
import { redirect } from 'next/navigation';
import { getEventsList } from '@/lib/event-list';

export default async function RootPage() {
  const events = await getEventsList();
  if (events.length) {
    redirect(`/events/${events[0].eventId}`);
  }
  redirect('/events');
}
```

`app/events/page.tsx`:

- замени два импорта (`fetchEventsList` и `normalizeEventsList`) на `import { getEventsList } from '@/lib/event-list';`;
- удали строку `export const revalidate = 3600;`;
- в теле замени `const events = normalizeEventsList(await fetchEventsList(3600));` на `const events = await getEventsList();`.

`app/sitemap.ts`: то же самое. Импорт заменяется на `import { getEventsList } from '@/lib/event-list';`, строка с `events` становится `const events = await getEventsList();`.

`app/api/events/[eventId]/live/route.ts` и `app/api/events/[eventId]/matches/route.ts`: удали строку `export const revalidate = …;`. Больше в этих файлах ничего не меняй.

- [ ] **Step 6: Страница турнира**

`app/events/[eventId]/page.tsx` целиком:

```tsx
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getEventMatches } from '@/lib/get-event-matches';
import { getEventsList } from '@/lib/event-list';
import { WttApiError } from '@/lib/wtt-api';
import { ZoomSlider } from '@/components/ZoomSlider';
import { MatchFeed } from '@/components/MatchFeed';
import { Footer } from '@/components/Footer';

// Cache Components requires at least one param. Prerender the top of the
// list (ongoing first); every other tournament is served from the App
// Shell on its first visit and cached from then on.
export async function generateStaticParams() {
  const events = await getEventsList();
  return events.slice(0, 1).map((e) => ({ eventId: String(e.eventId) }));
}

export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> {
  const { eventId } = await params;
  const events = await getEventsList();
  const event = events.find((e) => String(e.eventId) === String(eventId));
  const title = event ? `${event.eventName} — Matches & Results` : 'WTT Matches';
  const description = event ? `Live scores, schedule and results for ${event.eventName}.` : undefined;
  return {
    title,
    description,
    alternates: { canonical: `/events/${eventId}` },
    openGraph: { title, description },
  };
}

// params are awaited inside the boundary so tournaments outside
// generateStaticParams still get an App Shell.
export default function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  return (
    <>
      <Suspense fallback={<FeedFallback />}>
        <EventContent params={params} />
      </Suspense>
      <ZoomSlider />
      <Footer />
    </>
  );
}

function FeedFallback() {
  return (
    <main>
      <div className="feed">
        <div className="empty-msg">Loading…</div>
      </div>
    </main>
  );
}

async function EventContent({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const matchesPromise = getEventMatches(eventId, 60, { fillMissingScores: false }).catch((err) => {
    if (err instanceof WttApiError && (err.status === 404 || err.status === 403)) {
      notFound();
    }
    throw err;
  });
  const [matches, events] = await Promise.all([matchesPromise, getEventsList()]);

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <MatchFeed eventId={eventId} initialMatches={matches} events={events} />
    </>
  );
}
```

- [ ] **Step 7: Тесты, линт, сборка**

```bash
cd /Users/zarabotaet/wtt && grep -rn "export const revalidate" app || echo "no revalidate left"
cd /Users/zarabotaet/wtt && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && npm test && npx tsc --noEmit && npm run lint && npm run build
```

Ожидается:
- `no revalidate left`;
- тесты PASS;
- lint без ошибок (warnings допустимы);
- `next build` успешен, в таблице маршрутов `/events/[eventId]` помечен как partial prerender.

Если сборка падает:
- **`Uncached data was accessed outside of <Suspense>`** (про `generateMetadata`): обернуть `generateMetadata` в `<Suspense>` нельзя, поэтому удали `partialPrefetching` и `generateStaticParams` и собери снова. Страница станет динамической, дальше кэширует `getEventData` (Task 4). Запиши это в отчёт задачи.
- **`partialPrefetching` не распознан:** удали эту строку из конфига.
- **Другая ошибка:** не обходи её, остановись и опиши.

- [ ] **Step 8: Commit**

```bash
cd /Users/zarabotaet/wtt && git add next.config.mjs lib/event-list.ts lib/event-list.test.ts app/page.tsx app/events/page.tsx app/sitemap.ts "app/events/[eventId]/page.tsx" "app/api/events/[eventId]/live/route.ts" "app/api/events/[eventId]/matches/route.ts" && git commit -m "$(cat <<'EOF'
Enable Cache Components and cache the events list

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)" && git push
```

---

### Task 3: Кэш карточек матчей

**Files:**
- Modify: `lib/wtt-api.ts` (импорты + функция `fetchMatchCard`)
- Modify: `lib/get-event-matches.ts` (4 вызова `fetchMatchCard`)
- Test: `lib/wtt-api.test.ts`

**Interfaces:**
- Consumes: `computeSets`, `isDecided`, `parseScores` из `lib/merge-matches.ts`.
- Produces: `fetchMatchCard(eventId: string, docCode: string): Promise<MatchCard>` — **два** аргумента. Решённая карточка получает `cacheLife('max')`, иначе `cacheLife({ stale: 0, revalidate: 1, expire: 2 })`.

- [ ] **Step 1: Падающие тесты**

В `lib/wtt-api.test.ts`:

1. Сразу после строки `import { fetchEventsList, … } from './wtt-api';` добавь:

```ts
import { cacheLife } from 'next/cache';

vi.mock('next/cache', () => ({ cacheLife: vi.fn() }));
```

2. Существующий `describe('fetchMatchCard', …)` целиком замени на:

```ts
describe('fetchMatchCard', () => {
  beforeEach(() => {
    vi.mocked(cacheLife).mockClear();
  });

  it('builds a cache-busted matchdata URL from eventId and documentCode', async () => {
    mockFetchOnce({});
    await fetchMatchCard('12345', 'DOC-CODE');
    const [url] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string];
    expect(url).toContain('/matchdata/12345/DOC-CODE.json');
    expect(url).toMatch(/[?&]q=\d+/);
  });

  it('caches a card with a decided winner for the maximum lifetime', async () => {
    mockFetchOnce({
      competitiors: [{ scores: '11,11,11,0,0' }, { scores: '5,6,7,0,0' }],
      matchConfig: { bestOfXGames: 5 },
    });
    await fetchMatchCard('12345', 'DOC');
    expect(cacheLife).toHaveBeenCalledTimes(1);
    expect(cacheLife).toHaveBeenCalledWith('max');
  });

  it('keeps an undecided card only for a couple of seconds', async () => {
    mockFetchOnce({
      competitiors: [{ scores: '11,5,0,0,0' }, { scores: '5,11,0,0,0' }],
      matchConfig: { bestOfXGames: 5 },
    });
    await fetchMatchCard('12345', 'DOC');
    expect(cacheLife).toHaveBeenCalledTimes(1);
    expect(cacheLife).toHaveBeenCalledWith({ stale: 0, revalidate: 1, expire: 2 });
  });

  it('treats a card without two competitors as undecided', async () => {
    mockFetchOnce({});
    await fetchMatchCard('12345', 'DOC');
    expect(cacheLife).toHaveBeenCalledWith({ stale: 0, revalidate: 1, expire: 2 });
  });
});
```

3. Добавь `beforeEach` в импорт из `vitest` в первой строке: `import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';`.

- [ ] **Step 2: Убедиться, что падают**

```bash
cd /Users/zarabotaet/wtt && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && npx vitest run lib/wtt-api.test.ts
```

Ожидается: FAIL в трёх новых тестах, `cacheLife` вызван 0 раз.

- [ ] **Step 3: Реализация**

В `lib/wtt-api.ts` после блока `import type { … } from './types';` добавь:

```ts
import { cacheLife } from 'next/cache';
import { computeSets, isDecided, parseScores } from './merge-matches';
```

Функцию `fetchMatchCard` (сейчас `export function fetchMatchCard(eventId: string, docCode: string, revalidateSeconds?: number)…` из пяти строк) целиком замени на:

```ts
function isCardFinal(card: MatchCard): boolean {
  const c = card?.competitiors;
  if (!c || c.length !== 2) return false;
  const { setsA, setsB } = computeSets(parseScores(c[0].scores), parseScores(c[1].scores));
  return isDecided(setsA, setsB, card.matchConfig?.bestOfXGames || 5);
}

// A matchdata/ card with a decided winner never changes again — the
// server-side twin of the prototype's IndexedDB rule "never re-fetch a
// known finished score" — so it is kept for the maximum lifetime. An
// undecided (live/scheduled) card is kept for a second or two only, so
// every getEventData regeneration reads it fresh; the cache-busting q=
// param is still always present (see resolveUrl).
export async function fetchMatchCard(eventId: string, docCode: string): Promise<MatchCard> {
  'use cache: remote';
  const card = await fetchJson<MatchCard>(resolveUrl(`${BASE_URL}/matchdata/${eventId}/${docCode}.json`));
  if (isCardFinal(card)) cacheLife('max');
  else cacheLife({ stale: 0, revalidate: 1, expire: 2 });
  return card;
}
```

Убери третий аргумент у четырёх вызовов в `lib/get-event-matches.ts`:

```bash
cd /Users/zarabotaet/wtt && perl -pi -e 's/fetchMatchCard\(eventId, (.*?), revalidateSeconds\)/fetchMatchCard(eventId, $1)/g' lib/get-event-matches.ts && grep -c "fetchMatchCard(eventId" lib/get-event-matches.ts && (grep -n "fetchMatchCard.*revalidateSeconds" lib/get-event-matches.ts || echo "clean")
```

Ожидается: `4`, затем `clean`.

- [ ] **Step 4: Проверка**

```bash
cd /Users/zarabotaet/wtt && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && npm test && npx tsc --noEmit && npm run build
```

Ожидается: всё PASS, сборка успешна.

Если сборка ругается на `fetch` с `cache: 'no-store'` внутри `'use cache'`, поправь `fetchJson` в `lib/wtt-api.ts`. Когда `revalidateSeconds === undefined`, опции должны быть `undefined`:

```ts
revalidateSeconds === undefined ? undefined : { next: { revalidate: revalidateSeconds } }
```

URL и так уникален благодаря бакету в 1 мс. Тест `uses cache: no-store when no revalidateSeconds is given` в `lib/wtt-api.test.ts` при этом обнови: жди `undefined`.

- [ ] **Step 5: Commit и уборка stash**

```bash
cd /Users/zarabotaet/wtt && git add lib/wtt-api.ts lib/wtt-api.test.ts lib/get-event-matches.ts && git commit -m "$(cat <<'EOF'
Cache decided match cards with use cache: remote

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)" && git push
cd /Users/zarabotaet/wtt && git stash list | grep -n "superseded by layered-cache Task 3" || echo "no stash to drop"
```

Если stash найден (например, `stash@{0}`), удали его: `git stash drop stash@{0}`, подставив свой номер.

---

### Task 4: `getEventData` и единый эндпоинт

**Files:**
- Modify (целиком): `lib/get-event-matches.ts`
- Modify: `lib/get-event-matches.test.ts` (удалить последний тест)
- Create: `lib/event-data.ts`, `lib/event-data.test.ts`
- Create: `app/api/events/[eventId]/route.ts`, `app/api/events/[eventId]/route.test.ts`
- Modify: `app/events/[eventId]/page.tsx`, `app/api/events/[eventId]/live/route.ts`, `app/api/events/[eventId]/matches/route.ts`, `vitest.config.ts`

**Interfaces:**
- Consumes: `getEventsList()` (Task 2), `computeTier`, `TIER_CACHE_CONTROL` (Task 1), `EventEnvelope` (Task 1).
- Produces:
  - `getEventMatches(eventId: string): Promise<Match[]>` — всегда полный проход;
  - `getEventData(eventId: string): Promise<EventEnvelope | null>`, где `null` означает 404/403 от WTT;
  - `GET /api/events/[eventId]` → `EventEnvelope` JSON + `Cache-Control`; 404 `{error:'not found'}`; 502 `{error:'upstream error'}`.

- [ ] **Step 1: Упростить `getEventMatches`**

`lib/get-event-matches.ts` целиком. Логика слияния та же, что и была; убраны только `revalidateSeconds` и быстрый путь.

```ts
import { fetchArchive, fetchLiveIds, fetchMatchCard, fetchOfficialResult, fetchResults10, fetchSchedule } from './wtt-api';
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

// Always the full pass (officialresult discovery + missing-score fill-in).
// It can take seconds for a tournament deep into its bracket, but it only
// runs inside getEventData's 'use cache: remote' scope (lib/event-data.ts),
// so visitors are served the cached result and regeneration happens in the
// background.
export async function getEventMatches(eventId: string): Promise<Match[]> {
  const [scheduleRaw, results10Raw, archiveRaw, liveIdsRaw, officialResultRaw] = await Promise.all([
    fetchSchedule(eventId),
    fetchResults10(eventId).catch(() => []),
    fetchArchive(eventId).catch(() => []),
    fetchLiveIds(eventId).catch(() => []),
    fetchOfficialResult(eventId).catch(() => []),
  ]);

  // IMPORTANT: each schedule.json item can bundle MANY matches under one
  // Competition.Unit array, not a single match — taking only Unit[0]
  // silently drops the rest (see docs/API_REFERENCE.md §2).
  const allUnits: RawUnit[] = [];
  (Array.isArray(scheduleRaw) ? scheduleRaw : []).forEach((item) => {
    (item.Competition?.Unit || []).forEach((u) => allUnits.push(u));
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

  // officialresult(_minimal).json lists EVERY completed match of the
  // tournament — unlike schedule.json, which only carries a partial,
  // near-term window and silently drops matches from days ago once a
  // tournament has run long enough. Anything it lists that schedule.json
  // and the archive endpoint both have no entry for gets its own matchdata/
  // card fetched individually, same concurrency-limited pattern as the
  // other point lookups below.
  const orphanDoneCards: Record<string, { docCode: string; startDateLocal: string; card: MatchCard | null }> = {};
  const knownScheduleCodes = new Set(units.map((u) => normalizeCode(u.Code)));
  const knownArchiveCodes = new Set(archiveItems.map((item) => normalizeCode(item.documentCode)));
  const officialResultCandidates = (Array.isArray(officialResultRaw) ? officialResultRaw : []).filter(
    (item) => {
      const normCode = normalizeCode(item.documentCode);
      return !knownScheduleCodes.has(normCode) && !knownArchiveCodes.has(normCode);
    }
  );
  const orphanDoneEntries = await mapLimit(officialResultCandidates, MISSING_SCORE_CONCURRENCY, async (item) => {
    const normCode = normalizeCode(item.documentCode);
    try {
      return [
        normCode,
        {
          docCode: item.documentCode,
          startDateLocal: item.startDateLocal,
          card: await fetchMatchCard(eventId, item.documentCode),
        },
      ] as const;
    } catch {
      return null; // try again next regeneration
    }
  });
  orphanDoneEntries.forEach((entry) => {
    if (entry) orphanDoneCards[entry[0]] = entry[1];
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
    orphanDoneCards,
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
    orphanDoneCards,
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
        orphanDoneCards,
      });
    }
  }

  // Sort like the prototype did (sortKey(b) - sortKey(a): future → past).
  // String comparison is safe and hydration-consistent here because every
  // startDate is either the API's own "YYYY-MM-DDTHH:mm:ss" (zero-padded,
  // lexicographic order == chronological order) or an orphan-live match's
  // new Date().toISOString() stamp (also zero-padded ISO, same ordering).
  matches.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));

  return matches;
}
```

В `lib/get-event-matches.test.ts` удали целиком последний тест `it('with fillMissingScores: false, skips officialresult.json discovery …', …)`: от строки `it('with fillMissingScores: false` до его закрывающего `});`. Закрывающий `});` самого `describe` оставь.

- [ ] **Step 2: Падающие тесты `getEventData`**

`lib/event-data.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Match, NormalizedEvent } from './types';

vi.mock('next/cache', () => ({ cacheLife: vi.fn() }));
vi.mock('./get-event-matches', () => ({ getEventMatches: vi.fn() }));
vi.mock('./event-list', () => ({ getEventsList: vi.fn() }));

import { cacheLife } from 'next/cache';
import { getEventMatches } from './get-event-matches';
import { getEventsList } from './event-list';
import { WttApiError } from './wtt-api';
import { getEventData } from './event-data';

const NOW = Date.parse('2026-09-20T12:00:00Z');

function match(status: Match['status']): Match {
  return {
    code: 'X', normCode: 'X', startDate: '2026-09-12T11:00:00', endDate: '2026-09-12T12:00:00',
    status, round: 'R', subEvent: 'Singles', table: 'T1', venue: 'V',
    players: [{ name: 'A', seed: null }, { name: 'B', seed: null }],
    gameScores: status === 'done' ? [[11, 11, 11], [5, 5, 5]] : null,
    winnerIdx: status === 'done' ? 0 : null, isTbd: false,
  };
}

function event(eventId: string, start: string, end: string): NormalizedEvent {
  return { eventId, eventName: `Event ${eventId}`, startDateTime: start, endDateTime: end, status: 'past' };
}

const EVENTS = [
  event('PAST', '2026-09-10T00:00:00Z', '2026-09-14T00:00:00Z'),
  event('NOW', '2026-09-18T00:00:00Z', '2026-09-22T00:00:00Z'),
  event('SOON', '2026-10-01T00:00:00Z', '2026-10-05T00:00:00Z'),
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  vi.mocked(getEventsList).mockResolvedValue(EVENTS);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getEventData', () => {
  it('builds a final envelope and caches it for the maximum lifetime', async () => {
    const matches = [match('done')];
    vi.mocked(getEventMatches).mockResolvedValue(matches);
    const env = await getEventData('PAST');
    expect(env).toEqual({ eventId: 'PAST', matches, tier: 'final', generatedAt: NOW });
    expect(getEventMatches).toHaveBeenCalledWith('PAST');
    expect(cacheLife).toHaveBeenCalledTimes(1);
    expect(cacheLife).toHaveBeenCalledWith('max');
  });

  it('regenerates a live tournament every 15 s', async () => {
    vi.mocked(getEventMatches).mockResolvedValue([match('done'), match('live')]);
    const env = await getEventData('NOW');
    expect(env?.tier).toBe('live');
    expect(cacheLife).toHaveBeenCalledWith({ revalidate: 15, expire: 86400 });
  });

  it('regenerates a future tournament hourly', async () => {
    vi.mocked(getEventMatches).mockResolvedValue([match('scheduled')]);
    const env = await getEventData('SOON');
    expect(env?.tier).toBe('future');
    expect(cacheLife).toHaveBeenCalledWith({ revalidate: 3600, expire: 604800 });
  });

  it('treats the tournament as live when the events list is unavailable', async () => {
    vi.mocked(getEventsList).mockRejectedValue(new Error('list down'));
    vi.mocked(getEventMatches).mockResolvedValue([match('done')]);
    const env = await getEventData('PAST');
    expect(env?.tier).toBe('live');
  });

  it.each([404, 403])('returns null for a WTT %i and remembers it for minutes', async (status) => {
    vi.mocked(getEventMatches).mockRejectedValue(new WttApiError(status, 'u'));
    await expect(getEventData('GONE')).resolves.toBeNull();
    expect(cacheLife).toHaveBeenCalledWith('minutes');
  });

  it('rethrows other upstream errors without caching', async () => {
    vi.mocked(getEventMatches).mockRejectedValue(new WttApiError(500, 'u'));
    await expect(getEventData('PAST')).rejects.toThrow('500');
    expect(cacheLife).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Убедиться, что падают**

```bash
cd /Users/zarabotaet/wtt && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && npx vitest run lib/event-data.test.ts
```

Ожидается: FAIL, `Failed to resolve import "./event-data"`.

- [ ] **Step 4: Реализация `lib/event-data.ts`**

```ts
import { cacheLife } from 'next/cache';
import { getEventMatches } from './get-event-matches';
import { getEventsList } from './event-list';
import { computeTier } from './tier';
import { WttApiError } from './wtt-api';
import type { EventEnvelope, Match, NormalizedEvent } from './types';

// The single server-side source for a tournament: page SSR and
// GET /api/events/[eventId] both read this. The lifetime is picked after
// the data is known (conditional cacheLife); an explicit outer cacheLife
// overrides the short lifetimes of the nested match-card caches.
// Not-found is returned as null rather than thrown: an error crossing the
// 'use cache' boundary is not guaranteed to keep its class.
export async function getEventData(eventId: string): Promise<EventEnvelope | null> {
  'use cache: remote';
  let matches: Match[];
  let events: NormalizedEvent[];
  try {
    [matches, events] = await Promise.all([getEventMatches(eventId), getEventsList().catch(() => [])]);
  } catch (err) {
    if (err instanceof WttApiError && (err.status === 404 || err.status === 403)) {
      cacheLife('minutes');
      return null;
    }
    throw err;
  }

  const now = Date.now();
  const event = events.find((e) => String(e.eventId) === String(eventId));
  const tier = computeTier(event, matches, now);
  if (tier === 'final') cacheLife('max');
  else if (tier === 'live') cacheLife({ revalidate: 15, expire: 86400 });
  else cacheLife({ revalidate: 3600, expire: 604800 });

  return { eventId: String(eventId), matches, tier, generatedAt: now };
}
```

- [ ] **Step 5: Тесты `getEventData` проходят**

```bash
cd /Users/zarabotaet/wtt && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && npx vitest run lib/event-data.test.ts lib/get-event-matches.test.ts
```

Ожидается: PASS.

- [ ] **Step 6: Падающий тест роута**

В `vitest.config.ts` в проекте `node` строку `include: ['lib/**/*.test.ts'],` замени на `include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],`.

`app/api/events/[eventId]/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventEnvelope, Tier } from '@/lib/types';

vi.mock('@/lib/event-data', () => ({ getEventData: vi.fn() }));

import { getEventData } from '@/lib/event-data';
import { GET } from './route';

function call(eventId: string) {
  return GET(new Request(`http://localhost/api/events/${eventId}`), { params: Promise.resolve({ eventId }) });
}

function envelope(tier: Tier): EventEnvelope {
  return { eventId: 'E1', matches: [], tier, generatedAt: 1 };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/events/[eventId]', () => {
  it.each([
    ['final', 'public, max-age=31536000, s-maxage=31536000, immutable'],
    ['live', 'public, s-maxage=15, stale-while-revalidate=60'],
    ['future', 'public, s-maxage=3600, stale-while-revalidate=86400'],
  ] as const)('serves a %s envelope with its Cache-Control', async (tier, header) => {
    vi.mocked(getEventData).mockResolvedValue(envelope(tier));
    const res = await call('E1');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe(header);
    expect(await res.json()).toEqual(envelope(tier));
    expect(getEventData).toHaveBeenCalledWith('E1');
  });

  it('returns an uncacheable 404 for an unknown tournament', async () => {
    vi.mocked(getEventData).mockResolvedValue(null);
    const res = await call('NOPE');
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ error: 'not found' });
  });

  it('returns an uncacheable 502 when WTT fails', async () => {
    vi.mocked(getEventData).mockRejectedValue(new Error('boom'));
    const res = await call('E1');
    expect(res.status).toBe(502);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
```

```bash
cd /Users/zarabotaet/wtt && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && npx vitest run "app/api/events/[eventId]/route.test.ts"
```

Ожидается: FAIL, `Failed to resolve import "./route"`.

- [ ] **Step 7: Роут и потребители**

`app/api/events/[eventId]/route.ts`:

```ts
import { getEventData } from '@/lib/event-data';
import { TIER_CACHE_CONTROL } from '@/lib/tier';

// The one client data endpoint (replaces .../matches and .../live).
// Cache-Control follows the tier so the CDN absorbs repeat requests and a
// final tournament is never requested twice by the same browser.
export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  try {
    const envelope = await getEventData(eventId);
    if (!envelope) {
      return Response.json({ error: 'not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json(envelope, { headers: { 'Cache-Control': TIER_CACHE_CONTROL[envelope.tier] } });
  } catch {
    return Response.json({ error: 'upstream error' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
```

Временные прослойки, которые удалит Task 8, чтобы старый UI продолжал работать. `app/api/events/[eventId]/matches/route.ts` и `app/api/events/[eventId]/live/route.ts` получают **одинаковое** содержимое:

```ts
import { getEventData } from '@/lib/event-data';

// Temporary shim until the Effector UI switches to GET /api/events/[eventId]
// (layered-cache plan, Task 8): returns the cached snapshot's matches.
export async function GET(_req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const envelope = await getEventData(eventId);
  if (!envelope) return Response.json({ error: 'not found' }, { status: 404 });
  return Response.json(envelope.matches);
}
```

В `app/events/[eventId]/page.tsx`:

1. Импорты `getEventMatches` и `WttApiError` замени на `import { getEventData } from '@/lib/event-data';`.
2. Функцию `EventContent` целиком замени на:

```tsx
async function EventContent({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const [envelope, events] = await Promise.all([getEventData(eventId), getEventsList()]);
  if (!envelope) notFound();

  const jsonLd = envelope.matches.slice(0, 20).map((m) => ({
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: m.round,
    startDate: m.startDate,
    competitor: m.players.map((p) => ({ '@type': 'Person', name: p.name })),
    location: { '@type': 'Place', name: m.venue },
  }));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <MatchFeed eventId={envelope.eventId} initialMatches={envelope.matches} events={events} />
    </>
  );
}
```

- [ ] **Step 8: Всё зелёное**

```bash
cd /Users/zarabotaet/wtt && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && npm test && npx tsc --noEmit && npm run lint && npm run build
```

Ожидается: PASS, сборка успешна.

- [ ] **Step 9: Commit**

```bash
cd /Users/zarabotaet/wtt && git add lib/get-event-matches.ts lib/get-event-matches.test.ts lib/event-data.ts lib/event-data.test.ts "app/api/events/[eventId]/route.ts" "app/api/events/[eventId]/route.test.ts" "app/api/events/[eventId]/live/route.ts" "app/api/events/[eventId]/matches/route.ts" "app/events/[eventId]/page.tsx" vitest.config.ts && git commit -m "$(cat <<'EOF'
Serve tournaments from a tier-cached envelope

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)" && git push
```

---

### Task 5: Клиентская запись и слияние

**Files:**
- Create: `lib/model/entry.ts`, `lib/model/entry.test.ts`, `lib/model/merge-entry.ts`, `lib/model/merge-entry.test.ts`

**Interfaces:**
- Consumes: `EventEnvelope`, `Match` из `lib/types.ts`.
- Produces:
  - `SCHEMA_VERSION = 1`;
  - `interface Entry extends EventEnvelope { fetchedAt: number; v: number }`;
  - `entryKey(id: string): string` → `'event_' + id`;
  - `toEntry(env: EventEnvelope, fetchedAt: number): Entry`;
  - `validEntry(raw: unknown, id: string): Entry | null`;
  - `mergeEntry(old: Entry | null, fresh: Entry): Entry`.

- [ ] **Step 1: Падающие тесты**

`lib/model/entry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { entryKey, SCHEMA_VERSION, toEntry, validEntry } from './entry';
import type { EventEnvelope } from '@/lib/types';

const ENV: EventEnvelope = { eventId: '42', matches: [], tier: 'live', generatedAt: 100 };

describe('entry', () => {
  it('keys IndexedDB records by event id', () => {
    expect(entryKey('42')).toBe('event_42');
  });

  it('stamps an envelope with fetch time and schema version', () => {
    expect(toEntry(ENV, 200)).toEqual({ ...ENV, fetchedAt: 200, v: SCHEMA_VERSION });
  });

  it('coerces a numeric event id to a string', () => {
    expect(toEntry({ ...ENV, eventId: 42 as unknown as string }, 1).eventId).toBe('42');
  });

  it('accepts a well-formed record for the requested id', () => {
    const e = toEntry(ENV, 200);
    expect(validEntry(e, '42')).toBe(e);
  });

  it.each([
    ['null', null],
    ['a string', 'junk'],
    ['another schema version', { ...ENV, fetchedAt: 1, v: SCHEMA_VERSION + 1 }],
    ['another event', { ...ENV, eventId: '7', fetchedAt: 1, v: SCHEMA_VERSION }],
    ['no matches array', { ...ENV, matches: undefined, fetchedAt: 1, v: SCHEMA_VERSION }],
  ])('rejects %s', (_label, raw) => {
    expect(validEntry(raw, '42')).toBeNull();
  });
});
```

`lib/model/merge-entry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mergeEntry } from './merge-entry';
import { SCHEMA_VERSION, type Entry } from './entry';
import type { Match } from '@/lib/types';

function match(normCode: string, overrides: Partial<Match> = {}): Match {
  return {
    code: normCode, normCode, startDate: '2026-09-12T11:00:00', endDate: '2026-09-12T12:00:00',
    status: 'scheduled', round: 'R', subEvent: 'Singles', table: 'T1', venue: 'V',
    players: [{ name: 'A', seed: null }, { name: 'B', seed: null }],
    gameScores: null, winnerIdx: null, isTbd: false,
    ...overrides,
  };
}

const DONE = { status: 'done' as const, gameScores: [[11, 11, 11], [5, 5, 5]] as [number[], number[]], winnerIdx: 0 as const };

function entry(overrides: Partial<Entry>): Entry {
  return { eventId: 'E1', matches: [], tier: 'live', generatedAt: 1000, fetchedAt: 1000, v: SCHEMA_VERSION, ...overrides };
}

describe('mergeEntry', () => {
  it('returns the fresh entry when nothing is cached', () => {
    const fresh = entry({ matches: [match('A')] });
    expect(mergeEntry(null, fresh)).toBe(fresh);
  });

  it('ignores a cached entry for another event', () => {
    const fresh = entry({ matches: [match('A')] });
    expect(mergeEntry(entry({ eventId: 'E2' }), fresh)).toBe(fresh);
  });

  it('takes the newer snapshot as the base', () => {
    const old = entry({ generatedAt: 1000, fetchedAt: 1000, matches: [match('A')] });
    const fresh = entry({ generatedAt: 2000, fetchedAt: 2500, matches: [match('A', { status: 'live' })] });
    const merged = mergeEntry(old, fresh);
    expect(merged.matches.map((m) => m.status)).toEqual(['live']);
    expect(merged.generatedAt).toBe(2000);
    expect(merged.fetchedAt).toBe(2500);
  });

  it('keeps a finished score when the newer snapshot has that match less complete', () => {
    const old = entry({ generatedAt: 1000, matches: [match('A', DONE)] });
    const fresh = entry({ generatedAt: 2000, matches: [match('A', { status: 'done' })] });
    expect(mergeEntry(old, fresh).matches[0].gameScores).toEqual(DONE.gameScores);
  });

  it('keeps finished matches the newer snapshot no longer lists, but drops unfinished ones', () => {
    const old = entry({ generatedAt: 1000, matches: [match('GONE_DONE', DONE), match('GONE_SCHED')] });
    const fresh = entry({ generatedAt: 2000, matches: [match('A')] });
    expect(mergeEntry(old, fresh).matches.map((m) => m.normCode).sort()).toEqual(['A', 'GONE_DONE']);
  });

  it('does not let an older (stale CDN) snapshot overwrite newer cached data', () => {
    const cached = entry({ generatedAt: 5000, fetchedAt: 5000, matches: [match('A', DONE), match('B', { status: 'live' })] });
    const staleFresh = entry({ generatedAt: 3000, fetchedAt: 9000, matches: [match('A', { status: 'live' }), match('B')] });
    const merged = mergeEntry(cached, staleFresh);
    expect(merged.matches.find((m) => m.normCode === 'A')?.status).toBe('done');
    expect(merged.matches.find((m) => m.normCode === 'B')?.status).toBe('live');
    expect(merged.generatedAt).toBe(5000);
    expect(merged.fetchedAt).toBe(9000);
  });

  it('never downgrades a final tournament', () => {
    const old = entry({ tier: 'final', generatedAt: 1000 });
    const fresh = entry({ tier: 'live', generatedAt: 2000 });
    expect(mergeEntry(old, fresh).tier).toBe('final');
  });

  it('sorts matches newest start first', () => {
    const old = entry({ generatedAt: 1000, matches: [match('EARLY', { ...DONE, startDate: '2026-09-10T09:00:00' })] });
    const fresh = entry({ generatedAt: 2000, matches: [match('LATE', { startDate: '2026-09-12T09:00:00' })] });
    expect(mergeEntry(old, fresh).matches.map((m) => m.normCode)).toEqual(['LATE', 'EARLY']);
  });
});
```

- [ ] **Step 2: Убедиться, что падают**

```bash
cd /Users/zarabotaet/wtt && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && npx vitest run lib/model
```

Ожидается: FAIL, не резолвятся `./entry` и `./merge-entry`.

- [ ] **Step 3: Реализация**

`lib/model/entry.ts`:

```ts
import type { EventEnvelope } from '@/lib/types';

// Bump to discard every IndexedDB record written by an older client (the
// emergency reset if a bad "final" snapshot ever gets cached).
export const SCHEMA_VERSION = 1;

export interface Entry extends EventEnvelope {
  fetchedAt: number; // ms epoch when this browser received the snapshot
  v: number;
}

export function entryKey(id: string): string {
  return `event_${id}`;
}

export function toEntry(env: EventEnvelope, fetchedAt: number): Entry {
  return { ...env, eventId: String(env.eventId), fetchedAt, v: SCHEMA_VERSION };
}

// IndexedDB content is outside our control (older schema, another tab's
// bug, manual edits) — anything that doesn't look like our record counts
// as missing.
export function validEntry(raw: unknown, id: string): Entry | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Partial<Entry>;
  if (e.v !== SCHEMA_VERSION || String(e.eventId) !== String(id) || !Array.isArray(e.matches)) return null;
  return e as Entry;
}
```

`lib/model/merge-entry.ts`:

```ts
import type { Match } from '@/lib/types';
import { SCHEMA_VERSION, type Entry } from './entry';

function isComplete(m: Match): boolean {
  return m.status === 'done' && m.gameScores !== null;
}

// Combines what the browser already has with a new snapshot. The snapshot
// generated later wins as the base — a CDN or SSR copy can be older than
// what IndexedDB holds. On top of that, a finished score is never lost or
// rolled back by a less complete copy, the same rule the prototype applied
// to its IndexedDB cache.
export function mergeEntry(old: Entry | null, fresh: Entry): Entry {
  if (!old || old.v !== fresh.v || String(old.eventId) !== String(fresh.eventId)) return fresh;
  const [base, other] = fresh.generatedAt >= old.generatedAt ? [fresh, old] : [old, fresh];

  const otherByCode = new Map(other.matches.map((m) => [m.normCode, m]));
  const baseCodes = new Set(base.matches.map((m) => m.normCode));
  const matches = base.matches.map((m) => {
    const o = otherByCode.get(m.normCode);
    return o && isComplete(o) && !isComplete(m) ? o : m;
  });
  other.matches.forEach((m) => {
    if (!baseCodes.has(m.normCode) && isComplete(m)) matches.push(m);
  });
  matches.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));

  return {
    ...base,
    matches,
    tier: old.tier === 'final' || fresh.tier === 'final' ? 'final' : base.tier,
    generatedAt: Math.max(old.generatedAt, fresh.generatedAt),
    fetchedAt: Math.max(old.fetchedAt, fresh.fetchedAt),
    v: SCHEMA_VERSION,
  };
}
```

- [ ] **Step 4: Тесты проходят**

```bash
cd /Users/zarabotaet/wtt && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && npx vitest run lib/model && npx tsc --noEmit
```

Ожидается: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/zarabotaet/wtt && git add lib/model/entry.ts lib/model/entry.test.ts lib/model/merge-entry.ts lib/model/merge-entry.test.ts && git commit -m "$(cat <<'EOF'
Add client cache entry and merge rules

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)" && git push
```

---

### Task 6: Режим опроса

**Files:**
- Create: `lib/model/poll-mode.ts`, `lib/model/poll-mode.test.ts`

**Interfaces:**
- Consumes: `Entry` (Task 5).
- Produces:
  - `LIVE_POLL_MS = 30_000`, `WAIT_MIN_MS = 30_000`, `WAIT_MAX_MS = 900_000`, `OVERDUE_MS = 300_000`;
  - `interface PollPlan { mode: 'off' | 'live' | 'wait'; delayMs: number }`;
  - `pollPlan(entry: Entry | null, visible: boolean, now: number): PollPlan`;
  - `needsFetch(entry: Entry | null, maxAgeMs: number, now: number): boolean`.

- [ ] **Step 1: Падающие тесты**

`lib/model/poll-mode.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LIVE_POLL_MS, needsFetch, OVERDUE_MS, pollPlan, WAIT_MAX_MS, WAIT_MIN_MS } from './poll-mode';
import { SCHEMA_VERSION, type Entry } from './entry';
import type { Match } from '@/lib/types';

// Match startDate is venue-local time with no offset, parsed in the
// viewer's timezone — so the fixtures are built in local time too.
const NOW = new Date(2026, 8, 20, 12, 0, 0).getTime();

function localIso(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function match(status: Match['status'], startMs = NOW): Match {
  return {
    code: 'X', normCode: `X${startMs}${status}`, startDate: localIso(startMs), endDate: '',
    status, round: 'R', subEvent: 'Singles', table: 'T1', venue: 'V',
    players: [], gameScores: null, winnerIdx: null, isTbd: false,
  };
}

function entry(overrides: Partial<Entry>): Entry {
  return { eventId: 'E1', matches: [], tier: 'live', generatedAt: NOW, fetchedAt: NOW, v: SCHEMA_VERSION, ...overrides };
}

const MIN = 60_000;

describe('pollPlan', () => {
  it('is off with no entry, for a final tournament, or in a hidden tab', () => {
    expect(pollPlan(null, true, NOW).mode).toBe('off');
    expect(pollPlan(entry({ tier: 'final', matches: [match('live')] }), true, NOW).mode).toBe('off');
    expect(pollPlan(entry({ matches: [match('live')] }), false, NOW).mode).toBe('off');
  });

  it('polls every 30 s while any match is live', () => {
    expect(pollPlan(entry({ matches: [match('done'), match('live')] }), true, NOW)).toEqual({ mode: 'live', delayMs: LIVE_POLL_MS });
  });

  it('waits until the nearest scheduled match', () => {
    const e = entry({ matches: [match('scheduled', NOW + 40 * MIN), match('scheduled', NOW + 10 * MIN)] });
    expect(pollPlan(e, true, NOW)).toEqual({ mode: 'wait', delayMs: 10 * MIN });
  });

  it('never waits less than 30 s', () => {
    expect(pollPlan(entry({ matches: [match('scheduled', NOW + 5_000)] }), true, NOW).delayMs).toBe(WAIT_MIN_MS);
  });

  it('never waits more than 15 min, whatever the timezone skew', () => {
    expect(pollPlan(entry({ matches: [match('scheduled', NOW + 3 * 60 * MIN)] }), true, NOW).delayMs).toBe(WAIT_MAX_MS);
  });

  it('rechecks in 5 min when a scheduled match is overdue', () => {
    expect(pollPlan(entry({ matches: [match('scheduled', NOW - 2 * MIN)] }), true, NOW)).toEqual({ mode: 'wait', delayMs: OVERDUE_MS });
  });

  it('waits the maximum when nothing is scheduled or dates are unreadable', () => {
    expect(pollPlan(entry({ matches: [match('done')] }), true, NOW).delayMs).toBe(WAIT_MAX_MS);
    expect(pollPlan(entry({ matches: [] }), true, NOW).delayMs).toBe(WAIT_MAX_MS);
    expect(pollPlan(entry({ matches: [{ ...match('scheduled'), startDate: 'TBD' }] }), true, NOW).delayMs).toBe(WAIT_MAX_MS);
  });
});

describe('needsFetch', () => {
  it('fetches when nothing is cached', () => {
    expect(needsFetch(null, 15_000, NOW)).toBe(true);
  });

  it('never refetches a final tournament', () => {
    expect(needsFetch(entry({ tier: 'final', fetchedAt: 0 }), 15_000, NOW)).toBe(false);
  });

  it('refetches only past the allowed age', () => {
    expect(needsFetch(entry({ fetchedAt: NOW - 16_000 }), 15_000, NOW)).toBe(true);
    expect(needsFetch(entry({ fetchedAt: NOW - 5_000 }), 15_000, NOW)).toBe(false);
  });
});
```

- [ ] **Step 2: Убедиться, что падают**

```bash
cd /Users/zarabotaet/wtt && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && npx vitest run lib/model/poll-mode.test.ts
```

Ожидается: FAIL, `Failed to resolve import "./poll-mode"`.

- [ ] **Step 3: Реализация `lib/model/poll-mode.ts`**

```ts
import type { Entry } from './entry';

export const LIVE_POLL_MS = 30_000;
export const WAIT_MIN_MS = 30_000;
// Match startDate is venue-local time without an offset, parsed in the
// viewer's timezone, so the computed wait can be off by hours. Capping it
// bounds how late we notice a match that has started.
export const WAIT_MAX_MS = 15 * 60_000;
// The scheduled start has passed but WTT hasn't flipped the match live yet.
export const OVERDUE_MS = 5 * 60_000;

export type PollMode = 'off' | 'live' | 'wait';

export interface PollPlan {
  mode: PollMode;
  delayMs: number;
}

export function pollPlan(entry: Entry | null, visible: boolean, now: number): PollPlan {
  if (!entry || entry.tier === 'final' || !visible) return { mode: 'off', delayMs: 0 };
  if (entry.matches.some((m) => m.status === 'live')) return { mode: 'live', delayMs: LIVE_POLL_MS };
  const starts = entry.matches
    .filter((m) => m.status === 'scheduled')
    .map((m) => new Date(m.startDate).getTime())
    .filter((t) => !isNaN(t));
  if (!starts.length) return { mode: 'wait', delayMs: WAIT_MAX_MS };
  const until = Math.min(...starts) - now;
  if (until <= 0) return { mode: 'wait', delayMs: OVERDUE_MS };
  return { mode: 'wait', delayMs: Math.min(WAIT_MAX_MS, Math.max(WAIT_MIN_MS, until)) };
}

export function needsFetch(entry: Entry | null, maxAgeMs: number, now: number): boolean {
  if (!entry) return true;
  if (entry.tier === 'final') return false;
  return now - entry.fetchedAt > maxAgeMs;
}
```

- [ ] **Step 4: Тесты проходят**

```bash
cd /Users/zarabotaet/wtt && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && npx vitest run lib/model && npx tsc --noEmit
```

Ожидается: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/zarabotaet/wtt && git add lib/model/poll-mode.ts lib/model/poll-mode.test.ts && git commit -m "$(cat <<'EOF'
Add poll plan for live and upcoming tournaments

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)" && git push
```

---

### Task 7: Effector-модель

**Files:**
- Modify: `package.json`, `package-lock.json` (через npm)
- Create: `lib/model/event-feed.ts`, `lib/model/event-feed.test.ts`

**Interfaces:**
- Consumes:
  - `idbGet`, `idbSet` (`lib/client-cache.ts`);
  - `Entry`, `entryKey`, `toEntry`, `validEntry` (Task 5);
  - `mergeEntry` (Task 5);
  - `pollPlan`, `needsFetch`, `LIVE_POLL_MS` (Task 6);
  - `EventEnvelope` (Task 1).
- Produces (всё экспортируется из `lib/model/event-feed.ts`):
  - события: `appStarted()`, `eventOpened({id: string; pushUrl: boolean})`, `refreshClicked()`, `eventHovered(id: string)`, `visibilityChanged(visible: boolean)`, `pollTicked(token: number)`;
  - эффекты: `idbReadFx({id, maxAgeMs}) → Entry | null`, `idbWriteFx(entry)`, `fetchEventFx(id) → EventEnvelope | null`, `pushUrlFx(id)`, `navigateFx(id)`, `scheduleTickFx({delayMs, token})`;
  - сторы: `$entries: Record<string, Entry>`, `$currentId: string`, `$current: Entry | null`, `$isFetching: boolean`, `$lastError: string | null`, `$visible: boolean`;
  - константы: `STALE_MS = 15_000`, `PREFETCH_MAX_AGE_MS = 60_000`.

- [ ] **Step 1: Установить зависимости**

```bash
cd /Users/zarabotaet/wtt && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && npm i effector@^23 effector-react@^23 && node -e "console.log(require('effector/package.json').version, require('effector-react/package.json').version)"
```

Ожидается: две версии `23.x`.

- [ ] **Step 2: Падающие тесты**

`lib/model/event-feed.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { allSettled, fork, scopeBind } from 'effector';
import type { EventEnvelope, Match } from '@/lib/types';
import { SCHEMA_VERSION, type Entry } from './entry';
import { LIVE_POLL_MS } from './poll-mode';
import {
  $current, $currentId, $entries, $isFetching, $lastError,
  appStarted, eventHovered, eventOpened, fetchEventFx, idbReadFx, idbWriteFx,
  navigateFx, pollTicked, pushUrlFx, refreshClicked, scheduleTickFx, visibilityChanged,
} from './event-feed';

const NOW = new Date(2026, 8, 20, 12, 0, 0).getTime();
const MIN = 60_000;

function localIso(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function match(normCode: string, overrides: Partial<Match> = {}): Match {
  return {
    code: normCode, normCode, startDate: localIso(NOW - 60 * MIN), endDate: '',
    status: 'done', round: 'R', subEvent: 'Singles', table: 'T1', venue: 'V',
    players: [{ name: 'A', seed: null }, { name: 'B', seed: null }],
    gameScores: [[11, 11, 11], [5, 5, 5]], winnerIdx: 0, isTbd: false,
    ...overrides,
  };
}

const LIVE = match('LIVE', { status: 'live', gameScores: null, winnerIdx: null });

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    eventId: 'E1', matches: [match('A')], tier: 'live',
    generatedAt: NOW - MIN, fetchedAt: NOW - MIN, v: SCHEMA_VERSION,
    ...overrides,
  };
}

function envelope(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return { eventId: 'E1', matches: [match('A')], tier: 'live', generatedAt: NOW, ...overrides };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

interface SetupOptions {
  currentId?: string;
  entries?: Record<string, Entry>;
  idb?: Record<string, Entry>;
  fetchImpl?: (id: string) => Promise<EventEnvelope | null>;
}

function setup(opts: SetupOptions = {}) {
  const calls = {
    fetch: [] as string[],
    idbRead: [] as string[],
    idbWrite: [] as Entry[],
    push: [] as string[],
    navigate: [] as string[],
    ticks: [] as { delayMs: number; token: number }[],
  };
  const fetchImpl = opts.fetchImpl ?? (async (id: string) => envelope({ eventId: id }));
  const scope = fork({
    values: [
      [$currentId, opts.currentId ?? 'E1'],
      [$entries, opts.entries ?? {}],
    ],
    handlers: [
      [idbReadFx, async ({ id }: { id: string; maxAgeMs: number }) => { calls.idbRead.push(id); return opts.idb?.[id] ?? null; }],
      [idbWriteFx, async (e: Entry) => { calls.idbWrite.push(e); }],
      [fetchEventFx, async (id: string) => { calls.fetch.push(id); return fetchImpl(id); }],
      [pushUrlFx, (id: string) => { calls.push.push(id); }],
      [navigateFx, (id: string) => { calls.navigate.push(id); }],
      [scheduleTickFx, (p: { delayMs: number; token: number }) => { calls.ticks.push(p); }],
    ],
  });
  const lastTick = () => calls.ticks[calls.ticks.length - 1];
  return { scope, calls, lastTick };
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('start', () => {
  it('never touches the network or schedules polling for a final tournament', async () => {
    const { scope, calls } = setup({ entries: { E1: entry({ tier: 'final', fetchedAt: 0 }) } });
    await allSettled(appStarted, { scope });
    expect(calls.fetch).toEqual([]);
    expect(calls.ticks).toEqual([]);
  });

  it('persists the server-rendered snapshot to IndexedDB', async () => {
    const { scope, calls } = setup({ entries: { E1: entry({ tier: 'final' }) } });
    await allSettled(appStarted, { scope });
    expect(calls.idbRead).toEqual(['E1']);
    expect(calls.idbWrite.map((e) => e.eventId)).toContain('E1');
  });

  it('refetches a stale live snapshot and schedules a 30 s live poll', async () => {
    const { scope, calls, lastTick } = setup({
      entries: { E1: entry({ matches: [LIVE], fetchedAt: NOW - MIN }) },
      fetchImpl: async (id) => envelope({ eventId: id, matches: [LIVE] }),
    });
    await allSettled(appStarted, { scope });
    expect(calls.fetch).toEqual(['E1']);
    expect(scope.getState($current)?.fetchedAt).toBe(NOW);
    expect(lastTick()?.delayMs).toBe(LIVE_POLL_MS);
  });

  it('does not refetch a snapshot younger than 15 s', async () => {
    const { scope, calls, lastTick } = setup({ entries: { E1: entry({ matches: [LIVE], fetchedAt: NOW - 5_000 }) } });
    await allSettled(appStarted, { scope });
    expect(calls.fetch).toEqual([]);
    expect(lastTick()?.delayMs).toBe(LIVE_POLL_MS);
  });

  it('prefers a newer IndexedDB snapshot over an older server-rendered one', async () => {
    const newer = entry({ generatedAt: NOW - 2_000, fetchedAt: NOW - 2_000, matches: [match('A'), match('B')] });
    const { scope } = setup({ entries: { E1: entry({ generatedAt: NOW - 10 * MIN, fetchedAt: NOW - 10 * MIN }) }, idb: { E1: newer } });
    await allSettled(appStarted, { scope });
    expect(scope.getState($current)?.matches.map((m) => m.normCode).sort()).toEqual(['A', 'B']);
  });

  it('keeps newer data when the network returns an older (stale CDN) snapshot', async () => {
    const { scope } = setup({
      entries: { E1: entry({ generatedAt: NOW - 20_000, fetchedAt: NOW - 20_000, matches: [match('A')] }) },
      fetchImpl: async () => envelope({ generatedAt: NOW - 50_000, matches: [match('A', { status: 'live', gameScores: null, winnerIdx: null })] }),
    });
    await allSettled(appStarted, { scope });
    const current = scope.getState($current);
    expect(current?.matches[0].status).toBe('done');
    expect(current?.generatedAt).toBe(NOW - 20_000);
    expect(current?.fetchedAt).toBe(NOW);
  });
});

describe('polling', () => {
  it('waits for the nearest scheduled match when nothing is live', async () => {
    const soon = match('S', { status: 'scheduled', gameScores: null, winnerIdx: null, startDate: localIso(NOW + 10 * MIN) });
    const { scope, lastTick } = setup({ entries: { E1: entry({ matches: [soon], fetchedAt: NOW }) } });
    await allSettled(appStarted, { scope });
    expect(lastTick()?.delayMs).toBe(10 * MIN);
  });

  it('ignores an outdated tick and fetches on the current one', async () => {
    const { scope, calls, lastTick } = setup({ entries: { E1: entry({ matches: [LIVE], fetchedAt: NOW }) } });
    await allSettled(appStarted, { scope });
    const { token } = lastTick()!;
    await allSettled(pollTicked, { scope, params: token - 1 });
    expect(calls.fetch).toEqual([]);
    await allSettled(pollTicked, { scope, params: token });
    expect(calls.fetch).toEqual(['E1']);
  });

  it('stops polling in a hidden tab and catches up when it becomes visible', async () => {
    const { scope, calls, lastTick } = setup({ entries: { E1: entry({ matches: [LIVE], fetchedAt: NOW }) } });
    await allSettled(appStarted, { scope });
    const { token } = lastTick()!;
    const ticksBefore = calls.ticks.length;
    await allSettled(visibilityChanged, { scope, params: false });
    expect(calls.ticks.length).toBe(ticksBefore);
    await allSettled(pollTicked, { scope, params: token });
    expect(calls.fetch).toEqual([]);

    vi.mocked(Date.now).mockReturnValue(NOW + MIN);
    await allSettled(visibilityChanged, { scope, params: true });
    expect(calls.fetch).toEqual(['E1']);
  });
});

describe('switching tournaments', () => {
  it('opens a tournament already in memory without IndexedDB or network', async () => {
    const { scope, calls } = setup({ entries: { E1: entry({ fetchedAt: NOW }), E2: entry({ eventId: 'E2', tier: 'final' }) } });
    await allSettled(eventOpened, { scope, params: { id: 'E2', pushUrl: true } });
    expect(scope.getState($currentId)).toBe('E2');
    expect(scope.getState($current)?.eventId).toBe('E2');
    expect(calls.push).toEqual(['E2']);
    expect(calls.idbRead).toEqual([]);
    expect(calls.fetch).toEqual([]);
  });

  it('does not push a URL when opened from browser history', async () => {
    const { scope, calls } = setup({ entries: { E2: entry({ eventId: 'E2', tier: 'final' }) } });
    await allSettled(eventOpened, { scope, params: { id: 'E2', pushUrl: false } });
    expect(calls.push).toEqual([]);
  });

  it('shows the IndexedDB snapshot before the background refresh finishes', async () => {
    const pending = deferred<EventEnvelope | null>();
    const cached = entry({ eventId: 'E2', fetchedAt: NOW - 2 * MIN });
    const { scope, calls } = setup({ idb: { E2: cached }, fetchImpl: () => pending.promise });
    const settled = allSettled(eventOpened, { scope, params: { id: 'E2', pushUrl: true } });
    await vi.waitFor(() => expect(calls.fetch).toEqual(['E2']));
    expect(scope.getState($current)?.fetchedAt).toBe(cached.fetchedAt);
    expect(scope.getState($isFetching)).toBe(true);
    pending.resolve(envelope({ eventId: 'E2' }));
    await settled;
    expect(scope.getState($current)?.fetchedAt).toBe(NOW);
    expect(scope.getState($isFetching)).toBe(false);
  });

  it('fetches a tournament that is in no cache', async () => {
    const { scope, calls } = setup();
    await allSettled(eventOpened, { scope, params: { id: 'E2', pushUrl: true } });
    expect(calls.idbRead).toEqual(['E2']);
    expect(calls.fetch).toEqual(['E2']);
    expect(scope.getState($current)?.eventId).toBe('E2');
  });

  it('falls back to a full page load when an uncached tournament fails', async () => {
    const { scope, calls } = setup({ fetchImpl: async () => { throw new Error('HTTP 502'); } });
    await allSettled(eventOpened, { scope, params: { id: 'E2', pushUrl: true } });
    expect(calls.navigate).toEqual(['E2']);
  });

  it('falls back to a full page load for an uncached 404', async () => {
    const { scope, calls } = setup({ fetchImpl: async () => null });
    await allSettled(eventOpened, { scope, params: { id: 'E2', pushUrl: true } });
    expect(calls.navigate).toEqual(['E2']);
  });

  it('does not navigate away when a tournament the user already left fails', async () => {
    const pending = deferred<EventEnvelope | null>();
    const { scope, calls } = setup({
      entries: { E1: entry({ fetchedAt: NOW }), E3: entry({ eventId: 'E3', tier: 'final' }) },
      fetchImpl: () => pending.promise,
    });
    const settled = allSettled(eventOpened, { scope, params: { id: 'E2', pushUrl: true } });
    await vi.waitFor(() => expect(calls.fetch).toEqual(['E2']));
    scopeBind(eventOpened, { scope })({ id: 'E3', pushUrl: true });
    pending.reject(new Error('HTTP 502'));
    await settled;
    await allSettled(scope);
    expect(calls.navigate).toEqual([]);
    expect(scope.getState($currentId)).toBe('E3');
    expect(scope.getState($lastError)).toBeNull();
  });
});

describe('refresh and errors', () => {
  it('keeps cached data and reports the error when a refresh fails', async () => {
    const cached = entry({ fetchedAt: NOW - MIN });
    const { scope, calls } = setup({ entries: { E1: cached }, fetchImpl: async () => { throw new Error('HTTP 502'); } });
    await allSettled(appStarted, { scope });
    expect(scope.getState($lastError)).toBe('HTTP 502');
    expect(scope.getState($current)?.matches).toEqual(cached.matches);
    expect(calls.navigate).toEqual([]);
  });

  it('clears the error after a successful refresh', async () => {
    let fail = true;
    const { scope } = setup({
      entries: { E1: entry({ fetchedAt: NOW - MIN }) },
      fetchImpl: async (id) => { if (fail) throw new Error('HTTP 502'); return envelope({ eventId: id }); },
    });
    await allSettled(appStarted, { scope });
    fail = false;
    await allSettled(refreshClicked, { scope });
    expect(scope.getState($lastError)).toBeNull();
  });

  it('sends a single request for repeated refresh clicks', async () => {
    const { scope, calls } = setup({ entries: { E1: entry({ fetchedAt: NOW }) } });
    const refresh = scopeBind(refreshClicked, { scope });
    refresh();
    refresh();
    await allSettled(scope);
    expect(calls.fetch).toEqual(['E1']);
  });
});

describe('hover prefetch', () => {
  it('prefetches a hovered tournament without switching to it', async () => {
    const { scope, calls } = setup({ entries: { E1: entry({ fetchedAt: NOW }) } });
    await allSettled(eventHovered, { scope, params: 'E2' });
    expect(calls.fetch).toEqual(['E2']);
    expect(scope.getState($currentId)).toBe('E1');
    expect(scope.getState($entries).E2?.eventId).toBe('E2');
  });

  it('skips a tournament fetched less than a minute ago', async () => {
    const { scope, calls } = setup({ entries: { E1: entry({ fetchedAt: NOW }), E2: entry({ eventId: 'E2', fetchedAt: NOW - 30_000 }) } });
    await allSettled(eventHovered, { scope, params: 'E2' });
    expect(calls.fetch).toEqual([]);
  });

  it('ignores hovering the tournament already shown', async () => {
    const { scope, calls } = setup({ entries: { E1: entry({ fetchedAt: NOW - 5 * MIN }) } });
    await allSettled(eventHovered, { scope, params: 'E1' });
    expect(calls.fetch).toEqual([]);
  });
});

describe('scheduleTickFx default handler', () => {
  it('delivers the tick to the same scope after the delay', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const fetched: string[] = [];
    const scope = fork({
      values: [
        [$currentId, 'E1'],
        [$entries, { E1: entry({ matches: [LIVE], fetchedAt: NOW - 1_000 }) }],
      ],
      handlers: [
        [idbReadFx, async () => null],
        [idbWriteFx, async () => {}],
        [fetchEventFx, async (id: string) => { fetched.push(id); return envelope({ eventId: id, matches: [LIVE] }); }],
      ],
    });
    await allSettled(appStarted, { scope });
    expect(fetched).toEqual([]);
    vi.advanceTimersByTime(LIVE_POLL_MS);
    await allSettled(scope);
    expect(fetched).toEqual(['E1']);
  });
});
```

- [ ] **Step 3: Убедиться, что падают**

```bash
cd /Users/zarabotaet/wtt && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && npx vitest run lib/model/event-feed.test.ts
```

Ожидается: FAIL, `Failed to resolve import "./event-feed"`.

- [ ] **Step 4: Реализация `lib/model/event-feed.ts`**

```ts
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
```

- [ ] **Step 5: Тесты проходят**

```bash
cd /Users/zarabotaet/wtt && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && npx vitest run lib/model && npx tsc --noEmit
```

Ожидается: PASS.

Если `tsc` ругается на смешанные типы в `clock: [appStarted, $current, $visible, currentFetchSettled]`, выдели отдельное событие:

```ts
const replanRequested = createEvent();
sample({ clock: [appStarted, currentFetchSettled], fn: () => undefined, target: replanRequested });
```

Сторы подключи через `sample({ clock: $current.updates, fn: () => undefined, target: replanRequested })` и так же для `$visible.updates`. Потом используй `clock: replanRequested` в `planned`.

Если нестабилен тест «does not navigate away…», проверь, что `switched` меняет `$currentId` до того, как `fetchFailed` для E2 будет обработан. Тест именно это и проверяет. Не ослабляй его.

- [ ] **Step 6: Commit**

```bash
cd /Users/zarabotaet/wtt && git add package.json package-lock.json lib/model/event-feed.ts lib/model/event-feed.test.ts && git commit -m "$(cat <<'EOF'
Add Effector event feed model with IndexedDB-first loading

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)" && git push
```

---

### Task 8: UI на модели

**Files:**
- Create: `components/FeedProvider.tsx`, `components/UpdatedAgo.tsx`, `components/UpdatedAgo.test.tsx`, `components/EventCombobox.test.tsx`
- Modify (целиком): `components/MatchFeed.tsx`, `components/MatchFeed.test.tsx`
- Modify: `components/EventCombobox.tsx`, `app/events/[eventId]/page.tsx`, `app/globals.css`, `eslint.config.mjs`
- Delete: `lib/hooks/useLiveScoreUpdater.ts`, `lib/hooks/useLiveScoreUpdater.test.tsx`, `app/api/events/[eventId]/matches/route.ts`, `app/api/events/[eventId]/live/route.ts`

**Interfaces:**
- Consumes: всё из `lib/model/event-feed.ts` (Task 7), `toEntry` (Task 5), `EventEnvelope`/`Tier` (Task 1).
- Produces:
  - `MatchFeed({ envelope: EventEnvelope; events: NormalizedEvent[] })`;
  - `FeedProvider({ envelope, children })`;
  - `UpdatedAgo({ generatedAt: number; tier: Tier; error: string | null })`, `formatAgo(ms: number): string`;
  - `EventCombobox` получает новый необязательный проп `onHover?: (eventId: string) => void`.

- [ ] **Step 1: Падающие тесты**

`components/UpdatedAgo.test.tsx`:

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { formatAgo, UpdatedAgo } from './UpdatedAgo';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('formatAgo', () => {
  it('formats seconds, minutes and hours', () => {
    expect(formatAgo(12_000)).toBe('12s ago');
    expect(formatAgo(5 * 60_000 + 10_000)).toBe('5 min ago');
    expect(formatAgo(2 * 3_600_000 + 60_000)).toBe('2 h ago');
  });

  it('never shows a negative age (clock skew)', () => {
    expect(formatAgo(-5_000)).toBe('0s ago');
  });
});

describe('UpdatedAgo', () => {
  it('shows how old the snapshot is', () => {
    vi.spyOn(Date, 'now').mockReturnValue(100_000);
    render(<UpdatedAgo generatedAt={88_000} tier="live" error={null} />);
    expect(screen.getByText('Updated 12s ago')).toBeInTheDocument();
  });

  it('shows nothing for a final tournament', () => {
    const { container } = render(<UpdatedAgo generatedAt={0} tier="final" error={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('reports a failed update', () => {
    render(<UpdatedAgo generatedAt={0} tier="live" error="HTTP 502" />);
    expect(screen.getByText('Update failed')).toBeInTheDocument();
  });
});
```

`components/EventCombobox.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventCombobox } from './EventCombobox';
import type { NormalizedEvent } from '@/lib/types';

const events: NormalizedEvent[] = [
  { eventId: '1', eventName: 'Event One', startDateTime: '2026-01-01T00:00:00', endDateTime: '2026-01-02T00:00:00', status: 'past' },
  { eventId: '2', eventName: 'Event Two', startDateTime: '2026-02-01T00:00:00', endDateTime: '2026-02-02T00:00:00', status: 'past' },
];

async function openList() {
  const user = userEvent.setup();
  const input = screen.getByLabelText('Select event');
  await user.click(input);
  await user.clear(input);
}

describe('EventCombobox hover', () => {
  it('reports an option the pointer rests on, once', async () => {
    const onHover = vi.fn();
    render(<EventCombobox events={events} currentEventId="1" onSelect={vi.fn()} onHover={onHover} />);
    await openList();
    fireEvent.mouseEnter(screen.getByText('Event Two'));
    expect(onHover).not.toHaveBeenCalled();
    await waitFor(() => expect(onHover).toHaveBeenCalledWith('2'));
    expect(onHover).toHaveBeenCalledTimes(1);
  });

  it('ignores an option the pointer only passes over', async () => {
    const onHover = vi.fn();
    render(<EventCombobox events={events} currentEventId="1" onSelect={vi.fn()} onHover={onHover} />);
    await openList();
    const option = screen.getByText('Event Two');
    fireEvent.mouseEnter(option);
    fireEvent.mouseLeave(option);
    await new Promise((r) => setTimeout(r, 250));
    expect(onHover).not.toHaveBeenCalled();
  });
});
```

`components/MatchFeed.test.tsx` целиком:

```tsx
// components/MatchFeed.test.tsx
// jsdom has no indexedDB: lib/client-cache.ts swallows that and returns
// null, so these tests also cover "IndexedDB unavailable" (private mode).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MatchFeed } from './MatchFeed';
import type { EventEnvelope, Match, NormalizedEvent } from '@/lib/types';

function match(overrides: Partial<Match>): Match {
  return {
    code: 'X', normCode: 'X', startDate: '2026-09-10T11:00:00', endDate: '2026-09-10T12:00:00',
    status: 'scheduled', round: 'R', subEvent: 'Singles', table: 'Table 1', venue: 'V',
    players: [{ name: 'A', seed: null }, { name: 'B', seed: null }],
    gameScores: null, winnerIdx: null, isTbd: false,
    ...overrides,
  };
}

function envelope(overrides: Partial<EventEnvelope>): EventEnvelope {
  return { eventId: '1', matches: [], tier: 'final', generatedAt: Date.now(), ...overrides };
}

function okResponse(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
}

const flush = () => act(() => new Promise((r) => setTimeout(r, 20)));

beforeEach(() => {
  // ThemeToggle (in the header) calls window.matchMedia on mount; jsdom
  // doesn't implement it.
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('MatchFeed', () => {
  it('groups matches into Upcoming/Live/Completed sections without refetching a fresh snapshot', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const env = envelope({
      tier: 'live',
      matches: [match({ normCode: 'A', status: 'scheduled' }), match({ normCode: 'B', status: 'done' })],
    });
    render(<MatchFeed envelope={env} events={[]} />);
    expect(screen.getByText('Upcoming')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the empty-state message when there are no matches at all', async () => {
    vi.stubGlobal('fetch', vi.fn());
    render(<MatchFeed envelope={envelope({ tier: 'future' })} events={[]} />);
    expect(screen.getByText('No matches for this event')).toBeInTheDocument();
    await flush();
  });

  it('switches tournaments client-side, then back via browser history without a request', async () => {
    const events: NormalizedEvent[] = [
      { eventId: '1', eventName: 'Event One', startDateTime: '2026-01-01T00:00:00', endDateTime: '2026-01-02T00:00:00', status: 'past' },
      { eventId: '2', eventName: 'Event Two', startDateTime: '2026-02-01T00:00:00', endDateTime: '2026-02-02T00:00:00', status: 'past' },
    ];
    const eventOne = envelope({
      eventId: '1',
      matches: [match({ normCode: 'A1', status: 'done', players: [{ name: 'Alice One', seed: null }, { name: 'Ann One', seed: null }] })],
    });
    const eventTwo = envelope({
      eventId: '2',
      matches: [match({ normCode: 'B1', status: 'done', players: [{ name: 'Bob Two', seed: null }, { name: 'Carl Two', seed: null }] })],
    });
    const fetchMock = vi.fn(() => okResponse(eventTwo));
    vi.stubGlobal('fetch', fetchMock);
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    const user = userEvent.setup();

    render(<MatchFeed envelope={eventOne} events={events} />);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();

    const input = screen.getByLabelText('Select event');
    await user.click(input);
    await user.clear(input);
    await user.type(input, 'Two');
    await user.click(screen.getByText('Event Two'));

    expect(await screen.findByText('Bob Two')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Event Two')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/events/2');
    expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/events/2');
    await waitFor(() => expect(document.title).toBe('Event Two — Matches & Results'));

    window.history.replaceState(null, '', '/events/1');
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(await screen.findByText('Alice One')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(pushStateSpy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Убедиться, что падают**

```bash
cd /Users/zarabotaet/wtt && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && npx vitest run components
```

Ожидается: FAIL. Нет `./UpdatedAgo`, `onHover` не вызывается, `MatchFeed` не принимает `envelope`.

- [ ] **Step 3: `UpdatedAgo` и `FeedProvider`**

`components/UpdatedAgo.tsx`:

```tsx
'use client';
import { useSyncExternalStore } from 'react';
import type { Tier } from '@/lib/types';

function subscribe(onTick: () => void) {
  const t = setInterval(onTick, 1000);
  return () => clearInterval(t);
}
const getNowSec = () => Math.floor(Date.now() / 1000);
// null on the server and during hydration: the age depends on the viewer's
// clock, so it only appears after mount and never causes a mismatch.
const getServerNowSec = () => null;

export function formatAgo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)} h ago`;
}

// Age of the data itself (generatedAt, when the server built it), not of
// the request — a CDN copy can be older than the moment we fetched it.
export function UpdatedAgo({ generatedAt, tier, error }: { generatedAt: number; tier: Tier; error: string | null }) {
  const nowSec = useSyncExternalStore<number | null>(subscribe, getNowSec, getServerNowSec);
  if (error) return <span className="updated-ago error">Update failed</span>;
  if (tier === 'final' || nowSec === null) return null;
  return <span className="updated-ago">Updated {formatAgo(nowSec * 1000 - generatedAt)}</span>;
}
```

`components/FeedProvider.tsx`:

```tsx
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
```

- [ ] **Step 4: `MatchFeed` целиком**

`components/MatchFeed.tsx`:

```tsx
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
```

- [ ] **Step 5: `EventCombobox` — `onHover`**

В `components/EventCombobox.tsx`:

1. Импорт: `import { useEffect, useMemo, useRef, useState } from 'react';`.
2. Сигнатура: добавь `onHover` в деструктуризацию и в тип.

```tsx
export function EventCombobox({
  events,
  currentEventId,
  onSelect,
  onHover,
}: {
  events: NormalizedEvent[];
  currentEventId?: string;
  // Client-side switch (fetch + history.pushState), NOT next/navigation's
  // router.push — that would make Next.js re-run the whole page
  // server-side on every tournament change, defeating the point of this
  // being an SPA-like switch. See components/MatchFeed.tsx.
  onSelect: (eventId: string) => void;
  // Background prefetch hint; fired only once the pointer rests on an
  // option for 150 ms, so sweeping across the list costs nothing.
  onHover?: (eventId: string) => void;
}) {
```

3. Сразу после `const inputRef = useRef<HTMLInputElement>(null);` добавь:

```tsx
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function hoverEnd() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }

  function hoverStart(eventId: string) {
    if (!onHover) return;
    hoverEnd();
    hoverTimer.current = setTimeout(() => onHover(eventId), 150);
  }

  useEffect(() => hoverEnd, []);
```

4. У `<div key={e.eventId} className=… onMouseDown={() => choose(e)}>` добавь два атрибута рядом с `onMouseDown`:

```tsx
                onMouseEnter={() => hoverStart(String(e.eventId))}
                onMouseLeave={hoverEnd}
```

- [ ] **Step 6: Страница, стили, линт, удаления**

В `app/events/[eventId]/page.tsx` замени строку с `MatchFeed` на:

```tsx
      <MatchFeed envelope={envelope} events={events} />
```

В конец `app/globals.css`:

```css
.updated-ago{margin-left:auto;}
.updated-ago.error{color:var(--accent);}
```

`eslint.config.mjs`: после объекта с правилами `warn` добавь в массив `config` ещё один элемент. Комментарий над правилами `warn` обнови: теперь `warn` остаётся только ради ThemeToggle/ZoomSlider.

```js
  {
    files: ['components/MatchFeed.tsx', 'components/FeedProvider.tsx', 'components/UpdatedAgo.tsx'],
    rules: {
      'react-hooks/refs': 'error',
      'react-hooks/set-state-in-effect': 'error',
    },
  },
```

Удаления:

```bash
cd /Users/zarabotaet/wtt && git rm lib/hooks/useLiveScoreUpdater.ts lib/hooks/useLiveScoreUpdater.test.tsx "app/api/events/[eventId]/matches/route.ts" "app/api/events/[eventId]/live/route.ts" && (grep -rn "useLiveScoreUpdater\|/matches\`\|/live\`\|initialMatches" app components lib || echo "no leftovers")
```

Ожидается: `no leftovers`.

- [ ] **Step 7: Всё зелёное**

```bash
cd /Users/zarabotaet/wtt && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && npm test && npx tsc --noEmit && npm run lint && npm run build
```

Ожидается:
- тесты PASS;
- lint без ошибок (warnings только в ThemeToggle/ZoomSlider);
- сборка успешна.

- [ ] **Step 8: Commit**

```bash
cd /Users/zarabotaet/wtt && git add components/FeedProvider.tsx components/UpdatedAgo.tsx components/UpdatedAgo.test.tsx components/MatchFeed.tsx components/MatchFeed.test.tsx components/EventCombobox.tsx components/EventCombobox.test.tsx "app/events/[eventId]/page.tsx" app/globals.css eslint.config.mjs && git commit -m "$(cat <<'EOF'
Drive the match feed from the Effector cache model

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)" && git push
```

Удалённые через `git rm` файлы уже в индексе и войдут в этот коммит.

---

### Task 9: Ручная проверка и заметки

**Files:**
- Modify: `docs/KNOWN_ISSUES.md`

**Interfaces:**
- Consumes: весь результат задач 1–8.
- Produces: подтверждение критериев §1 спецификации и заметки в документации.

- [ ] **Step 1: Прод-сборка локально**

```bash
cd /Users/zarabotaet/wtt && source ~/.nvm/nvm.sh && nvm use 24 >/dev/null && npm run build && (npm start > /tmp/wtt-start.log 2>&1 &) && sleep 5 && curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/events
```

Ожидается: `200`.

- [ ] **Step 2: Заголовки по tier**

Первый запрос к некэшированному турниру может занять несколько секунд.

```bash
cd /Users/zarabotaet/wtt && for id in $(curl -s localhost:3000/events | grep -o '/events/[0-9]\+' | sort -u | head -8 | cut -d/ -f3); do printf "%s " "$id"; curl -s -o /dev/null -D - "localhost:3000/api/events/$id" | grep -i '^cache-control' || echo "(no header)"; done
curl -s -o /dev/null -D - localhost:3000/api/events/999999999 | grep -iE '^HTTP|^cache-control'
```

Ожидается:
- у прошедших турниров `immutable`;
- у идущих `s-maxage=15`;
- у будущих `s-maxage=3600`;
- для несуществующего id — `404` и `no-store`.

Если Next подменил `Cache-Control` (например, на `private, no-cache`), это баг задачи 4: остановись и опиши, не обходи.

- [ ] **Step 3: Браузер (критерии 1–5 спецификации)**

Открой `http://localhost:3000` в браузере, DevTools → Network → фильтр Fetch/XHR.

1. Открой прошедший турнир и перезагрузи страницу: запросов к `/api/events/*` нет.
2. Переключись на другой прошедший турнир: один запрос. Переключись обратно: запросов нет, отрисовка мгновенная. Снова на второй: запросов нет.
3. Идущий турнир: в строке статуса «Updated Ns ago», счётчик растёт. Если есть live-матч, запрос идёт раз в ~30 с. Если нет, запросов нет, пока не подойдёт время ближайшего матча (не дольше 15 мин).
4. Переключись на вкладку и вернись через 20+ с: для идущего турнира один запрос сразу.
5. Наведи курсор на турнир в выпадающем списке на ~0.2 с: фоновый запрос. Переключение на него потом без спиннера.
6. Посмотри `view-source:` первой загрузки `/events/<id>`: в HTML есть имена игроков и счёт (SEO).
7. `/events/999999999` показывает not-found (допустимо со статусом 200 и `noindex`, см. отклонение 12).

Потом останови сервер:

```bash
pkill -f "next start" || true
```

- [ ] **Step 4: Заметки**

В `docs/KNOWN_ISSUES.md` в конец раздела «## Актуально прямо сейчас» (перед строкой `## Разрешено в этой сессии`) добавь:

```markdown
- **Многослойный кэш (2026-09).** Сервер: `getEventData` под
  `'use cache: remote'` с `cacheLife` по tier; клиент: Effector-модель +
  IndexedDB (`lib/model/`). Помнить:
  - кэш `'use cache: remote'` не переживает деплой — каждый финальный
    турнир один раз пересчитывается после деплоя;
  - если в браузерах застрял ошибочно «финальный» снимок — поднять
    `SCHEMA_VERSION` в `lib/model/entry.ts`;
  - несуществующий `/events/<id>` может отдавать soft-404 (200 + noindex),
    потому что `notFound()` срабатывает внутри `<Suspense>`;
  - таймер ожидания матча считает `startDate` в поясе зрителя (время
    площадки без смещения), поэтому ограничен 15 минутами.
```

- [ ] **Step 5: Commit**

```bash
cd /Users/zarabotaet/wtt && git add docs/KNOWN_ISSUES.md && git commit -m "$(cat <<'EOF'
Document layered cache operational notes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
)" && git push
```

**Не вливать в `main`.** Сообщи пользователю результаты Step 2–3, в том числе всё, что не совпало с ожиданиями.
