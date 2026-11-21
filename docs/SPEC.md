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
| Page | About, disclaimer, accessibility statement, privacy, creator requests intro |

There are no fixed creator groups (no "Hermits" vs "Friends"). A creator is simply listed; series show who takes part.

## Viewing

- **Home:** continue watching, new uploads from the creators you watch, series, your creators.
- **Series page:** header with poster art, POV bar (who you watch here, global or custom), sub-pages: mixed timeline, by creator, Extras, about and history.
- **Mixed timeline:** episodes of the chosen POVs sorted by upload date and grouped per week. Live series are grouped per session (groups made by the community). Uploads that no rule could place go to "Unsorted".
- **Creator page:** all series of a creator, links to their channels, latest uploads.
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

## Spoiler-free mode

Per series (and a default for new series). Unwatched episodes show a neutral card, the title becomes "Episode N", and the real title is hidden from screen readers too. "Show real title" reveals one episode.

## Community and moderation

- Sign-in: Discord only.
- Roles: viewer, editor, admin. At launch only the owner is admin and approves suggestions.
- Suggestions: anyone signed in can suggest an edit on a video, series, group, creator or rule. Editors and admins approve or reject.
- Trust: approved suggestions raise a user's trust; above a threshold (configurable) an admin can promote them to editor.
- Creator requests: a separate form, always at the top of the review queue.
- History: every change (by a person, a rule or the sync) goes into an audit log and can be reverted.

## Accessibility

WCAG 2.2 AA in every theme. See [ACCESSIBILITY.md](ACCESSIBILITY.md).

## Translations

All UI strings in message files, English as source, Dutch as the second language to prove the setup. Community texts (series descriptions, pages) can have translations per locale. Creator names and series titles are proper names and are not translated.

## Later

- A test group of fans who use a screen reader, captions or only a keyboard, after launch.
- Domain: couchcrab.com.
