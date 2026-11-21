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
      manage/        the management service layer (validation, role checks, history)
      community/     suggestions, creator requests, review queue, trust, history and revert
      audit.ts       write and revert history entries
      me.ts          the signed-in viewer's prefs and progress in the database
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
    community/       the Before/After change shape and its labels, shared by server and pages
    paraglide/       generated, do not edit
  routes/
    (site)/          home, series/[slug] (timeline, by-creator, extras, about and history),
                     creators/[slug], watch/[videoId], settings/{creators,display}, [page] (site pages),
                     suggest, creator-requests, me/suggestions
    manage/          management tool (editor/admin)
    auth/            Discord and Google login and callbacks, POST signout
    (site)/signin, (site)/claim  sign-in page and creator claim step
    prefs/           POST endpoint for language and theme (works without JavaScript)
    api/videos/      GET public episode cards by YouTube id (Continue watching, revealed titles)
    api/me/          the signed-in viewer's prefs snapshot (GET, PUT) and progress batches (POST)
  env.ts             environment variables (SvelteKit 3 `defineEnvVars`)
messages/            en.json, nl.json (UI strings)
scripts/             migrate.ts, seed.ts, sync.ts, make-admin.ts (entry points for the npm scripts)
tests/               unit/ (Vitest) and e2e/ (Playwright + axe)
```

The app runs on SvelteKit 3: the Kit config lives in `vite.config.ts` (there is no `svelte.config.js`), and app code imports `src/lib` through the `#lib/*` subpath import from `package.json` (with a `.js` extension for TypeScript modules, e.g. `#lib/i18n.js`). Route ids include the `(site)` group, so links use `resolve('/(site)/[page]', { page: 'about' })`.

The database path comes from `DATABASE_URL` (default `./data/couchcrab.db`, gitignored). `npm run db:migrate` applies the Drizzle migrations in `src/lib/server/db/migrations` (`-- --fresh` deletes the file first), `npm run db:seed` replaces all rows with fictional demo data and `npm run db:generate` writes a new migration after a schema change.

## Data model

Names are indicative; the Drizzle schema in `src/lib/server/db/schema.ts` is the source of truth. Timestamps are integer Unix seconds; most content tables also have a `created_at`.

