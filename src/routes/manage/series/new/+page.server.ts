import { redirect } from '@sveltejs/kit';
import { locales } from '#lib/paraglide/runtime.js';
import { db } from '#lib/server/db/index.js';
import { listCreators } from '#lib/server/manage/creators.js';
import { actorFor, handleServiceError, load as guarded } from '#lib/server/manage/http.js';
import { createSeries } from '#lib/server/manage/series.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const actor = actorFor(locals, 'editor');
	return { creators: guarded(() => listCreators(db, actor)) };
};

export const actions: Actions = {
	save: async ({ locals, request }) => {
		const actor = actorFor(locals, 'editor');
		const form = await request.formData();
		let id: number;
		try {
			id = createSeries(db, actor, form, locales).id;
		} catch (err) {
			return handleServiceError(err, form);
		}
		redirect(303, `/manage/series/${id}?saved=1`);
	}
};
