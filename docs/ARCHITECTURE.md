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
    prefs/           viewing prefs store, cookie mirror, progress, sync adapter, theme, notice
    styles/          design tokens and base CSS
    poster-art.ts    generated poster art
    i18n.ts          translation fallback and Intl helpers
    timeline.ts      timeline order, ISO week and session grouping (pure, unit tested)
    viewing.ts       who-I-watch, spoiler and captions filters, next episode (pure, unit tested)
    video.ts         episode card type, YouTube id/URL and duration helpers
    youtube-iframe.ts  loads the YouTube IFrame Player API in the browser
    labels.ts        translated labels for database enums
    paraglide/       generated, do not edit
  routes/
    (site)/          home, series/[slug] (timeline, by-creator, extras, about), creators/[slug],
                     watch/[videoId], settings/{creators,display}, [page] (site pages)
    manage/          management tool (editor/admin)
    auth/            Discord and Google login and callbacks, POST signout
    (site)/signin, (site)/claim  sign-in page and creator claim step
    prefs/           POST endpoint for language and theme (works without JavaScript)
    api/videos/      GET public episode cards by YouTube id (Continue watching, revealed titles)
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
| `sessions` | id (SHA-256 hash of the session token), user_id, expires_at |
| `claim_checks` | session_id, user_id, channels (JSON: owned channel ids and titles), expires_at (15 minutes). The owned channels between Google sign-in and the claim step. |
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

Code in `src/lib/server/auth/`: `session.ts` (tokens, cookies, sliding expiry), `oauth.ts` (state, PKCE, token exchange), `discord.ts`, `google.ts`, `users.ts` (create, update and link users), `claims.ts` (the claim step), `guards.ts` (`requireUser`, `requireRole`), `signin.ts` (shared route steps) and `config.ts` (provider keys from the environment). Providers are called with plain `fetch`, injected so the unit tests never touch the network. No third-party auth service.

### Sessions

- The session cookie `couchcrab_session` holds 32 random bytes (base64url). It is `httpOnly`, `SameSite=Lax`, `path=/` and `Secure` everywhere except plain `http://localhost`.
- Only the SHA-256 hash of the token is stored, as `sessions.id`. A session lasts 30 days and slides: a request in its last 15 days extends it to 30 days again. An expired session is deleted when it is used.
- `hooks.server.ts` resolves `locals.user` (`id`, `name`, `avatarUrl`, `role`, `creatorId`) and `locals.sessionId` on every request.
- `requireUser(locals)` throws 401 and `requireRole(locals, 'editor' | 'admin')` throws 401 or 403. An admin passes an editor check.
- Sign out is `POST /auth/signout`. SvelteKit's origin check rejects cross-site form posts, so another site cannot sign you out. Deleting a session also deletes its claim check.

### Sign-in

| Route | Does |
| --- | --- |
| `/signin` | The two paths (Discord for viewers and editors, Google for creators). A provider without both keys in the environment shows a disabled button with an explanation. Errors from the callbacks arrive as `?error=` and are shown here. |
| `/auth/discord`, `/auth/discord/callback` | Discord OAuth 2, scope `identify`, with state and PKCE (S256). |
| `/auth/google`, `/auth/google/callback` | Google OAuth 2, scopes `openid` and `https://www.googleapis.com/auth/youtube.readonly`, with state and PKCE. |
| `/claim` | The claim step after Google sign-in. |
| `/auth/signout` | `POST` only. |

- State and PKCE verifier live in `httpOnly` cookies on `/auth` for 10 minutes and are deleted at the callback, so each can be used once. The state is compared in constant time.
- Discord: the user is created or updated by `discord_id`; name and avatar follow Discord on every sign-in. Ids in `ADMIN_DISCORD_IDS` get role `admin` on every sign-in. Editors are promoted by admins.
- Google: `sub` comes from the ID token returned by the token endpoint (issuer, audience and expiry checked; the signature check is replaced by TLS, as OpenID Connect allows for a token received directly from the token endpoint). Couchcrab then calls `channels.list?part=snippet&mine=true` once with the access token and drops the token. It is never stored, returned or logged. A new Google-only user is named after their first channel.
- Linking: when someone is already signed in, a new Discord or Google account is linked to that user instead of creating a new one. An account that already belongs to another user is never moved; the sign-in page explains the conflict.
- `youtube.readonly` is a sensitive scope: the production Google OAuth app needs Google's OAuth verification before the public can use it. Local development works with test users.

### Creator claims

- After Google sign-in the owned channels (ids and titles only) are saved in `claim_checks` for 15 minutes, keyed by the session id, so the list survives the redirect to `/claim` without keeping the Google token. The record is only read for the same session and user and disappears on sign-out.
- Each owned channel is classified (`claims.ts`): **claimable** (on Couchcrab, creator unclaimed and not opted out), **verified** (this user claimed its creator), **already claimed** by someone else, **not available** (this user already claimed another creator) or **needs review** (not on Couchcrab; an opted-out creator is treated the same so it stays private).
- Channels that need review become a `claims` row with status `pending_review` and a creator request in `suggestions` (`is_creator_request`), once per user and channel.
- "Claim <name>" (or a choice when the channels match several creators) re-checks everything on the server and, in one transaction, sets `creators.claimed_at`, `users.creator_id`, `channels.verified_at` and `verified_by_user_id` for the owned channels of that creator, inserts `claims` rows with status `verified` and writes an `audit_log` entry per change (actor `user`).
- "This isn't me" signs out.
- A claimed creator gets the "Verified creator" badge and may edit only their own creator profile and channels, change the placement of their own videos without review (written to `audit_log`, revertible by admins) and set `opted_out`, which hides all their videos. Every such write checks `users.creator_id` on the server.
- Every write in the management tool checks the role on the server.

