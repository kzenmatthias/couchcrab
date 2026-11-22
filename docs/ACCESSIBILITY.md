# Accessibility

Many fans watch with captions, a screen reader, a keyboard, a switch device or large text. Couchcrab targets **WCAG 2.2 level AA** on every page and in every theme (dark, light, high contrast).

## Rules for every change

- **Semantic HTML first.** Real buttons, links, headings, lists, landmarks, labels. ARIA only where HTML has no equivalent.
- **Keyboard.** Everything works with Tab, Shift+Tab, Enter, Space and Escape. Focus is always visible (3 px outline). A skip link leads to the main content. Dialogs move focus in and return it on close.
- **Not colour alone.** States are written out: "Watching", "Watched", "62% watched", "Title hidden".
- **Contrast.** Text 4.5:1, large text and UI parts 3:1, in all three themes. Text on artwork always has a scrim.
- **No images of text.** Poster images are decorative (`alt=""`); titles are real text on top, on a scrim.
- **Motion.** Respect `prefers-reduced-motion` and the in-app setting. Nothing moves or plays by itself without a setting the user controls.
- **Autoplay.** Visible countdown that pauses on hover and focus, with "Play now" and "Cancel", announced once to screen readers. Can be turned off or set to "wait for me".
- **Captions.** Show the CC badge only for creator-made captions. Offer the filter and the "captions on by default" setting.
- **Shortcuts.** Single-key shortcuts can be turned off and changed (WCAG 2.1.4).
- **Targets.** Interactive targets at least 24 by 24 px, preferably 44.
- **Reflow.** No horizontal scrolling at 320 px wide and at 200% zoom, without hiding information.
- **Spoilers.** Hidden titles are hidden from screen readers as well.
- **Translations.** `lang` follows the active locale; text must survive longer translations without clipping.

## How we test

- `npm run test:e2e` runs axe-core on the main pages in all three themes with reduced motion.
- Keyboard walk-through of the changed flow.
- Check at 320 px width and at 200% zoom.
- Screen reader checks (NVDA, VoiceOver) are done by people. After launch we want a test group of fans who rely on assistive technology.

## What we can't fix

The YouTube player and the captions inside videos belong to YouTube and the creators. The accessibility statement on the site says so and links to "Report an accessibility problem".