| Table | Purpose |
| --- | --- |
| `creators` | id, slug, name, color, avatar_url, bio, links (JSON array of URLs, set by the claimed creator), claimed_at (set once a user proved they own a channel), opted_out (hide all their videos) |
| `channels` | id, creator_id, youtube_channel_id, title, kind (`main`, `secondary`), sync_enabled, last_synced_at, verified_at, verified_by_user_id (the creator who proved ownership), unlinked_at and unlinked_by_user_id (set while the creator has unlinked the channel; its videos are hidden) |
| `series` | id, slug, title, kind (`season`, `live_series`, `event`, `other`), status (`upcoming`, `ongoing`, `ended`), grouping (`week`, `session`, `none`), started_at, ended_at, poster (JSON: generated art settings or image url), parent_id (set for an Extras series) |
| `series_translations` | series_id, locale, description |
| `series_creators` | series_id, creator_id |
| `groups` | id, series_id, kind (`session`, `week`), number, title, starts_at, ends_at |
| `videos` | id, youtube_video_id, channel_id, title, published_at, duration_s, has_creator_captions, is_live_vod, is_short, series_id, group_id, episode_number, status (`placed`, `unsorted`, `ignored`), placed_by (`rule`, `user`, `sync`), fetched_at |
| `title_rules` | id, series_id, channel_id (nullable = all channels of the series), pattern, match (`contains`, `regex`), target (`main`, `extras`), priority, enabled |
| `site_texts` | key (`notice`, `footer_disclaimer`), locale, value, updated_at. Short site texts managed in the app. |
| `pages` / `page_translations` | `pages`: id, slug. `page_translations`: page_id, locale, title, body (Markdown), updated_at |
| `users` | id, discord_id (nullable), google_sub (nullable), name, avatar_url, role (`viewer`, `editor`, `admin`), trust (approved minus rejected suggestions), creator_id (the creator profile this user claimed). At least one of discord_id and google_sub is set. |
| `claims` | id, user_id, creator_id (null when the channel is not on Couchcrab yet), youtube_channel_id, status (`verified`, `pending_review`, `rejected`), created_at, reviewed_by, reviewed_at |
| `sessions` | id (SHA-256 hash of the session token), user_id, expires_at |
| `claim_checks` | session_id, user_id, channels (JSON: owned channel ids and titles), expires_at (15 minutes). The owned channels between Google sign-in and the claim step. |
| `suggestions` | id, user_id (null for a creator request sent without an account), target_type (`video`, `series`, `creator`, `channel` for claim requests, `other`), target_id, kind (`create`, `update`, `delete`), payload (JSON, see "Community"), note, is_creator_request, contact_email (creator requests without an account), status (`open`, `question`, `approved`, `rejected`, `withdrawn`), review_message (the reason or question the sender sees), reviewed_by, reviewed_at, created_at |
| `audit_log` | id, actor (`user`, `creator`, `rule`, `sync`), actor_user_id (set when actor is `user` or `creator`, and for `rule` entries of a rule run someone started in the management tool), entity, entity_id, before, after (JSON), created_at, reverted_by (on a reverted entry: the first entry of the revert), revert_of (on the entries a revert wrote: the reverted entry), suggestion_id (on the entries an approved suggestion wrote) |
| `user_creators` | user_id, creator_id (global who-I-watch) |
| `user_series_creators` | user_id, series_id, creator_id (custom list per series) |
| `progress` | user_id, video_id, seconds, watched_at, updated_at |
| `user_settings` | user_id, settings (JSON `AccountPrefs`: the viewing prefs without the creator lists, their item stamps, `creatorsMode`, `customSeries`), updated_at |

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
- Every write in the management tool checks the role on the server (see "Management tool").

### Account menu

