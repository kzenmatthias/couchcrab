/** Slug fields for the management forms. */
import { SLUG_MAX, SLUG_RE, slugify } from '../../slug.js';
import type { Checker, Input } from './core.js';
import { text } from './core.js';

export { SLUG_MAX, SLUG_RE, slugify };

/** The first of `base`, `base-2`, `base-3`, ... for which `taken` is false. */
export function uniqueSlug(base: string, taken: (slug: string) => boolean): string {
	const root = base || 'item';
	if (!taken(root)) return root;
	for (let n = 2; ; n++) {
		const suffix = `-${n}`;
		const candidate = `${root.slice(0, SLUG_MAX - suffix.length).replace(/-+$/g, '')}${suffix}`;
		if (!taken(candidate)) return candidate;
	}
}

/**
 * Reads the `slug` field. Empty: generated from `name` and made unique. Given: must be a valid
 * slug that nobody else uses (`taken` gets the slug and should ignore the row being edited).
 */
export function slugField(
	c: Checker,
	input: Input,
	name: string,
	taken: (slug: string) => boolean
): string {
	const given = text(input, 'slug').toLowerCase();
	if (!given) return uniqueSlug(slugify(name), taken);
	if (given.length > SLUG_MAX) c.fail('slug', 'too_long');
	else if (!SLUG_RE.test(given)) c.fail('slug', 'invalid_slug');
	else if (taken(given)) c.fail('slug', 'slug_taken');
	return given;
}
