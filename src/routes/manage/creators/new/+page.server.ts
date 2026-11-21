import { redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import { createCreator } from '#lib/server/manage/creators.js';
import { actorFor, handleServiceError } from '#lib/server/manage/http.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	actorFor(locals, 'editor');
	return {};
};

export const actions: Actions = {
	save: async ({ locals, request }) => {
		const actor = actorFor(locals, 'editor');
		const form = await request.formData();
		let id: number;
		try {
			id = createCreator(db, actor, form).id;
		} catch (err) {
			return handleServiceError(err, form);
		}
		redirect(303, `/manage/creators/${id}?saved=1`);
	}
};