The header always has the menu, a disclosure panel built on `<details>` (so it works without JavaScript), with the same keyboard behaviour signed in and signed out. Signed out, the button reads "Menu"; the panel has a short note that choices are saved in this browser, the theme radio group, links to the settings pages and a "Sign in" link. Signed in, the button is an avatar or initials (its accessible name includes the user's name) and the panel has the signed-in line, the theme, the settings links, "My suggestions", "Creator dashboard" for claimed creators, "Manage" for editors and admins and Sign out. The theme exists only here: with JavaScript a choice applies at once by setting the `theme` cookie, without it an Apply button posts to `/prefs`. Escape and a click outside close the panel; Escape returns focus to the button.

### Account API (`/api/me/`)

| Route | Does |
| --- | --- |
| `GET /api/me/snapshot` | `{ prefs, progress }`: the account's prefs (null when it never saved any) and progress by YouTube id (newest 3000). `no-store`. |
| `PUT /api/me/snapshot` | `{ prefs }`: replaces the prefs. The body must be a version-1 prefs object; every field is cleaned with the prefs schema (`migratePrefs`), ids of creators or series that do not exist are dropped. Returns the stored prefs. |
| `POST /api/me/progress` | `{ entries: { [youtubeId]: { seconds, watched, updatedAt } } }`, at most 100 entries (`PROGRESS_BATCH_MAX`). Per video the newest entry wins, also against the stored row; unknown videos are skipped; a time in the future is clamped to now. |

All three need a session (401 otherwise). Writes need `content-type: application/json`, at most 256 KB, and an `Origin` header equal to the site's origin (403 otherwise), so another site cannot write to an account. The code is in `src/lib/server/me.ts`:

- `user_creators`: the global who-I-watch list; `user_series_creators`: custom lists per series.
- `user_settings.settings` (`AccountPrefs`): the rest of the prefs with their item stamps, plus `creatorsMode` (`all` or `list`) and `customSeries` (series with a custom list), because an empty list has no rows.
- `progress`: per user and video id; `watched_at` is set when watched (the first time is kept) and null otherwise. Times are whole seconds.

The theme and the language stay in their cookies and are not part of the account.

### Creator dashboard

`/creator` (`src/routes/(site)/creator/`: Profile, `channels`, `videos`) is for users with `creatorId`. Signed out, the pages redirect to `/signin`; a signed-in user without a claimed profile gets a 403 whose error page (`creator/+error.svelte`) explains how to claim with Google. Like the management tool, every load and action calls `creatorActorFor(locals)` (`src/lib/server/manage/creator-http.ts`) itself, and every read and write goes through `src/lib/server/manage/creator-self.ts`:

- `assertOwnCreator` reads `users.creator_id` from the database again (not from the session) and throws `ForbiddenError` unless it is the creator being acted on.
- Videos must be on one of that creator's channels, and a placement must target a series in `series_creators` for that creator or the Extras child of one. Anything else is a 403, also for a crafted form post. The placement checks and writes are the ones of `videos.ts` (`parsePlacement`, `writePlacement`, `writeVideoStatus`): `placed_by = user`.
- Profile edits accept bio, avatar URL, links (at most five http(s) URLs) and a colour from `PROFILE_COLORS` (`src/lib/creator-colors.ts`, each keeps the black or white avatar initials at 4.5:1 or more) or the colour the profile already has.
- Unlinking a secondary channel deletes nothing: it sets `channels.unlinked_at` and `unlinked_by_user_id` and turns `sync_enabled` off. `catalog.ts` hides the channel and its videos like an opted-out creator (per channel), and My videos leaves them out. "Link again" (`relinkOwnChannel`) clears both and turns the sync back on; admins can do the same on `/manage/creators/[id]` (`restoreChannel` in `creators.ts`). Both directions write the full channel snapshot (`channelSnapshot`) as before and after, so reverting the history entry restores the channel. The main channel cannot be unlinked. Opting out sets `creators.opted_out`; `catalog.ts` and the sync already hide and skip opted-out creators. The claim step still shows an opted-out creator to the user who claimed it.
- Every write has an `audit_log` entry with actor `creator` and `actor_user_id`, with the same `before`/`after` shapes as the management tool, so admins can review and revert it. `lastCreatorEdit` shows admins on `/manage/creators/[id]` when the creator last edited their own profile.
- The forms reuse the management tool's `Field`, `ErrorSummary`, `ConfirmPanel` and `Flash` components (`src/routes/manage/ui/`).

## Management tool

`/manage` is for editors and admins. Its layout (`src/routes/manage/+layout.svelte`) has its own header with the "Unofficial" label, a "Manage" link and "Back to the site", a section navigation and the site footer.

### Roles and the service layer

- `src/routes/manage/+layout.server.ts` sends a signed-out visitor to `/signin` and answers 403 to anyone below editor. A layout guard does not protect form actions, so **every load and every action calls `actorFor(locals, role)`** (`src/lib/server/manage/http.ts`) itself.
- Every read and write goes through the service layer in `src/lib/server/manage/`. Each function takes `(db, actor, input)`, checks the role again (`assertRole`), validates the input and writes in one transaction with an `audit_log` entry holding `before` and `after` (`auditUser`). There are no client-only checks; the forms work without JavaScript (`use:enhance` only improves them).
- Validation errors are `ValidationError` with a map of field name to error code (`required`, `slug_taken`, `invalid_regex`, `last_admin`, ...). The routes return them with `fail(400)` and the submitted values; `src/routes/manage/ui/errors.ts` turns codes into messages.

| Module | Does | Role |
| --- | --- | --- |
| `dashboard.ts` | Counts (unsorted videos, pending claims, creators, series) and the last sync per channel; the dashboard also shows open suggestions and creator requests (`community/review.ts`) | editor |
| `creators.ts` | Creators: list, create, edit, delete (only without videos); channels: parse and resolve `UC…` ids, `@handles` and channel URLs (`channels.list` with `id` or `forHandle` when `YOUTUBE_API_KEY` is set, otherwise a raw id only), add, edit, delete (only without videos). A claimed creator's colour, avatar and bio are the creator's: editors keep them, admins can change them. `opted_out` is admin only. Nobody can turn the sync on for a channel the creator unlinked (`channel_unlinked`); an admin restores it instead. | editor |
| `series.ts` | Series with participants, descriptions per locale (English required), poster settings; "Create Extras series" (one child per series, same kind, participants and poster, slug `<slug>-extras`); sessions and manual weeks (unique number per kind, end after start) | editor |
| `rules.ts` | Title rules per series. Regexes are checked with the engine's own guard (`compileRulePattern`). `testRule` runs one unsaved rule over the 200 latest uploads of the participating channels and writes nothing. `applyRulesToUnsorted` runs `placeVideo` over every unsorted, non-Short video with the same rule context as the sync (`loadRuleContext`); a dry run only reports, a real run writes `placed_by = rule` and an audit entry with actor `rule`, the rule id and the person who started it. | editor |
| `videos.ts` | The Unsorted queue (and the ignored list; videos of channels a creator unlinked stay out of both and out of the dashboard count): place in a series or Extras and a group of that series (`placed_by = user`), ignore, or send back to Unsorted | editor |
| `site.ts` | Site pages (`about`, `disclaimer`, `accessibility`, `privacy`) per locale with a sanitised preview (`renderMarkdown`, the same as the public page), and the site texts | admin |
| `users.ts` | Users with their sign-in providers and claimed creator; role changes. The last admin cannot be demoted, also not by themselves. | admin |
| `claims.ts` | `pending_review` claims. Approve: add the channel (verified for the claiming user) to an existing creator or a new one, let the user claim that creator if they have none, mark the claim verified and the creator request approved. Reject: mark both rejected. | admin |
| `sync.ts` | "Sync now" and dry run: `runSync` with a client for `YOUTUBE_API_KEY`; without a key the page explains and the buttons are disabled | admin |

Slugs are made from the name (`src/lib/slug.ts`, also used for the live suggestion in the forms) and get `-2`, `-3`, ... when taken; a slug typed by hand must be free.

### Site texts

The first-visit notice and the footer disclaimer are rows in `site_texts`. The root layout load reads them for the active locale (`readSiteTexts`), falling back to English; `FirstVisitNotice` and `SiteFooter` fall back to their message strings when there is no row, so the site never shows an empty disclaimer. The seed fills both with the message strings, which name Hermitcraft.

### Forms and accessibility

- Every field has a label; hints and errors are linked with `aria-describedby` and invalid fields get `aria-invalid` (`ui/Field.svelte`).
- After a failed submit, `ui/ErrorSummary.svelte` lists the errors at the top as links to the fields and takes focus.
- Destructive actions (delete a creator, channel, group or rule, reject a claim, apply rules) have a confirmation step: the first submit returns a confirmation panel (`ui/ConfirmPanel.svelte`) that takes focus and posts the real action. No `confirm()` dialogs.
- Tables have a caption and `th scope`. The participant picker is a filterable list of checkboxes.

### First admin

`ADMIN_DISCORD_IDS` makes Discord accounts admin on every sign-in. `npm run make-admin -- <user id>` promotes any existing user. The demo seed has a fictional "Demo Editor" and "Demo Admin" for the e2e tests.

## Community

Code in `src/lib/server/community/`; the pages are `(site)/suggest`, `(site)/creator-requests`, `(site)/me/suggestions`, `(site)/series/[slug]/about` (public history), `manage/review` and `manage/history`.

| Module | Does |
| --- | --- |
| `targets.ts` | What a suggestion can point at, with the choices its form offers. Only public things: placed videos that are not Shorts, of channels the creator did not unlink, creators who did not opt out. The review queue and its counts also leave out suggestions about videos that are hidden now (unlinked channel or opted-out creator); they come back when the video is public again, and cannot be approved meanwhile. |
| `suggestions.ts` | Payload types and validation per kind (`parseSuggestion`), `createSuggestion` (rate limit `DAILY_LIMIT` = 30 per user per 24 hours, note at most 1000 characters), `createCreatorRequest` (without an account: a contact email, at most 3 per email and 50 in total per 24 hours), "My suggestions" and withdraw. |
| `review.ts` | The review queue, `describeSuggestion` (Before/After against the current state), approve, reject, ask a question, the trust formula and promotion candidates. |
| `history.ts` | The history list with filters, `revertBlock` and `revertEntry`, and the public history of a series. |
| `entities.ts` | Per content entity: its current state in the same shape as the audit snapshots, which keys a revert can write, and how to write a state back through the service layer. |
| `changes.ts` | Turns two snapshots into field changes with names instead of ids (`src/lib/community/change.ts` is the shape, `labels.ts` translates it). |
| `tx.ts` | `runTagged`: runs service-layer writes in one transaction and returns the audit entries they wrote, so they can be tagged. |

### Payloads

A suggestion stores what it wants in `payload.type`: `video_series` (`seriesId`, `groupId`), `video_group` (`seriesId`, `groupId`), `video_live_vod` (`seriesId` of the Extras series), `video_captions` (`hasCreatorCaptions`), `video_ignore`, `series_field` and `creator_field` (`field`, `value`), `participant` (`seriesId`, `creatorId`, or `name` for someone not on Couchcrab yet), `rule` (`seriesId`, `pattern`, `match`, `target`, `channelId`), `other`, and `creator_request` (`request`: `correction` or `removal`, `creatorId`, `name`, `channel`). Creator requests from the claim step (Google sign-in) have no `type`; they are handled on the Claims page.

### Approving

`approveSuggestion` re-reads the suggestion (it must be `open` or `question`) and, in one transaction, calls the same service functions as the management pages (`placeVideoByHand`, `setVideoStatus`, `setVideoCaptions`, `updateSeries`, `updateCreator`, `createRule`) with the reviewer as actor. The audit entries those write get `suggestion_id`; the suggestion becomes `approved` and the sender's `users.trust` is recomputed. A change that no longer validates (a claimed creator's bio, a slug taken since) or a target that is gone is refused and nothing is written. Kinds without an automatic change (`other`, a creator not on Couchcrab, creator requests) only change the status.

