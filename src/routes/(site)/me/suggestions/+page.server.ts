import { redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import { requireUser } from '#lib/server/auth/guards.js';
import { describeMySuggestions, trustCounts } from '#lib/server/community/review.js';
import { withdrawSuggestion } from '#lib/server/community/suggestions.js';
import { id as parseId, text } from '#lib/server/manage/core.js';
import { handleServiceError } from '#lib/server/manage/http.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.user) redirect(303, `/signin?redirect_to=${encodeURIComponent(url.pathname)}`);
	return {
		items: describeMySuggestions(db, locals.user.id),
		trust: trustCounts(db, [locals.user.id]).get(locals.user.id)!
	};
};

export const actions: Actions = {
	withdraw: async ({ locals, request }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		try {
			withdrawSuggestion(db, user.id, parseId(text(form, 'suggestion_id')) ?? 0);
		} catch (err) {
			return handleServiceError(err, form);
		}
		return { withdrawn: true as const };
	}
};
