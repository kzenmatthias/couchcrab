# Architecture

## Overview

One SvelteKit app serves the public site, the management tool and the API. Data lives in SQLite through Drizzle ORM. A sync script pulls uploads from the YouTube Data API and sorts them with title rules. Videos play in the YouTube IFrame Player.

```
src/
  lib/
    server/
      db/            schema.ts, client, migrations, seed
      auth/          Discord OAuth, sessions, roles
      youtube/       API client, sync, rule engine
      audit.ts       write and revert history entries
    components/      shared UI (cards, rails, POV bar, switches, dialogs)
    prefs/           who-I-watch, progress, settings (localStorage + account sync)
    paraglide/       generated, do not edit
  routes/
    (site)/          home, series, creators, player, settings
    manage/          management tool (editor/admin)
    auth/            Discord login and callback
messages/            en.json, nl.json (UI strings)
scripts/             sync.ts, seed.ts
tests/               unit (Vitest) and e2e (Playwright + axe)
```

## Data model

Names are indicative; the Drizzle schema in `src/lib/server/db/schema.ts` is the source of truth.

| Table | Purpose |
| --- | --- |
| `creators` | id, slug, name, color, avatar_url, bio |
| `channels` | id, creator_id, youtube_channel_id, title, kind (`main`, `secondary`), sync_enabled, last_synced_at |
| `series` | id, slug, title, kind (`season`, `live_series`, `event`, `other`), status, grouping (`week`, `session`, `none`), started_at, ended_at, poster (JSON: generated art settings or image url), parent_id (set for an Extras series) |
| `series_translations` | series_id, locale, description |
| `series_creators` | series_id, creator_id |
| `groups` | id, series_id, kind (`session`, `week`), number, title, starts_at, ends_at |
| `videos` | id, youtube_video_id, channel_id, title, published_at, duration_s, has_creator_captions, is_live_vod, is_short, series_id, group_id, episode_number, status (`placed`, `unsorted`, `ignored`), placed_by (`rule`, `user`, `sync`), fetched_at |
| `title_rules` | id, series_id, channel_id (nullable = all channels of the series), pattern, match (`contains`, `regex`), target (`main`, `extras`), priority, enabled |
| `pages` / `page_translations` | slug, locale, title, body (Markdown) |
| `users` | id, discord_id, name, avatar_url, role (`viewer`, `editor`, `admin`), trust |
| `sessions` | auth sessions |
| `suggestions` | id, user_id, target_type, target_id, kind, payload (JSON), note, is_creator_request, status, reviewed_by, reviewed_at |
| `audit_log` | id, actor_user_id or actor (`rule`, `sync`), entity, entity_id, before, after (JSON), created_at, reverted_by |
| `user_creators` | user_id, creator_id (global who-I-watch) |
| `user_series_creators` | user_id, series_id, creator_id (custom list per series) |
| `progress` | user_id, video_id, seconds, watched_at |
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
- Locale from a cookie, then `Accept-Language`, then `en`. A language switch lives in the footer and settings.
- No user-facing string in components; everything goes through `m.some_key()`.
- Dates, durations and numbers use `Intl` with the active locale.
- Community content uses `*_translations` tables with a fallback to English.

## Front-end

- Design tokens (colours, spacing, radii) as CSS custom properties, three themes: dark, light, high contrast. See the design board for the values.
- Poster art is generated SVG per series from its `poster` settings (palette and motif), with no text inside the image. Admins can upload an image instead.
- Preferences work without JavaScript-heavy state libraries: Svelte 5 runes plus a small store synced to `localStorage` and, when signed in, to the server.

## Testing and CI

- Vitest for the rule engine, sync parsing, prefs merge and audit/revert.
- Playwright e2e against the seeded demo data, with axe-core on every main page in all three themes.
- GitHub Actions: install, `check`, `lint`, unit tests, build, e2e.
