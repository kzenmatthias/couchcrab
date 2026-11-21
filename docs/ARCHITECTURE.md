# Architecture

## Overview

One SvelteKit app serves the public site, the management tool and the API. Data lives in SQLite through Drizzle ORM. A sync script pulls uploads from the YouTube Data API and sorts them with title rules. Videos play in the YouTube IFrame Player.

```
src/
  lib/
    server/
      db/            schema.ts, client.ts, index.ts (app connection), migrations/, seed.ts
      auth/          Discord OAuth, sessions, roles
      youtube/       API client, sync, rule engine
      audit.ts       write and revert history entries
    components/      shared UI (cards, rails, POV bar, switches, dialogs)
    prefs/           who-I-watch, progress, settings (localStorage + account sync)
    styles/          design tokens and base CSS
    poster-art.ts    generated poster art
    i18n.ts          translation fallback and Intl helpers
    paraglide/       generated, do not edit
  routes/
    (site)/          home, series, creators, player, settings
    manage/          management tool (editor/admin)
    auth/            Discord login and callback
    prefs/           POST endpoint for language and theme (works without JavaScript)
  env.ts             environment variables (SvelteKit 3 `defineEnvVars`)
messages/            en.json, nl.json (UI strings)
scripts/             migrate.ts, seed.ts, sync.ts (entry points for the npm scripts)
tests/               unit/ (Vitest) and e2e/ (Playwright + axe)
```

The app runs on SvelteKit 3: the Kit config lives in `vite.config.ts` (there is no `svelte.config.js`), and app code imports `src/lib` through the `#lib/*` subpath import from `package.json` (with a `.js` extension for TypeScript modules, e.g. `#lib/i18n.js`). Route ids include the `(site)` group, so links use `resolve('/(site)/[page]', { page: 'about' })`.

The database path comes from `DATABASE_URL` (default `./data/couchcrab.db`, gitignored). `npm run db:migrate` applies the Drizzle migrations in `src/lib/server/db/migrations` (`-- --fresh` deletes the file first), `npm run db:seed` replaces all rows with fictional demo data and `npm run db:generate` writes a new migration after a schema change.

## Data model

Names are indicative; the Drizzle schema in `src/lib/server/db/schema.ts` is the source of truth. Timestamps are integer Unix seconds; most content tables also have a `created_at`.

| Table | Purpose |
| --- | --- |
| `creators` | id, slug, name, color, avatar_url, bio |
| `channels` | id, creator_id, youtube_channel_id, title, kind (`main`, `secondary`), sync_enabled, last_synced_at |
| `series` | id, slug, title, kind (`season`, `live_series`, `event`, `other`), status (`upcoming`, `ongoing`, `ended`), grouping (`week`, `session`, `none`), started_at, ended_at, poster (JSON: generated art settings or image url), parent_id (set for an Extras series) |
| `series_translations` | series_id, locale, description |
| `series_creators` | series_id, creator_id |
| `groups` | id, series_id, kind (`session`, `week`), number, title, starts_at, ends_at |
| `videos` | id, youtube_video_id, channel_id, title, published_at, duration_s, has_creator_captions, is_live_vod, is_short, series_id, group_id, episode_number, status (`placed`, `unsorted`, `ignored`), placed_by (`rule`, `user`, `sync`), fetched_at |
| `title_rules` | id, series_id, channel_id (nullable = all channels of the series), pattern, match (`contains`, `regex`), target (`main`, `extras`), priority, enabled |
| `pages` / `page_translations` | `pages`: id, slug. `page_translations`: page_id, locale, title, body (Markdown), updated_at |
| `users` | id, discord_id, name, avatar_url, role (`viewer`, `editor`, `admin`), trust |
| `sessions` | id (hash of the session token), user_id, expires_at |
| `suggestions` | id, user_id, target_type, target_id, kind (`create`, `update`, `delete`), payload (JSON), note, is_creator_request, status (`open`, `approved`, `rejected`, `withdrawn`), reviewed_by, reviewed_at |
| `audit_log` | id, actor (`user`, `rule`, `sync`), actor_user_id (set when actor is `user`), entity, entity_id, before, after (JSON), created_at, reverted_by |
| `user_creators` | user_id, creator_id (global who-I-watch) |
| `user_series_creators` | user_id, series_id, creator_id (custom list per series) |
| `progress` | user_id, video_id, seconds, watched_at, updated_at |
| `user_settings` | user_id, JSON (theme, text size, motion, autoplay, captions, spoiler defaults, shortcuts) |

