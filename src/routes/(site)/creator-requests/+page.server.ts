import { db } from '#lib/server/db/index.js';
import {
	createCreatorRequest,
	EMAIL_MAX,
	REQUEST_DETAILS_MAX
} from '#lib/server/community/suggestions.js';
import { publicCreators } from '#lib/server/community/targets.js';
import { handleServiceError } from '#lib/server/manage/http.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({
	signedInAs: locals.user?.name ?? null,
	creators: publicCreators(db),
	detailsMax: REQUEST_DETAILS_MAX,
	emailMax: EMAIL_MAX
});

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const form = await request.formData();
		try {
			createCreatorRequest(db, locals.user?.id ?? null, form);
		} catch (err) {
			return handleServiceError(err, form);
		}
		return { sent: true as const };
	}
};
