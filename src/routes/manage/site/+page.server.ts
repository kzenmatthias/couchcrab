import { locales } from '#lib/paraglide/runtime.js';
import { db } from '#lib/server/db/index.js';
import { actorFor, handleServiceError, load as guarded } from '#lib/server/manage/http.js';
import { getSiteTexts, listPages, updateSiteTexts } from '#lib/server/manage/site.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const actor = actorFor(locals, 'admin');
	return guarded(() => ({ texts: getSiteTexts(db, actor), pages: listPages(db, actor) }));
};

export const actions: Actions = {
	texts: async ({ locals, request }) => {
		const actor = actorFor(locals, 'admin');
		const form = await request.formData();
		try {
			updateSiteTexts(db, actor, form, locales);
		} catch (err) {
			return handleServiceError(err, form);
		}
		return { saved: true };
	}
};
