import { eq } from 'drizzle-orm';
import { getLocale } from '#lib/paraglide/runtime.js';
import { pickTranslation } from '#lib/i18n.js';
import { MIRROR_COOKIE, parseMirror } from '#lib/prefs/mirror.js';
import { publicRecentHistory } from '#lib/server/community/history.js';
import { db, schema } from '#lib/server/db/index.js';
import { renderMarkdown } from '#lib/server/markdown.js';
import { isSpoilerFree } from '#lib/viewing.js';
import type { PageServerLoad } from './$types';

/**
 * The community page: the managed `community` page (Markdown, sanitised), links for the
 * signed-in user and reviewers, and the recent public history across all series.
 */
export const load: PageServerLoad = ({ cookies, locals }) => {
	const rows = db
		.select({
			locale: schema.pageTranslations.locale,
			title: schema.pageTranslations.title,
			body: schema.pageTranslations.body
		})
		.from(schema.pages)
		.innerJoin(schema.pageTranslations, eq(schema.pageTranslations.pageId, schema.pages.id))
		.where(eq(schema.pages.slug, 'community'))
		.all();
	const picked = pickTranslation(rows, getLocale());
	const mirror = parseMirror(cookies.get(MIRROR_COOKIE));
	const role = locals.user?.role ?? null;

	return {
		content: picked
			? {
					title: picked.value.title,
					html: renderMarkdown(picked.value.body),
					locale: picked.value.locale,
					isFallback: picked.isFallback
				}
			: null,
		signedIn: locals.user !== null,
		isReviewer: role === 'editor' || role === 'admin',
		recent: publicRecentHistory(db, { isSpoilerFree: (id) => isSpoilerFree(mirror, id) })
	};
};
