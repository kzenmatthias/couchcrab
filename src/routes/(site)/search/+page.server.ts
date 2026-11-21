import { MIRROR_COOKIE, parseMirror } from '#lib/prefs/mirror.js';
import { SEARCH_SECTIONS, searchCatalog, type SearchSection } from '#lib/server/catalog.js';
import { SEARCH_QUERY_MAX } from '#lib/search.js';
import { isSpoilerFree } from '#lib/viewing.js';
import type { PageServerLoad } from './$types';

const isSection = (value: string): value is SearchSection =>
	(SEARCH_SECTIONS as readonly string[]).includes(value);

/**
 * `/search?q=…`: series, creators and episodes. `more=<section>` (repeatable) shows all results
 * of a section. Spoiler-free series from the viewing cookie keep their episode titles hidden,
 * also from the search itself.
 */
export const load: PageServerLoad = ({ url, cookies }) => {
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, SEARCH_QUERY_MAX);
	const expand = [...new Set(url.searchParams.getAll('more').filter(isSection))];
	const mirror = parseMirror(cookies.get(MIRROR_COOKIE));
	const results = searchCatalog(q, {
		isSpoilerFree: (id) => isSpoilerFree(mirror, id),
		expand
	});
	return { q, expand, results };
};
