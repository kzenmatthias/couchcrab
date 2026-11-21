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

### Changed

- One creator list without fixed groups; creators are managed in the app.
