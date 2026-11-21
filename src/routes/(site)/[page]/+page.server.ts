import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getLocale } from '#lib/paraglide/runtime.js';
import { pickTranslation } from '#lib/i18n.js';
import { db, schema } from '#lib/server/db/index.js';
import { renderMarkdown } from '#lib/server/markdown.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const rows = db
		.select({
			locale: schema.pageTranslations.locale,
			title: schema.pageTranslations.title,
			body: schema.pageTranslations.body
		})
		.from(schema.pages)
		.innerJoin(schema.pageTranslations, eq(schema.pageTranslations.pageId, schema.pages.id))
		.where(eq(schema.pages.slug, params.page))
		.all();

	const picked = pickTranslation(rows, getLocale());
	if (!picked) error(404, 'Not found');

	return {
		title: picked.value.title,
		html: renderMarkdown(picked.value.body),
		contentLocale: picked.value.locale,
		isFallback: picked.isFallback
	};
};
