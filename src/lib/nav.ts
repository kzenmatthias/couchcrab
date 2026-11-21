/**
 * Which navigation link is the current page. `resolve()` from `$app/paths` returns relative
 * hrefs in the server render (`../creator`), so hrefs are resolved against the page URL before
 * they are compared; otherwise the server HTML (and the page without JavaScript) would mark no
 * link as current.
 */

/** The parts of the page URL that are needed (`page.url` is a read-only URL). */
type PageUrl = { readonly href: string; readonly pathname: string };

/** The path an href points at, seen from `url`. */
export function hrefPath(href: string, url: PageUrl): string {
	return new URL(href, url.href).pathname;
}

/**
 * `page` when `url` is the link's page, `true` when it is below it (a section), else undefined.
 * With `exact`, only the page itself counts (a dashboard or a root link).
 */
export function navCurrent(
	href: string,
	url: PageUrl,
	{ exact = false }: { exact?: boolean } = {}
): 'page' | 'true' | undefined {
	const target = hrefPath(href, url);
	const path = url.pathname;
	if (path === target) return 'page';
	if (exact || target === '/') return undefined;
	return path.startsWith(target.endsWith('/') ? target : `${target}/`) ? 'true' : undefined;
}
