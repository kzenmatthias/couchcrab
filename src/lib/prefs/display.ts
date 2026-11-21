/**
 * Display settings as attributes on `<html>`, read by the CSS in base.css:
 * `data-text-size` (large, larger), `data-motion` (reduce, allow), `data-underline-links`
 * and `data-text-only`. The inline script in src/app.html does the same before first paint.
 */
import type { Prefs } from './schema.js';

export function applyDisplay(root: HTMLElement, display: Prefs['display']) {
	const set = (name: string, value: string | null) => {
		if (value === null) delete root.dataset[name];
		else root.dataset[name] = value;
	};
	set('textSize', display.textSize === 'default' ? null : display.textSize);
	set('motion', display.motion === 'system' ? null : display.motion);
	set('underlineLinks', display.underlineLinks ? 'on' : null);
	set('textOnly', display.textOnly ? 'on' : null);
}
