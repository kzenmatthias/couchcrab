import { db } from '#lib/server/db/index.js';
import { id as parseId, NotFoundError, text } from '#lib/server/manage/core.js';
import { creatorActorFor } from '#lib/server/manage/creator-http.js';
import {
	listOwnVideos,
	ownPlacementChoices,
	parseVideoFilter,
	placeOwnVideo,
	setOwnVideoStatus
} from '#lib/server/manage/creator-self.js';
import { handleServiceError, load as guarded } from '#lib/server/manage/http.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const actor = creatorActorFor(locals);
	const filter = parseVideoFilter(url.searchParams);
	const choices = guarded(() => ownPlacementChoices(db, actor));
	return {
		filter,
		videos: guarded(() => listOwnVideos(db, actor, filter)),
		...choices
	};
};

const videoId = (form: FormData) => {
	const n = parseId(text(form, 'video_id'));
	if (n === null) throw new NotFoundError();
	return n;
};

export const actions: Actions = {
	place: async ({ locals, request }) => {
		const actor = creatorActorFor(locals);
		const form = await request.formData();
		try {
			const row = placeOwnVideo(db, actor, videoId(form), form);
			return { done: 'placed' as const, title: row.title };
		} catch (err) {
			return handleServiceError(err, form, { videoId: parseId(text(form, 'video_id')) });
		}
	},
	ignore: async ({ locals, request }) => {
		const actor = creatorActorFor(locals);
		const form = await request.formData();
		try {
			const row = setOwnVideoStatus(db, actor, videoId(form), 'ignored');
			return { done: 'ignored' as const, title: row.title };
		} catch (err) {
			return handleServiceError(err, form);
		}
	},
	unsort: async ({ locals, request }) => {
		const actor = creatorActorFor(locals);
		const form = await request.formData();
		try {
			const row = setOwnVideoStatus(db, actor, videoId(form), 'unsorted');
			return { done: 'unsorted' as const, title: row.title };
		} catch (err) {
			return handleServiceError(err, form);
		}
	}
};
