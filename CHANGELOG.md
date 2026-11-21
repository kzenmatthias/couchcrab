# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Project documentation: README, product spec, architecture, accessibility rules, contributing guide.
- Design board with screenshots of every main screen.
- SvelteKit app with the app shell on every public page: skip link, header with the "Unofficial" label, main navigation and search field, a dismissible first-visit notice and a footer with the disclaimer and links to the site pages.
- Dark, light and high contrast themes with a System default, chosen in the footer.
- English and Dutch interface. The language follows your browser and can be changed in the footer.
- Site pages (About, Disclaimer, Accessibility statement) managed in the database, with English as fallback.
- Home page listing the series with generated poster art.
- Demo data (`npm run db:seed`) with fictional creators, series and videos.
- Data model for creators who claim their profile by signing in with Google (claims, verified channels, opt-out).
- Automated accessibility checks (axe, WCAG 2.2 AA) in all three themes.
- Designs for signing in, claiming a creator profile with Google and the creator dashboard.
- YouTube sync (`npm run sync`): fetches new uploads of every synced channel, sorts them into series and Extras with the title rules (or Unsorted), skips Shorts, upcoming streams and opted-out creators, logs every change in the history and refreshes stored YouTube data within 25 days. Supports `--channel`, `--dry-run` and `--refresh-only`.
- Home page with a featured series, and rows of new uploads, series and creators. Rows scroll with Tab or with labelled back and forward buttons.
- Series list and series pages with a mixed timeline grouped per week (or per session for live series), a by-creator view, Extras with livestream VODs and an About page.
- Creator list and creator pages with their YouTube channels, the "Verified creator" badge, their series and latest uploads.
- Watch page with the YouTube player (privacy-enhanced mode), a "Watch on YouTube" link and the rest of the week or session as a queue.
- Episode cards with the duration written out for screen readers and a CC badge for creator-made captions.
- Sign in with Discord (viewers and editors) or Google (creators), with server-side sessions that last 30 days. Signing in with the other service while signed in links both to one account.
- Sign-in page that explains both paths and what Couchcrab asks YouTube and keeps. Without keys on the server the buttons are disabled with an explanation.
- Creators claim their profile: after Google sign-in Couchcrab lists the YouTube channels the account owns, a matching creator can be claimed at once (Verified creator) and other channels go to review.
- Account menu in the header with the theme, links to your settings, the creator dashboard for claimed creators and Sign out. It works with the keyboard and without JavaScript.
- Who I watch (`/settings/creators`): pick the creators whose POV you want, with search, select all and clear all. Each series follows that list or uses its own; the series page shows a POV bar with "Change creators" and "Reset to global list". Home, timelines, by-creator views and Extras only show the creators you watch, already in the server render.
- Spoiler-free mode per series (and a default for new series): unwatched episodes get a neutral card titled "Episode N" with a "Title hidden" badge, and the real title is left out of the page. The watch page has "Show real title".
- Watch progress in this browser: "Watched" and "62% watched" badges on cards, a "Continue watching" row on home and a "Mark as watched" button. A video counts as watched from 90%.
- Autoplay countdown at the end of a video, with "Play now" and "Cancel", paused while hovered or focused, announced once to screen readers, or "Wait for me" without counting.
- Display & accessibility settings (`/settings/display`): text size, animations, underlined links, text-only lists, autoplay and countdown, captions on by default with a preferred language, only episodes with creator captions, and single-key shortcuts (N, S, M) that can be changed or turned off.
- Signed in, Who I watch, spoiler-free mode, display settings and watch progress are kept in your account and follow you to other browsers. On the first sign-in in a browser, what you chose there is merged into the account, so nothing is lost. Signing out keeps the copy in the browser.
- Management tool at `/manage` for editors and admins, with its own navigation and a link back to the site: a dashboard with counts and the last sync per channel; creators (search, slug from the name, colour with a contrast-checked avatar preview, claimed profiles protected, delete only without videos); channels (add by channel id, `@handle` or URL, looked up on YouTube when there is an API key); series (participants, descriptions per language, poster palette and motif with a live preview, Extras series, sessions and manual weeks); title rules per series with "Test this rule" and "Apply rules to unsorted videos" (dry run first); the Unsorted queue (place by hand or ignore).
- For admins: site pages (About, Disclaimer, Accessibility statement, Privacy) in Markdown per language with a preview, the first-visit notice and footer disclaimer per language, users and roles (the last admin cannot be demoted), the creator claims review queue and "Sync now" with a dry run.
- Every change in the management tool is checked on the server and written to the history with before and after.
- `npm run make-admin -- <user id>` makes a user admin.
- A Privacy page and a link to it in the footer.
- Creator dashboard (`/creator`) for creators who claimed their profile: edit your bio, avatar, profile colour (choices that keep your initials readable, with a preview) and links; see your channels as verified or needing review, unlink a second channel or add another one through Google sign-in; place your own videos in the series you take part in (or their Extras, with a session or week) or ignore them, with your unsorted uploads first; and hide your profile and all your videos from Couchcrab, with a confirmation step and undo. Every change is checked on the server and kept in the history as made by the creator.
- Creator pages show the links a creator added.
- The account menu links to the management tool for editors and admins.
- In the management tool, a creator's page says when the creator last edited their own profile.

### Changed

- The theme switch moved from the footer to the account menu.
- Signed out, the header shows a Menu with the theme, links to your settings and Sign in, so everyone can pick a theme in one place.
- One creator list without fixed groups; creators are managed in the app.
- The Series and Creators links in the header now open the new list pages.
- Unsorted videos and creators who opted out are never shown on the public pages.

### Fixed

- Creator pages show the real title of watched episodes in spoiler-free series, like the episode cards.
- The first-visit notice and the footer disclaimer come from the site texts managed in the app, with English and then the built-in text as fallback.
