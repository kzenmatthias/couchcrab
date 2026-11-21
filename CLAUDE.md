# Couchcrab: notes for coding agents

Read README.md, docs/SPEC.md, docs/ARCHITECTURE.md and docs/ACCESSIBILITY.md before changing code. The design board is docs/design/index.html (open it in a browser; screenshots in docs/design/screens).

## Rules

- Stack: SvelteKit (Svelte 5 runes, TypeScript strict), Drizzle + better-sqlite3, Paraglide JS, Vitest, Playwright + @axe-core/playwright. Node 22.
- Public open-source repo (AGPL-3.0): code, comments, commit messages and docs in English. Never commit secrets, personal data, internal hostnames or model names.
- Conventional Commits. Add a line under "Unreleased" in CHANGELOG.md for user-facing changes.
- Branch from `develop`, PRs target `develop`.
- No user-facing string outside `messages/*.json`. Use `m.key()`. Keep `en.json` and `nl.json` in sync.
- No hard-coded creators, series or site texts in code. Demo data only in the seed script.
- Accessibility rules in docs/ACCESSIBILITY.md are requirements. UI work must pass the axe e2e test in all three themes.
- Never download or re-host YouTube video. Playback only through the IFrame player.
- Keep the "Unofficial" label, first-visit notice and footer disclaimer on every public page.
- Before finishing: `npm run check`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` when UI changed.
