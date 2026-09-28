# Многослойный кэш: мгновенные переходы как в прототипе

Дата: 2026-09-27 · Статус: на ревью · База: ветка `upgrade-next16` (Next 16.3, React 19.3, Node 24)

## 1. Цель и критерии успеха

Next.js-версия должна ощущаться так же мгновенно, как `prototype/wtt-matches.html`:
с сервера приходит только первая загрузка, дальнейшие переходы работают из
кэша, сервер кэширует турнир с учётом его статуса.

Критерии (проверяемые):

1. Повторное открытие **финального** турнира — 0 сетевых запросов к нашему API.
2. Переключение на турнир, который есть в кэше браузера, — отрисовка < 50 мс, без спиннера.
3. **Идущий** турнир из кэша показывается целиком сразу (с плашкой «обновлено N назад»),
   свежие данные подтягиваются фоном и обновляют карточки на месте.
4. Нет live-матчей — нет периодического опроса.
5. SEO не деградирует: первая загрузка `/events/[id]` отдаёт полный HTML с игроками и счётом.

Не цели: Service Worker, офлайн-режим первой страницы, дельта-протокол,
мультиязычность, TanStack Query.

## 2. Решения, принятые на брейншторме

| Вопрос | Решение |
|---|---|
| Серверный кэш | Next 16 Cache Components: `'use cache: remote'` + `cacheLife` по tier |
| «Финальный» турнир | прошло > 24 ч после конца дня `endDate` **и** все матчи `done` |
| Клиентское состояние | Effector (`effector`, `effector-react`, `patronum`), модель только на клиенте (вариант C2, без `@effector/next` и SWC-плагина) |
| Эндпоинты | один `GET /api/events/[eventId]` вместо `/matches` + `/live` |
| Нет live-матчей | один таймер ко времени ближайшего матча в расписании, далее обычный опрос |
| Устаревший снимок идущего турнира | показать весь снимок как есть + «обновлено N назад», обновить на месте |
| Кэш в браузере | бессрочно, IndexedDB, инвалидация сменой `SCHEMA_VERSION` |
| Хостинг | Vercel |

## 3. Архитектура

```
Браузер (Effector-модель)        Vercel CDN                    Next-сервер
─────────────────────────        ──────────                    ───────────
$entries ⇄ IndexedDB        →    Cache-Control по tier    →    getEventData(id)
  final: сеть не трогаем          final: immutable, 1 год        'use cache: remote'
  live:  показать + фоном         live:  s-maxage=15, SWR 60     cacheLife по tier
  future: показать + фоном        future: s-maxage=3600, SWR 1д    └─ getEventMatches (как есть)
                                                                     └─ fetchMatchCard:
                                                                        done → 'use cache: remote', max
                                                                        иначе → свежий fetch
```

## 4. Серверный слой

### 4.1 `lib/event-data.ts` — единая точка данных

```ts
export type Tier = 'final' | 'live' | 'future';
export interface EventEnvelope {
  eventId: string;
  matches: Match[];
  tier: Tier;
  generatedAt: number; // ms, время сборки конверта на сервере
}
export async function getEventData(eventId: string): Promise<EventEnvelope>;
export function computeTier(event: NormalizedEvent | undefined, matches: Match[], now: number): Tier; // чистая
```

- Внутри `'use cache: remote'`: список турниров (для дат) + полный проход
  `getEventMatches(eventId)`. Логика слияния из прототипа **не меняется**
  (правило CLAUDE.md).
- `computeTier`:
  - `future` — `tournamentStatus === 'future'`;
  - `final` — конец дня `endDate` (с учётом «полуночной» даты, как в
    `tournamentStatus`) + 24 ч < `now` **и** `matches.length > 0` **и** все `status === 'done'`;
  - иначе `live` (включая «дата прошла, но есть незавершённые матчи»).
  - Турнира нет в списке → всегда `live` (без даты не рискуем «навсегда»).
- `cacheLife` по tier (вызывается после получения данных):
  - `final` → `{ revalidate: Infinity, expire: Infinity }` (профиль `max`-подобный);
  - `live` → `{ revalidate: 15, expire: 86400 }`;
  - `future` → `{ revalidate: 3600, expire: 604800 }`.
