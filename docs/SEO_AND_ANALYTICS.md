# SEO и аналитика

## SEO-чеклист для страницы турнира

- [ ] `<title>` и `<meta name="description">` через `generateMetadata` —
      включи название турнира и текущую стадию ("Round of 32", "Final")
- [ ] Canonical URL (`alternates.canonical`) — важно, если один турнир
      доступен по нескольким путям/фильтрам
- [ ] Open Graph + Twitter Card — хотя бы `og:title`/`og:description`,
      по возможности `og:image` с превью счёта топового матча
- [ ] JSON-LD структурированные данные — схема `SportsEvent` на матч:
      ```json
      {
        "@context": "https://schema.org",
        "@type": "SportsEvent",
        "name": "Men's Singles - Round of 32",
        "startDate": "2026-09-09T11:00:00",
        "competitor": [
          { "@type": "Person", "name": "WANG Yidi" },
          { "@type": "Person", "name": "Dina MESHREF" }
        ],
        "location": { "@type": "Place", "name": "Macao East Asian Games Dome" }
      }
      ```
- [ ] `sitemap.xml` (Next.js: `app/sitemap.ts`) — по одному URL на турнир,
      `lastmod` = время последнего реального изменения расписания
- [ ] `robots.txt` — разрешить индексацию страниц турниров, запретить
      служебные API-роуты (`/api/*`)
- [ ] Семантический HTML в карточке матча (не голые `<div>` — хотя бы
      `<article>`/`<time datetime="...">` для дат)
- [ ] Скорость: убедиться, что Server Component отдаёт HTML без блокировки
      на клиентский JS (Lighthouse/PageSpeed — LCP/CLS в порядке)

## Учти ограничение из-за источника данных

Данные приходят из недокументированного API WTT (см. `API_REFERENCE.md`).
Это значит:
- Нет SLA на доступность/формат — если WTT поменяют структуру ответа,
  ISR-регенерация страницы может начать падать. Стоит завести fallback:
  при ошибке обновления показывать последний успешно закэшированный
  результат (Next.js ISR это умеет из коробки — `stale-while-error`).
- Если решишь публично закрывать этот факт (что данные не официальные) —
  честная строчка в футере страницы ("неофициальный источник данных,
  не аффилирован с WTT/ITTF") снижает репутационные риски и не мешает SEO.

## Аналитика — варианты

| Вариант | Плюсы | Минусы |
|---|---|---|
| **Vercel Analytics** | Ставится в 2 строчки при деплое на Vercel, Core Web Vitals из коробки | Только если хостишься на Vercel |
| **Plausible** (облако или self-host) | Приватно (без кук/GDPR-баннера), лёгкий скрипт | Платный (облачная версия), self-host требует свой сервер |
| **Umami** (self-host, open-source) | Бесплатно, приватно, свой дашборд | Нужен свой хостинг (Postgres/MySQL + Node) |
| **Google Analytics 4** | Бесплатно, привычно, много фич | Требует cookie-consent баннер в EU, тяжелее для приватности |

Для личного проекта без юридических требований по трекингу рекомендация:
**Vercel Analytics**, если деплоишь на Vercel (проще всего подключить) —
или **Plausible**, если хочется независимости от хостинга и не нужен
cookie-баннер.

### Подключение (пример, Vercel Analytics)

```bash
npm i @vercel/analytics
```
```tsx
// app/layout.tsx
import { Analytics } from '@vercel/analytics/react';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
```

### Подключение (пример, Plausible)

```tsx
// app/layout.tsx — просто добавить скрипт в <head>
<script defer data-domain="твой-домен.com" src="https://plausible.io/js/script.js" />
```

Держи ключи/домен аналитики в `.env` (см. `.env.example` в корне архива),
не хардкодь в компонентах.
