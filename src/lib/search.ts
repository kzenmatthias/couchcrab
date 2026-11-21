/**
 * Search matching: case- and accent-insensitive, every word of the query must appear in one of
 * the fields. Pure functions, used by the catalog search and unit tested.
 */

/** The longest query that is searched; the rest is ignored. */
export const SEARCH_QUERY_MAX = 100;

/** Lower case, accents removed (é → e, ß → ss), punctuation as spaces, single spaces. */
export function normalizeSearch(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/\p{M}+/gu, '')
		.toLocaleLowerCase('en')
		.replace(/ß/g, 'ss')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

/** The normalised words of a query (at most `SEARCH_QUERY_MAX` characters, no duplicates). */
export function searchTerms(query: string): string[] {
	const words = normalizeSearch(query.slice(0, SEARCH_QUERY_MAX)).split(' ').filter(Boolean);
	return [...new Set(words)];
}

/**
 * True when every term appears in at least one of the fields (already normalised with
 * `normalizeSearch`). A query without terms matches nothing.
 */
export function matchesTerms(terms: readonly string[], fields: readonly string[]): boolean {
	if (terms.length === 0) return false;
	return terms.every((term) => fields.some((field) => field.includes(term)));
}

/**
 * A rank for sorting, lower is better: 0 when the field starts with the whole query, 1 when a
 * word in it does, 2 otherwise.
 */
export function matchRank(terms: readonly string[], field: string): number {
	const phrase = terms.join(' ');
	if (field.startsWith(phrase)) return 0;
	if (` ${field}`.includes(` ${terms[0]}`)) return 1;
	return 2;
}