- Долгий `expire` + SWR: после первого заполнения посетитель всегда получает
  готовый ответ, перегенерация идёт фоном.

### 4.2 Упразднение fast/full split

Опция `fillMissingScores` и связанный с ней «быстрый SSR + немедленный полный
опрос» удаляются: всегда полный проход, его стоимость амортизирует кэш.
Медленный полный проход платит только первый посетитель турнира после деплоя.

### 4.3 Карточки матчей (`lib/wtt-api.ts`)

Замена незакоммиченной правки на `unstable_cache`: `fetchFinalMatchCard(eventId, docCode)`
под `'use cache: remote'` + `cacheLife('max')`. Так как исключение из кэшируемой
функции не сохраняется, схема остаётся прежней: незавершённая карточка
выбрасывает `CardNotFinalError` с данными, вызывающий код их возвращает.
Параметр `revalidateSeconds` у fetch-функций остаётся для списка/расписания.

### 4.4 Потребители

- `app/events/[eventId]/page.tsx` — `await getEventData(id)`, JSON-LD как сейчас,
  конверт пропсом в клиентский `MatchFeed`. 404/403 от WTT → `notFound()`.
  Страница — часть `cacheComponents`-модели; при необходимости обернуть
  динамическую часть в `<Suspense>`.
- `app/api/events/[eventId]/route.ts` — `NextResponse.json(envelope)` с заголовком:
  - `final` → `public, max-age=31536000, immutable`
  - `live` → `public, s-maxage=15, stale-while-revalidate=60`
  - `future` → `public, s-maxage=3600, stale-while-revalidate=86400`
  - 404/403 → `{ error: 'not found' }`, 404, `no-store`.
- `app/api/events/[eventId]/matches` и `.../live` — удаляются.
- Список турниров (`/`, `/events`, `generateMetadata`) — `'use cache: remote'` + `cacheLife('hours')`.
- `next.config.mjs` — `cacheComponents: true`.

### 4.5 Ошибки

Ошибки WTT пробрасываются из кэшируемой функции и не кэшируются. При падении
фоновой перегенерации Next продолжает отдавать прежнюю запись до `expire`.

## 5. Клиентская модель (Effector)

### 5.1 Размещение

`lib/model/event-feed.ts` (модель), `lib/model/merge-entry.ts` (чистое слияние),
`lib/model/poll-mode.ts` (чистое вычисление режима), тесты рядом.
В компонентах — только `useUnit`. Scope создаётся в клиентском
`components/FeedProvider.tsx` один раз: `useState(() => fork({ values: [...] }))`
+ `<Provider value={scope}>`.

### 5.2 Состояние

```ts
interface Entry extends EventEnvelope { fetchedAt: number; v: number } // v = SCHEMA_VERSION
$entries:   Record<string, Entry>   // зеркало IndexedDB в памяти
$currentId: string
$current:   Entry | null            // combine
$isFetching: boolean                // для текущего турнира
$lastError: string | null
$visible:   boolean
```

### 5.3 События и эффекты

- События UI: `appStarted`, `eventOpened({ id, pushUrl })`, `refreshClicked`,
  `eventHovered(id)`, `visibilityChanged(boolean)`.
- Эффекты: `idbReadFx(id)`, `idbWriteFx(entry)` (поверх `lib/client-cache.ts`, ключ
  `event_<id>`), `fetchEventFx(id)` (`GET /api/events/:id`, дедуп in-flight по id),
  `pushUrlFx(id)` (`history.pushState`), `popstate` → `eventOpened({ id, pushUrl: false })`.

### 5.4 Потоки

```
appStarted → merge(ssrEntry, idbReadFx(currentId)) → $entries → idbWriteFx

eventOpened(id)
  ├─ $currentId = id; pushUrl ? pushUrlFx(id)
  ├─ есть в $entries → отрисовка сразу
  │  нет → idbReadFx(id) → $entries (если v совпадает)
  ├─ tier === 'final' → стоп
  └─ иначе fetchEventFx(id)

fetchEventFx.done → merge(old, fresh) → $entries → idbWriteFx
fetchEventFx.fail → $lastError; если в кэше ничего не было → window.location = /events/id
```

