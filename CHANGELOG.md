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

### Changed

- One creator list without fixed groups; creators are managed in the app.
- The Series and Creators links in the header now open the new list pages.
- Unsorted videos and creators who opted out are never shown on the public pages.
