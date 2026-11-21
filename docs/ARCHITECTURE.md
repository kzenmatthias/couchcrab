# Architecture

## Overview

One SvelteKit app serves the public site, the management tool and the API. Data lives in SQLite through Drizzle ORM. A sync script pulls uploads from the YouTube Data API and sorts them with title rules. Videos play in the YouTube IFrame Player.

```
src/
  lib/
    server/
      db/            schema.ts, client.ts, index.ts (app connection), migrations/, seed.ts
      catalog.ts     read-only queries for the public pages (applies the visibility rules)
      auth/          Discord and Google OAuth, sessions, roles, creator claims
      youtube/       API client, sync, rule engine
      audit.ts       write and revert history entries
    components/      shared UI (cards, rails, timeline, player, POV bar, switches, dialogs)
    prefs/           who-I-watch, progress, settings (localStorage + account sync)
    styles/          design tokens and base CSS
    poster-art.ts    generated poster art
    i18n.ts          translation fallback and Intl helpers
    timeline.ts      timeline order, ISO week and session grouping (pure, unit tested)
    video.ts         episode card type, YouTube id/URL and duration helpers
    youtube-iframe.ts  loads the YouTube IFrame Player API in the browser
    labels.ts        translated labels for database enums
    paraglide/       generated, do not edit
  routes/
    (site)/          home, series/[slug] (timeline, by-creator, extras, about), creators/[slug],
                     watch/[videoId], [page] (site pages), later settings
    manage/          management tool (editor/admin)
    auth/            Discord and Google login and callbacks
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
| `creators` | id, slug, name, color, avatar_url, bio, claimed_at (set once a user proved they own a channel), opted_out (hide all their videos) |
| `channels` | id, creator_id, youtube_channel_id, title, kind (`main`, `secondary`), sync_enabled, last_synced_at, verified_at, verified_by_user_id (the creator who proved ownership) |
| `series` | id, slug, title, kind (`season`, `live_series`, `event`, `other`), status (`upcoming`, `ongoing`, `ended`), grouping (`week`, `session`, `none`), started_at, ended_at, poster (JSON: generated art settings or image url), parent_id (set for an Extras series) |
| `series_translations` | series_id, locale, description |
| `series_creators` | series_id, creator_id |
| `groups` | id, series_id, kind (`session`, `week`), number, title, starts_at, ends_at |
| `videos` | id, youtube_video_id, channel_id, title, published_at, duration_s, has_creator_captions, is_live_vod, is_short, series_id, group_id, episode_number, status (`placed`, `unsorted`, `ignored`), placed_by (`rule`, `user`, `sync`), fetched_at |
| `title_rules` | id, series_id, channel_id (nullable = all channels of the series), pattern, match (`contains`, `regex`), target (`main`, `extras`), priority, enabled |
| `pages` / `page_translations` | `pages`: id, slug. `page_translations`: page_id, locale, title, body (Markdown), updated_at |
| `users` | id, discord_id (nullable), google_sub (nullable), name, avatar_url, role (`viewer`, `editor`, `admin`), trust, creator_id (the creator profile this user claimed). At least one of discord_id and google_sub is set. |
| `claims` | id, user_id, creator_id (null when the channel is not on Couchcrab yet), youtube_channel_id, status (`verified`, `pending_review`, `rejected`), created_at, reviewed_by, reviewed_at |
| `sessions` | id (hash of the session token), user_id, expires_at |
| `suggestions` | id, user_id, target_type, target_id, kind (`create`, `update`, `delete`), payload (JSON), note, is_creator_request, status (`open`, `approved`, `rejected`, `withdrawn`), reviewed_by, reviewed_at |
| `audit_log` | id, actor (`user`, `rule`, `sync`), actor_user_id (set when actor is `user`), entity, entity_id, before, after (JSON), created_at, reverted_by |
| `user_creators` | user_id, creator_id (global who-I-watch) |
| `user_series_creators` | user_id, series_id, creator_id (custom list per series) |
| `progress` | user_id, video_id, seconds, watched_at, updated_at |
| `user_settings` | user_id, JSON (theme, text size, motion, autoplay, captions, spoiler defaults, shortcuts) |

## YouTube sync

Code in `src/lib/server/youtube/`: `client.ts` (YouTube Data API v3 over `fetch`), `classify.ts` (flags per video), `rules.ts` (the title rule engine, a pure function) and `sync.ts` (the service). `scripts/sync.ts` is the CLI. The API key comes from `YOUTUBE_API_KEY`; it only goes into request URLs and is redacted from every error message.

```
npm run sync                              # all channels with sync_enabled, then retention
npm run sync -- --channel UCxxxxxxxx      # one channel (and only its videos for retention)
npm run sync -- --dry-run                 # fetch and evaluate, write nothing, list each video
npm run sync -- --refresh-only            # retention only
```

Without `YOUTUBE_API_KEY` the script prints a short note and exits with code 0, so the demo data works without a key. It exits with 1 when a channel or the retention step failed.

### Per channel

1. Channels of creators with `opted_out` are skipped (no API call). Channels with `sync_enabled` off are not read at all.
2. `channels.list` (`contentDetails,snippet`) gives the uploads playlist.
3. `playlistItems.list` pages through it (50 per page, newest first). An incremental sync stops at the first item published before `last_synced_at` minus a safety margin of 3 days (`SAFETY_MARGIN_S`), for late or rescheduled uploads. A first sync takes at most the 200 newest uploads (`FIRST_SYNC_MAX`, `firstSyncMax` option).
4. `videos.list` (`contentDetails,snippet,liveStreamingDetails`) in batches of 50 gives the details. Durations are ISO 8601 (`PT32M15S`) and stored in seconds.
5. Classification: `has_creator_captions` when `contentDetails.caption` is `"true"`; `is_live_vod` when `liveStreamingDetails.actualEndTime` is set; `is_short` when the duration is 180 seconds or less (`SHORT_MAX_SECONDS`) and the video is not a live VOD. The API has no Shorts flag, so a regular upload of three minutes or less also counts as a Short; an editor can still place it by hand.
6. Upcoming items (scheduled streams and premieres) and streams that are live right now are skipped. `last_synced_at` is then set no later than the earliest skipped item, so a later sync picks it up once it has ended. Otherwise `last_synced_at` becomes the time of the sync.
7. Writes, in one transaction per channel:
   - A known video (same `youtube_video_id`) gets its title, publish date, duration, captions and live/Short flags refreshed and a new `fetched_at`. Its placement (`series_id`, `group_id`, `status`, `placed_by`) is never changed, so a placement by a user (`placed_by = user`) always survives.
   - A new Short is stored with `status = ignored` and `placed_by = sync`. Storing it (instead of skipping it) keeps it out of Unsorted for good and lets an editor place a misdetected video.
   - Any other new video is inserted as `unsorted`, then run through the rule engine. A match sets `series_id`, `group_id`, `status = placed` and `placed_by = rule`.
   - Every insert writes an `audit_log` entry with actor `sync`; every placement writes a second entry with actor `rule` (before: unsorted, after: the placement and the rule id). Reverting the placement entry puts the video back in Unsorted. The helper is `src/lib/server/audit.ts`.
8. A quota error stops the sync: the remaining channels and the retention step are reported as not run. Other errors are reported per channel and the next channel continues.

A dry run performs the same writes inside a transaction and rolls it back, so its summary is exactly what a real run would do. The CLI prints the summary as a table (per channel: fetched, new, placed, unsorted, Shorts, skipped, updated, errors), plus the list of videos in a dry run.

### Title rules

`placeVideo(video, rules, series)` in `rules.ts` gets the enabled rules of every series the channel's creator takes part in (`series_creators`) and returns `{ seriesId, target, ruleId, groupId }` or `null` (Unsorted).

- Rules are tried by `priority` (highest first), then by `id`. The first match wins.
- A rule with `channel_id` set only applies to uploads of that channel.
- `contains` is a case-insensitive substring match. `regex` is a JavaScript regular expression with the `i` flag; an invalid pattern or one longer than 200 characters never matches (it does not throw).
- `target: extras` places the video in the series' Extras child (the series with `parent_id` pointing at it). If the series has no Extras child, the rule is skipped and the next rule gets a chance.
- A livestream VOD goes to the Extras child even when the matching rule targets the main series, because livestreams are not episodes. Without an Extras child it stays in the main series.
- When the destination series is grouped by week or session, the video gets the group whose window (`starts_at` up to `ends_at`, open-ended when `ends_at` is empty) contains its publish date.

### Retention (YouTube API policy)

The YouTube API Services policy requires stored API data to be refreshed or deleted within 30 days. After the channels, every run refreshes videos whose `fetched_at` is older than 25 days (`REFRESH_AFTER_S`) with `videos.list` in batches of 50:

- Returned videos get their API fields and `fetched_at` refreshed; placement is untouched.
- Videos YouTube no longer returns (deleted or private) are blanked: empty title, duration 0, publish date 0, flags off and `status = ignored`, with an `audit_log` entry (actor `sync`). The YouTube id and the placement are kept, because ids may be stored, and so the row keeps its watch progress. Blanked rows are checked again on every refresh; if YouTube returns the video again, its data and status (`placed` when it has a series, otherwise `unsorted`, or `ignored` for a Short) come back.
- The app never downloads or re-hosts video.

## Auth and roles

- Discord OAuth 2 (scope `identify`) with server-side sessions in SQLite (no third-party auth service).
- Google OAuth 2 (scope `openid youtube.readonly`) for creators. After sign-in Couchcrab calls `channels.list?mine=true` once with the access token to see which YouTube channels the account owns, then discards the token; it is never stored. The Google account is linked through `users.google_sub`, so Google also works as a normal login for creators without Discord.
- An owned channel that matches `channels.youtube_channel_id` is verified at once: a `claims` row with status `verified`, `channels.verified_at` and `verified_by_user_id`, `creators.claimed_at`, and `users.creator_id`. An owned channel that is not on Couchcrab yet becomes a `claims` row with status `pending_review` and a creator request in the review queue.
- A claimed creator gets the "Verified creator" badge and may edit only their own creator profile and channels, change the placement of their own videos without review (written to `audit_log`, revertible by admins) and set `opted_out`, which hides all their videos. Every such write checks `users.creator_id` on the server.
- `youtube.readonly` is a sensitive scope: the production Google OAuth app needs Google's OAuth verification before it can be used by the public. Local development works with test users.
- `ADMIN_DISCORD_IDS` bootstraps admins. Editors are promoted by admins.
- Every write in the management tool checks the role on the server.

## Translations

- Paraglide JS with `messages/{locale}.json`. English (`en`) is the source, Dutch (`nl`) ships from the start.
- Locale from a cookie (`PARAGLIDE_LOCALE`), then `Accept-Language`, then `en` (Paraglide strategy `cookie, preferredLanguage, baseLocale`; no locale in the URL). `<html lang>` follows it. A language switch lives in the footer (and later in settings); it posts to `/prefs`, which sets the cookie.
- The generated Paraglide output is not committed. `npm run i18n:compile` builds it (also part of `check` and `prepare`); the Vite plugin rebuilds it in dev and build.
- No user-facing string in components; everything goes through `m.some_key()`.
- Dates, durations and numbers use `Intl` with the active locale.
- Community content uses `*_translations` tables with a fallback to English.

## Public pages

- Only `placed` videos that are not Shorts are shown publicly; Unsorted and ignored videos stay in the management tool. Creators with `opted_out`, and all their videos, never appear. `src/lib/server/catalog.ts` applies these rules in every query.
- Mixed timeline: upload order (`published_at`, then id). Grouping `week` uses ISO 8601 weeks in UTC, so it does not depend on the server time zone or the visitor's locale; week 1 is the week the series started. Grouping `session` uses the session groups; videos without a session come last. Dates are shown in UTC through `Intl`.
- The watch page uses the YouTube IFrame Player API with the `youtube-nocookie.com` host. Demo data uses fake ids (`demo` + 7 characters); for those the cards show generated art instead of a YouTube thumbnail and the player shows a placeholder.

## Front-end

- Design tokens (colours, spacing, radii) as CSS custom properties in `src/lib/styles/tokens.css`, three themes: dark, light, high contrast. See the design board for the values.
- The theme is stored in a `theme` cookie (`system`, `dark`, `light`, `contrast`) and rendered on the server as `<html data-theme>`, so there is no flash of the wrong theme. `system` (the default) follows `prefers-color-scheme` and `prefers-contrast: more` in CSS. `prefers-reduced-motion` turns off transitions and animations.
- The first-visit notice is remembered in `localStorage`; an inline script in `app.html` hides it before the first paint.
- Poster art is generated SVG per series from its `poster` settings, with no text inside the image: `{ "type": "art", "palette": "meadow", "seed": 11 }`. Palettes (`meadow`, `dusk`, `ember`, `tide`, `amber`, `gold`, `night`, `forest`, `violet`) set the colours and motif. Admins can upload an image instead: `{ "type": "image", "url": "..." }`.
- Site pages are Markdown, rendered with `marked` and cleaned with `sanitize-html` on the server. The page title is the only `h1`.
- Preferences work without JavaScript-heavy state libraries: Svelte 5 runes plus a small store synced to `localStorage` and, when signed in, to the server.

## Testing and CI

- Vitest for the rule engine, sync parsing, prefs merge and audit/revert. The sync tests run against a temporary SQLite database and a fake YouTube API built from the recorded-style fixtures in `tests/fixtures/youtube/` (fictional ids and titles); they never touch the network.
- Playwright e2e against a freshly migrated and seeded database (`./data/e2e.db`) and the production build, with axe-core (WCAG 2.2 A and AA tags) on every main page in all three themes with reduced motion.
- GitHub Actions: install, `check`, `lint`, unit tests, build, e2e.