### 5.5 Правила `mergeEntry(old, fresh)` (чистая функция)

- Матч, который в `old` уже `done` со счётом, не теряет счёт и не откатывается
  статусом из-за менее полного `fresh`.
- Матчи, которых нет в `fresh`, но есть `done` в `old`, сохраняются.
- `tier: 'final'` необратим.
- `fetchedAt = now`, `generatedAt` берётся из `fresh`.
- Запись с чужим `v` считается отсутствующей.

### 5.6 Режим опроса `pollMode(entry, visible, now)` (чистая функция)

| Режим | Условие | Действие |
|---|---|---|
| `off` | `tier === 'final'` или вкладка скрыта или нет записи | ничего |
| `live` | есть матч `status === 'live'` | `interval` (patronum) 30 с → `fetchEventFx` |
| `wait` | иначе | один таймер до `min(startDate)` ближайшего `scheduled`-матча (не меньше 30 с, не больше 1 ч) → `fetchEventFx` → режим пересчитывается |

`visibilityChanged(true)` и `now - fetchedAt > 15 с` → немедленный `fetchEventFx`.

### 5.7 Предзагрузка

`eventHovered(id)` → debounce 150 мс → если записи нет ни в памяти, ни в IndexedDB,
или она не `final` и `fetchedAt` старше 60 с → фоновый `fetchEventFx(id)`.
На экран не влияет.

## 6. UI

- `MatchFeed` переписывается на `useUnit($current, $isFetching, …)`;
  `lib/hooks/useLiveScoreUpdater.ts` и его тест удаляются.
- Фильтры — локальный `useState` (UI-состояние, не в модели).
- `EventCombobox` вызывает `eventOpened` и `eventHovered`.
- Новый `components/UpdatedAgo.tsx`: «обновлено N с/мин/ч назад» от `fetchedAt`,
  собственный тик 1 с (только когда вкладка видна); при `$lastError` —
  «не удалось обновить».
- Кнопка «Обновить» → `refreshClicked`.
- После переписывания вернуть правила `react-hooks/refs` и
  `react-hooks/set-state-in-effect` в `error` для `MatchFeed`
  (ThemeToggle/ZoomSlider — вне скоупа, остаются `warn`).

## 7. Тестирование

- `computeTier`: граница 24 ч, «полуночная» `endDate`, незавершённый матч после даты,
  пустой список матчей, турнир не найден.
- `mergeEntry`: все правила 5.5.
- `pollMode`: все строки таблицы 5.6, clamp таймера 30 с / 1 ч.
- Модель: `fork({ handlers })` + `allSettled` + fake timers —
  final без сети; live-интервал стартует/останавливается; wait → один запрос → переход в live;
  скрытая вкладка останавливает опрос; кэш из IndexedDB рисуется до ответа сети;
  ошибка при наличии кэша не сбрасывает данные.
- Роут: заголовок `Cache-Control` по каждому tier, 404.
- Существующие тесты `merge-matches`, `get-event-matches`, `wtt-api`, `events` остаются зелёными
  (тест `fetchMatchCard` адаптируется к новому кэшу — мок `next/cache`).
- Ручная проверка: `next build && next start`, DevTools Network — повторный заход
  на финальный турнир без запросов; `curl -I` заголовки.

## 8. Риски

- `'use cache: remote'` на Vercel — платформенный кэш с лимитами бесплатного
  тарифа; не переживает деплой (каждый финальный турнир пересчитается один раз
  после деплоя). Локально (`next start`) работает как in-memory.
- Условный вызов `cacheLife` после `await` внутри `'use cache'` — проверить на
  первом шаге реализации. Запасной вариант: три кэшируемые обёртки по tier,
  tier определяется до вызова по дате + лёгкому признаку из расписания.
- Ошибочно «финальный» турнир навсегда закэширован в браузерах — защита:
  двойное условие (дата + все `done`) и `SCHEMA_VERSION` как аварийный сброс.