The captions flag comes from YouTube: the sync refreshes it, so a corrected badge can be set back by a later sync.

### Trust

`users.trust` = approved − rejected suggestions (open and withdrawn ones do not count), updated on every review. `/manage/users` (admin) shows the counts and marks viewers with a trust of at least `PROMOTE_TRUST_THRESHOLD` (default 10) with "Suggest promoting to editor". Promotion stays a manual role change.

### History and revert

- `/manage/history` lists `audit_log` newest first, 50 per page, filtered by entity, actor type and date (UTC). Actor types: `person` (a user), `creator` (a viewer who claimed a creator profile), `rule`, `sync`. Each entry has a summary, the Before/After and, when allowed, a Revert link that opens a confirmation panel.
- `revertBlock` refuses with a reason: `already_reverted`, `not_revertible` (an entity or field a revert cannot write, or a deletion), `from_youtube` (titles and new uploads from the sync), `admin_only` (editors revert content only: videos, series, groups, creators, channels, rules; admins also user roles and a channel's link state), `missing` (the entity is gone) or `conflict` (a field the entry changed has another value now).
- `revertEntry` writes the `before` values over the current state through the service layer (a creation is undone by deleting through the service layer: groups, rules, channels, creators). The new entries get `revert_of`, the reverted entry gets `reverted_by`. A revert can itself be reverted. Channel entries use the full channel snapshot (`channelSnapshot`, including `unlinked_at`): reverting a creator's unlink restores the channel (`restoreChannel`), reverting a relink or an admin's restore unlinks it again with the original time and person (`unlinkChannel`, admin only), then kind, title and sync are written with `updateChannel`.
- `publicSeriesHistory` shows the series, its Extras, its groups and rules and placements of videos that are public now. Only editors, admins and verified creators are named; changes from a suggestion say "suggested by the community". In a spoiler-free series video titles are left out.

## Translations

- Paraglide JS with `messages/{locale}.json`. English (`en`) is the source, Dutch (`nl`) ships from the start.
- Locale from a cookie (`PARAGLIDE_LOCALE`), then `Accept-Language`, then `en` (Paraglide strategy `cookie, preferredLanguage, baseLocale`; no locale in the URL). `<html lang>` follows it. A language switch lives in the footer (and later in settings); it posts to `/prefs`, which sets the cookie.
- The generated Paraglide output is not committed. `npm run i18n:compile` builds it (also part of `check` and `prepare`); the Vite plugin rebuilds it in dev and build.
- No user-facing string in components; everything goes through `m.some_key()`.
- Dates, durations and numbers use `Intl` with the active locale.
- Community content uses `*_translations` tables with a fallback to English.

## Public pages

- Only `placed` videos that are not Shorts are shown publicly; Unsorted and ignored videos stay in the management tool. Creators with `opted_out`, and all their videos, never appear; nor do channels with `unlinked_at` and their videos. `src/lib/server/catalog.ts` applies these rules in every query.
- Mixed timeline: upload order (`published_at`, then id). Grouping `week` uses ISO 8601 weeks in UTC, so it does not depend on the server time zone or the visitor's locale; week 1 is the week the series started. Grouping `session` uses the session groups; videos without a session come last. Dates are shown in UTC through `Intl`.
- The watch page uses the YouTube IFrame Player API with the `youtube-nocookie.com` host. Demo data uses fake ids (`demo` + 7 characters); for those the cards show generated art instead of a YouTube thumbnail and the player shows a placeholder.

## Front-end

- Design tokens (colours, spacing, radii) as CSS custom properties in `src/lib/styles/tokens.css`, three themes: dark, light, high contrast. See the design board for the values.
- The theme is stored in a `theme` cookie (`system`, `dark`, `light`, `contrast`) and rendered on the server as `<html data-theme>`, so there is no flash of the wrong theme. `system` (the default) follows `prefers-color-scheme` and `prefers-contrast: more` in CSS. `prefers-reduced-motion` turns off transitions and animations.
- The first-visit notice is remembered in `localStorage`; an inline script in `app.html` hides it before the first paint.
- Poster art is generated SVG per series from its `poster` settings, with no text inside the image: `{ "type": "art", "palette": "meadow", "seed": 11 }`, with an optional `motif` that replaces the palette's own. Palettes (`meadow`, `dusk`, `ember`, `tide`, `amber`, `gold`, `night`, `forest`, `violet`) set the colours and motif. Admins can upload an image instead: `{ "type": "image", "url": "..." }`.
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
| `sync.ts` | `PrefsSyncAdapter`, `mergeSnapshots` and the push rules. |
| `account.ts` | The adapter for the account API (`/api/me/`). |
| `display.ts` | Display settings as attributes on `<html>`. |

Creators and series are referred to by database id. Defaults: watch everyone, spoiler-free off, autoplay on with a 15 s countdown, captions as YouTube decides, shortcuts N (next), S (show title), M (mark watched).

### What lives where

- **localStorage**: all prefs and the progress. Signed in, both are also kept in the account (see "Account sync").
- **Cookie `viewing`**: a compact mirror of what the server needs to render without a flash: the global creator list, custom lists per series, spoiler-free and only-creator-captions (default and per-series overrides) and text-only lists. Format `1~g1.2.a~c5_1.2~s1~p3~q7~o1~r4~u6~t1` (version first, ids in base 36; `g` missing means everyone, `g` alone nobody). Only unreserved URL characters, at most 3800 characters: when a huge setup would not fit, custom series lists are dropped (largest first) and those series follow the global list on the server. The browser writes it; the server only reads it, in the page loads (`parseMirror(cookies.get('viewing'))`).
- **`<html>` attributes**: `data-text-size` (`large`, `larger`), `data-motion` (`reduce`, `allow`), `data-underline-links`, `data-text-only`. An inline script in `src/app.html` sets them from localStorage before the first paint; `base.css` scales the root font size, underlines links and lets `allow` override `prefers-reduced-motion`.

### Rendering

- The page loads filter with `forViewer()` from `src/lib/viewing.ts`: episodes of creators you don't watch and, when asked, episodes without creator captions are removed; in spoiler-free series the title is replaced by an empty string and `titleHidden: true`, so it is in neither the HTML nor the page data. An Extras video follows the list and options of its parent series (`povSeriesId`).
- The store starts from the cookie on the server and during hydration, so both render the same. After mount it reads localStorage; progress-dependent parts (badges, Continue watching, revealed titles of watched episodes) appear then. Real titles of watched spoiler-free episodes (on the episode cards, the watch page and the creator page's upload list) come from `GET /api/videos?ids=…` (public data, at most 50 ids).
- Every change goes to localStorage and the cookie. When the mirrored part changed, the root layout calls `invalidateAll()`, so the server loads run again with the new cookie.
- Next episode (`nextEpisode`): the next item of the same week or session in timeline order that the viewer watches, else the first such item of a later group.
- The watch page saves the position through the IFrame API on pause, every 15 s while playing and when leaving the page, and marks the video watched at 90% or when it ends. Captions use `cc_load_policy=1` and `cc_lang_pref` when "captions on" is set. Demo ids keep the placeholder; builds with `import.meta.env.DEV` or `VITE_TEST_HOOKS=1` (the e2e build) add a "Simulate end of video" button so the countdown can be tested without YouTube.

### Account sync

Signed in, the account is the source of truth and the browser keeps a cache; signed out, everything stays in this browser. The root layout gets the user id from its server load and calls `viewing.connect(accountSyncAdapter(), userId)` once the store has read localStorage; signed out it calls `disconnect()`, which stops pushing and keeps the local copy.

```ts
interface PrefsSyncAdapter {
	pull(): Promise<{ prefs: Prefs; progress: ProgressMap } | null>;
	pushPrefs(prefs: Prefs, options?: { keepalive?: boolean }): Promise<void>;
	pushProgress(entries: ProgressMap, options?: { keepalive?: boolean }): Promise<void>;
}
```

`accountSyncAdapter` (`src/lib/prefs/account.ts`) talks to the account API above. The rules (`src/lib/prefs/sync.ts`, unit tested):

- **Items.** The prefs are split into items (`prefItems`): `creators`, `series.<id>`, `spoilerFree.default`, `spoilerFree.<id>`, `creatorCaptionsOnly.default`, `creatorCaptionsOnly.<id>`, `display`, `playback`, `shortcuts`. Every change through `viewing.update()` stamps the items it changed in `prefs.stamps` (Unix ms). Prefs saved before stamps existed get the stamp `updatedAt` for every item that differs from the default.
- **Merge** (`mergeSnapshots`): per item the newest stamp wins (on a tie the browser's copy); an item that was never changed loses to one that was. Progress is merged per video, newest entry first.
- **First merge.** The first time a browser connects to an account (remembered under `couchcrab:sync` in localStorage), creator lists set on both sides are combined: the global list (everyone wins over a list) and custom series lists. Later connects only take the newest item, so a removed creator stays removed.
- **Push.** After the merge the store pushes the prefs when they differ from the account's, and the progress entries the account lacks or has older (compared in whole seconds; entries already pushed in an earlier visit are skipped). After that every prefs change and every progress write is pushed, debounced by 2 s; progress goes in batches of 100. A failed push is retried quietly, waiting longer each time (2 s doubling up to 60 s); playback never waits for it. When the page is hidden or closed, what is still pending is sent with `keepalive`.
- **SSR.** The cookie mirror stays as it is: after the merge the store writes the new mirror and the root layout re-runs the server loads, so a second browser renders the account's lists after its first pull.

## Testing and CI

- Vitest for the rule engine, sync parsing, prefs merge and audit/revert. The sync tests run against a temporary SQLite database and a fake YouTube API built from the recorded-style fixtures in `tests/fixtures/youtube/` (fictional ids and titles); they never touch the network.
- Playwright e2e against a freshly migrated and seeded database (`./data/e2e.db`) and the production build, with axe-core (WCAG 2.2 A and AA tags) on every main page in all three themes with reduced motion.
- GitHub Actions: install, `check`, `lint`, unit tests, build, e2e.
