# Couchcrab product spec

This file records what Couchcrab does and why. The designs in [design/](design/) show it; this text is the source of truth when they disagree.

## Goal

A Netflix-style web app to watch multiplayer Minecraft YouTube series (Hermitcraft seasons, Life series, events and more) per series and per creator, including a mixed timeline of several points of view. Web only, English by default, translatable.

## Not affiliated

Couchcrab is a fan project and must say so everywhere:

- an "Unofficial" label next to the logo,
- a dismissible notice on the first visit,
- a line in every footer,
- an About page (managed in the app).

No Hermitcraft logo, server art or creator skins are used as Couchcrab branding.

## Content is data, not code

Nothing about creators or series is hard-coded. Everything below is managed in the app by admins and editors, and can be proposed by anyone signed in:

| Thing | Fields (summary) |
| --- | --- |
| Creator | name, slug, colour, avatar, short bio |
| Channel | YouTube channel id, owner creator, kind (main, second channel), sync on/off |
| Series | title, slug, kind (season, live series, event, other), description, dates, status, grouping (week, session, none), poster, participating creators, optional parent (for Extras) |
| Group | a session or a manual week inside a series |
| Title rule | pattern that places uploads of a channel into a series (main or Extras), with priority |
| Page | About, disclaimer, accessibility statement, privacy, community, creator requests intro |

There are no fixed creator groups (no "Hermits" vs "Friends"). A creator is simply listed; series show who takes part.

## Viewing

- **Home:** continue watching, new uploads from the creators you watch, series, your creators.
- **Series page:** header with poster art, POV bar (who you watch here, global or custom), sub-pages: mixed timeline, by creator, Extras, about and history.
- **Mixed timeline:** episodes of the chosen POVs sorted by upload date and grouped per week. Live series are grouped per session (groups made by the community). Uploads that no rule could place go to "Unsorted".
- **Creator page:** all series of a creator, links to their channels, latest uploads.
- **Search:** series, creators (by name or channel) and episodes, ignoring case and accents, in three sections with counts and "Show all". Hidden titles of spoiler-free series are neither searched nor shown.
- **Player:** YouTube IFrame player, queue of the current week or session, autoplay countdown (setting), mark as watched, show real title (spoiler mode), watch on YouTube, suggest an edit.

## Who I watch

- One global list of creators.
- Per series: follow the global list or a custom list.
- Creators you don't watch are hidden from rows and timelines.
- Without an account this lives in `localStorage`; on Discord sign-in it is merged into the account.

## What counts as an episode

- Regular uploads and uploads on second channels belong to the main series.
- Livestream VODs belong to the Extras side series of that series.
- Shorts are excluded.

## Creators claim their profile

- A creator signs in with Google. Couchcrab asks YouTube (scope `youtube.readonly`, `channels.list?mine=true`) which channels that Google account owns.
- A channel that matches a Couchcrab channel is verified automatically and its creator profile is claimed.
- A channel that is not on Couchcrab yet becomes a creator request for review.
- A claimed creator gets a "Verified creator" badge and can:
  - edit their own profile (bio, avatar, colour, links),
  - link or unlink their own channels,
  - change the placement of their own videos directly (logged in the history, revertible by admins),
  - opt out: hide all their videos from Couchcrab.
- A claimed creator cannot edit other creators.
- All of this lives on the creator dashboard (`/creator`, "Creator dashboard" in the account menu), with three parts:
  - **Profile**: bio, avatar URL, a profile colour from a fixed set that keeps the avatar initials readable (4.5:1, with a preview) and up to five links. "Hide my videos from Couchcrab" explains what happens and asks to confirm; the same page shows it again with "Show my videos again".
  - **Channels**: verified channels and channels that still need review. A second channel can be unlinked after a confirmation: its videos are hidden from Couchcrab and the sync stops, but nothing is deleted, and the creator can link it again from the same page (admins can too). The main channel cannot be unlinked. Nothing a creator does is irreversible for admins. "Add another channel" goes through Google sign-in again, which creates a claim for review when the channel is not on Couchcrab yet.
  - **My videos**: unsorted uploads first, then placed ones, then ignored ones, with filters for status and series. A video can be placed in a series the creator takes part in (or its Extras, with a session or week) or ignored.
- Opting out hides the profile and every video from all public pages and from search, and the sync skips the creator's channels. Viewers keep their own progress.
- Editors cannot change a claimed creator's bio, avatar or colour; admins can, and see when the creator last edited their profile.
- The Google access token is used once for the ownership check and is not stored.
- Google sign-in also works as a normal login for creators who don't use Discord.

## Spoiler-free mode

Per series (and a default for new series). Unwatched episodes show a neutral card, the title becomes "Episode N", and the real title is hidden from screen readers too. "Show real title" reveals one episode.

## Community and moderation

- Sign-in: Discord only.
- Roles: viewer, editor, admin. At launch only the owner is admin and approves suggestions.
- Suggestions: anyone signed in can suggest an edit from a video (the watch page), a series or a creator page. Editors and admins approve or reject. Nothing changes until a reviewer approves.
  - For a video: wrong or no series (and session or week), wrong session or week, it's a livestream VOD (moves to the Extras series), captions badge is wrong, not part of any series (ignore), other.
  - For a series or a creator: a detail is wrong (series: title, kind, status, dates, English description; creator: name, bio), a creator is missing from a series, an idea for a title rule, other.
  - "Other", and a missing creator who is not on Couchcrab yet, are done by hand: approving marks them as done.
  - A user can send at most 30 suggestions a day; a note has at most 1000 characters.
- Review queue: creator requests first, then the oldest suggestion first. Each item shows who sent it and their trust, the item, and a Before/After written out in words. Approve applies the change through the management tool (validated, logged in the history with the reviewer as the person and a link to the suggestion). Reject has an optional reason, "Ask a question" sends a message; the sender sees both on "My suggestions".
- Trust: approved suggestions minus rejected ones. From a threshold (configurable, default 10) the user list tells admins "Suggest promoting to editor". Promotion stays manual.
- Creator requests: a separate public form (linked in the footer) for a correction or the removal of a creator's videos, with or without an account (then with a contact email that only reviewers see). Always at the top of the review queue. Reviewers act on them by hand (for example the opt-out).
- History: every change (by a person, a rule, the sync or a verified creator) goes into an audit log. Editors and admins see it; editors can revert changes to content, admins also users and roles. A revert asks for confirmation, writes the earlier state back through the management tool and is itself a new history entry. It is refused when the thing changed again since, or no longer exists. Data that comes from YouTube is not reverted; the sync keeps it up to date. Reverting a creator unlinking or linking a channel is for admins.
- A public Community page explains how Couchcrab is maintained and how to help (text managed by admins as a site page), links to My suggestions and the review queue, and lists recent changes across all series with the same privacy rules as below.
- Every series has a public "About and history" page with its recent history. It names reviewers and verified creators, never the viewers who suggested something.

## Accessibility

WCAG 2.2 AA in every theme. See [ACCESSIBILITY.md](ACCESSIBILITY.md).

## Translations

All UI strings in message files, English as source, Dutch as the second language to prove the setup. Community texts (series descriptions, pages) can have translations per locale. Creator names and series titles are proper names and are not translated.

## Later

- A test group of fans who use a screen reader, captions or only a keyboard, after launch.
- Domain: couchcrab.com.
