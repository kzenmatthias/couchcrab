import { locales } from '#lib/paraglide/runtime.js';
import { db } from '#lib/server/db/index.js';
import { text } from '#lib/server/manage/core.js';
import {
	actorFor,
	formValues,
	handleServiceError,
	load as guarded
} from '#lib/server/manage/http.js';
import { getPage, previewMarkdown, updatePage } from '#lib/server/manage/site.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const actor = actorFor(locals, 'admin');
	return { page: guarded(() => getPage(db, actor, params.slug)) };
};

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		const actor = actorFor(locals, 'admin');
		const form = await request.formData();
		try {
			updatePage(db, actor, params.slug, form, locales);
		} catch (err) {
			return handleServiceError(err, form);
		}
		return { saved: true };
	},
	/** Renders the Markdown of one locale as the public page would, without saving. */
	preview: async ({ locals, request }) => {
		const actor = actorFor(locals, 'admin');
		const form = await request.formData();
		const locale = text(form, 'preview_locale');
		const lang = (locales as readonly string[]).includes(locale) ? locale : 'en';
		return {
			preview: { locale: lang, html: previewMarkdown(actor, text(form, `body_${lang}`)) },
			values: formValues(form)
		};
	}
};
