import { locales } from '#lib/paraglide/runtime.js';
import { db } from '#lib/server/db/index.js';
import { listCreators } from '#lib/server/manage/creators.js';
import { actorFor, handleServiceError, load as guarded, paramId } from '#lib/server/manage/http.js';
import { createExtras, posterVideoChoices, updateSeries } from '#lib/server/manage/series.js';
import { resolvePoster } from '#lib/server/posters.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, parent }) => {
	const actor = actorFor(locals, 'editor');
	const { detail } = await parent();
	const s = detail.series;
	return {
		creators: guarded(() => listCreators(db, actor)),
		posterVideos: guarded(() => posterVideoChoices(db, actor, s.id)).map((v) => ({
			youtubeVideoId: v.youtubeVideoId,
			title: v.title,
			creator: v.creator
		})),
		// What "Automatic" shows now: resolved as if nothing was chosen.
		autoPoster: resolvePoster(db, { id: s.id, parentId: s.parentId, poster: null }),
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