## YouTube sync

- `npm run sync` (and later a scheduled job) walks every channel with `sync_enabled`.
- Uploads come from the channel's uploads playlist (`playlistItems.list`, 1 quota unit per page). Details come from `videos.list` in batches of 50: duration, `contentDetails.caption` (creator captions), `liveStreamingDetails` (livestream VOD).
- Shorts are detected by duration and skipped.
- Each new video runs through the title rules of the series its creator takes part in, highest priority first. A match places it (main or Extras); no match puts it in Unsorted.
- Every placement writes an `audit_log` entry, so a bad rule can be reverted.
- YouTube API policy: stored API data must be refreshed or removed within 30 days. The sync refreshes `fetched_at` and a cleanup step drops stale data.
- The app never downloads or re-hosts video.

## Auth and roles

- Discord OAuth 2 (scope `identify`) with server-side sessions in SQLite (no third-party auth service).
- `ADMIN_DISCORD_IDS` bootstraps admins. Editors are promoted by admins.
- Every write in the management tool checks the role on the server.

## Translations

- Paraglide JS with `messages/{locale}.json`. English (`en`) is the source, Dutch (`nl`) ships from the start.
- Locale from a cookie (`PARAGLIDE_LOCALE`), then `Accept-Language`, then `en` (Paraglide strategy `cookie, preferredLanguage, baseLocale`; no locale in the URL). `<html lang>` follows it. A language switch lives in the footer (and later in settings); it posts to `/prefs`, which sets the cookie.
- The generated Paraglide output is not committed. `npm run i18n:compile` builds it (also part of `check` and `prepare`); the Vite plugin rebuilds it in dev and build.
- No user-facing string in components; everything goes through `m.some_key()`.
- Dates, durations and numbers use `Intl` with the active locale.
- Community content uses `*_translations` tables with a fallback to English.

## Front-end

- Design tokens (colours, spacing, radii) as CSS custom properties in `src/lib/styles/tokens.css`, three themes: dark, light, high contrast. See the design board for the values.
- The theme is stored in a `theme` cookie (`system`, `dark`, `light`, `contrast`) and rendered on the server as `<html data-theme>`, so there is no flash of the wrong theme. `system` (the default) follows `prefers-color-scheme` and `prefers-contrast: more` in CSS. `prefers-reduced-motion` turns off transitions and animations.
- The first-visit notice is remembered in `localStorage`; an inline script in `app.html` hides it before the first paint.
- Poster art is generated SVG per series from its `poster` settings, with no text inside the image: `{ "type": "art", "palette": "meadow", "seed": 11 }`. Palettes (`meadow`, `dusk`, `ember`, `tide`, `amber`, `gold`, `night`, `forest`, `violet`) set the colours and motif. Admins can upload an image instead: `{ "type": "image", "url": "..." }`.
- Site pages are Markdown, rendered with `marked` and cleaned with `sanitize-html` on the server. The page title is the only `h1`.
- Preferences work without JavaScript-heavy state libraries: Svelte 5 runes plus a small store synced to `localStorage` and, when signed in, to the server.

## Testing and CI

- Vitest for the rule engine, sync parsing, prefs merge and audit/revert.
- Playwright e2e against a freshly migrated and seeded database (`./data/e2e.db`) and the production build, with axe-core (WCAG 2.2 A and AA tags) on every main page in all three themes with reduced motion.
- GitHub Actions: install, `check`, `lint`, unit tests, build, e2e.
