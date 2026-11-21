# Contributing to Couchcrab

Thanks for helping! Couchcrab is a fan project run by volunteers. Every kind of help counts: code, translations, accessibility testing, design feedback, bug reports and data fixes.

## Fixing data (no code needed)

A video in the wrong season, a missing session, a wrong CC badge? Use **Suggest an edit** on the site. Data lives in the app, not in this repository.

## Reporting bugs and ideas

Open an [issue](https://github.com/kzenmatthias/couchcrab/issues/new/choose) with the template that fits. For accessibility problems, tell us what you use (screen reader, zoom, keyboard only, ...) and what happened.

## Working on the code

1. Fork the repo and clone your fork.
2. Follow [Getting started](README.md#getting-started). The demo data means you don't need any API keys.
3. Create a branch from `develop`: `feat/short-name` or `fix/short-name`.
4. Make your change, with tests where it makes sense.
5. Run `npm run check && npm run lint && npm test` (and `npm run test:e2e` for UI changes).
6. Add a line to `CHANGELOG.md` under **Unreleased**.
7. Open a pull request against `develop` and fill in the template.

`main` holds released code. All pull requests go to `develop`.

### Conventions

- **Language:** code, comments, commits and docs in English.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org), for example `feat(timeline): group live series per session`.
- **No hard-coded UI text.** Every user-facing string goes in `messages/en.json` and is used through Paraglide (`m.key()`).
- **No hard-coded content.** Creators, series and texts come from the database.
- **Accessibility** follows [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md). UI changes without keyboard support or with contrast failures won't be merged.
- **Keep pull requests small** and about one thing.

## Translating

1. Copy `messages/en.json` to `messages/<locale>.json` (for example `de.json`).
2. Translate the values, keep the keys. Keep `{placeholders}` as they are.
3. Add the locale to `project.inlang/settings.json`.
4. Run `npm run dev` and check your language with the language switch. Look for text that gets cut off.
5. Open a pull request.

Partial translations are fine; missing keys fall back to English.

## Code of Conduct

Be kind. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
