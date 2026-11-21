import { locales } from '#lib/paraglide/runtime.js';
import { db } from '#lib/server/db/index.js';
import { listCreators } from '#lib/server/manage/creators.js';
import { actorFor, handleServiceError, load as guarded, paramId } from '#lib/server/manage/http.js';
import { createExtras, updateSeries } from '#lib/server/manage/series.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const actor = actorFor(locals, 'editor');
	return {
		creators: guarded(() => listCreators(db, actor)),
		saved: url.searchParams.get('saved') === '1'
	};
};

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		const actor = actorFor(locals, 'editor');
		const form = await request.formData();
		try {
			updateSeries(db, actor, paramId(params.id), form, locales);
		} catch (err) {
			return handleServiceError(err, form, { action: 'save' });
		}
		return { saved: 'series' as const };
	},

	createExtras: ({ locals, params }) => {
		const actor = actorFor(locals, 'editor');
		try {
			const extras = createExtras(db, actor, paramId(params.id));
			return { saved: 'extras' as const, extrasId: extras.id };
		} catch (err) {
			return handleServiceError(err, undefined, { action: 'extras' });
		}
	}
};