### Account menu

Signed out, the header shows a "Sign in" link. Signed in, it shows an account button (avatar or initials; its accessible name includes the user's name) that opens a disclosure panel built on `<details>`, so it works without JavaScript. The panel has the signed-in line, the theme radio group (it moved here from the footer; with JavaScript a choice applies at once by setting the `theme` cookie, without it an Apply button posts to `/prefs`), links to the settings pages, "Creator dashboard" for claimed creators and Sign out. Escape and a click outside close it; Escape returns focus to the button.

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
- Preferences work without JavaScript-heavy state libraries: Svelte 5 runes plus a small store synced to `localStorage` and, when signed in, to the server. See "Viewing preferences".

## Viewing preferences

Everything works without an account. The code lives in `src/lib/prefs/`:

| File | Does |
| --- | --- |
| `schema.ts` | The `Prefs` type, defaults and `migratePrefs`: versioned JSON (`version: 1`) under the localStorage key `couchcrab:prefs`. Every field is validated on read; an older shape is migrated step by step, anything invalid gets its default. |
| `progress.ts` | Watch progress per YouTube video id under `couchcrab:progress`: `{ seconds, watched, updatedAt }`. Watched from 90% (`WATCHED_RATIO`) or when the video ends; Continue watching lists started (10 s or more), unwatched videos, newest first. At most 3000 entries. |
| `mirror.ts` | The cookie mirror (below). |
| `store.svelte.ts` | `ViewingStore`, the runes store, shared through context (`getViewing()`). |
| `sync.ts` | `PrefsSyncAdapter` and `mergeSnapshots`. |
| `display.ts` | Display settings as attributes on `<html>`. |

Creators and series are referred to by database id. Defaults: watch everyone, spoiler-free off, autoplay on with a 15 s countdown, captions as YouTube decides, shortcuts N (next), S (show title), M (mark watched).

### What lives where

- **localStorage**: all prefs and the progress. The progress never goes to the server.
- **Cookie `viewing`**: a compact mirror of what the server needs to render without a flash: the global creator list, custom lists per series, spoiler-free and only-creator-captions (default and per-series overrides) and text-only lists. Format `1~g1.2.a~c5_1.2~s1~p3~q7~o1~r4~u6~t1` (version first, ids in base 36; `g` missing means everyone, `g` alone nobody). Only unreserved URL characters, at most 3800 characters: when a huge setup would not fit, custom series lists are dropped (largest first) and those series follow the global list on the server. The browser writes it; the server only reads it, in the page loads (`parseMirror(cookies.get('viewing'))`).
- **`<html>` attributes**: `data-text-size` (`large`, `larger`), `data-motion` (`reduce`, `allow`), `data-underline-links`, `data-text-only`. An inline script in `src/app.html` sets them from localStorage before the first paint; `base.css` scales the root font size, underlines links and lets `allow` override `prefers-reduced-motion`.

### Rendering

- The page loads filter with `forViewer()` from `src/lib/viewing.ts`: episodes of creators you don't watch and, when asked, episodes without creator captions are removed; in spoiler-free series the title is replaced by an empty string and `titleHidden: true`, so it is in neither the HTML nor the page data. An Extras video follows the list and options of its parent series (`povSeriesId`).
- The store starts from the cookie on the server and during hydration, so both render the same. After mount it reads localStorage; progress-dependent parts (badges, Continue watching, revealed titles of watched episodes) appear then. Real titles of watched spoiler-free episodes come from `GET /api/videos?ids=…` (public data, at most 50 ids).
- Every change goes to localStorage and the cookie. When the mirrored part changed, the root layout calls `invalidateAll()`, so the server loads run again with the new cookie.
- Next episode (`nextEpisode`): the next item of the same week or session in timeline order that the viewer watches, else the first such item of a later group.
- The watch page saves the position through the IFrame API on pause, every 15 s while playing and when leaving the page, and marks the video watched at 90% or when it ends. Captions use `cc_load_policy=1` and `cc_lang_pref` when "captions on" is set. Demo ids keep the placeholder; builds with `import.meta.env.DEV` or `VITE_TEST_HOOKS=1` (the e2e build) add a "Simulate end of video" button so the countdown can be tested without YouTube.

### Sync adapter

```ts
interface PrefsSyncAdapter {
	pull(): Promise<{ prefs: Prefs; progress: ProgressMap } | null>;
	push(snapshot: { prefs: Prefs; progress: ProgressMap }): Promise<void>;
}
```

`viewing.connect(adapter)` pulls the account's copy, merges it (`mergeSnapshots`: the prefs with the newest `updatedAt` win as a whole, progress is merged per video, newest entry first), applies and pushes the result; after that every change is pushed, debounced by 2 s. `disconnect()` stops pushing. The server side (`user_creators`, `user_series_creators`, `progress`, `user_settings`) comes with accounts.

## Testing and CI

- Vitest for the rule engine, sync parsing, prefs merge and audit/revert. The sync tests run against a temporary SQLite database and a fake YouTube API built from the recorded-style fixtures in `tests/fixtures/youtube/` (fictional ids and titles); they never touch the network.
- Playwright e2e against a freshly migrated and seeded database (`./data/e2e.db`) and the production build, with axe-core (WCAG 2.2 A and AA tags) on every main page in all three themes with reduced motion.
- GitHub Actions: install, `check`, `lint`, unit tests, build, e2e.
