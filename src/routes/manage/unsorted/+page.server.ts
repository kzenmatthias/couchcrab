import { db } from '#lib/server/db/index.js';
import { id as parseId, NotFoundError, text } from '#lib/server/manage/core.js';
import { actorFor, handleServiceError, load as guarded } from '#lib/server/manage/http.js';
import { seriesChoices } from '#lib/server/manage/series.js';
import {
	groupChoices,
	listQueue,
	placeVideoByHand,
	setVideoStatus
} from '#lib/server/manage/videos.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const actor = actorFor(locals, 'editor');
	const status = url.searchParams.get('show') === 'ignored' ? 'ignored' : 'unsorted';
	return {
		status,
		videos: guarded(() => listQueue(db, actor, status)),
		series: seriesChoices(db),
		groups: groupChoices(db)
	} as const;
};

const videoId = (form: FormData) => {
	const n = parseId(text(form, 'video_id'));
	if (n === null) throw new NotFoundError();
	return n;
};

export const actions: Actions = {
	place: async ({ locals, request }) => {
		const actor = actorFor(locals, 'editor');
		const form = await request.formData();
		try {
			const row = placeVideoByHand(db, actor, videoId(form), form);
			return { done: 'placed' as const, title: row.title };
		} catch (err) {
			return handleServiceError(err, form, { videoId: parseId(text(form, 'video_id')) });
		}
	},
	ignore: async ({ locals, request }) => {
		const actor = actorFor(locals, 'editor');
		const form = await request.formData();
		try {
			const row = setVideoStatus(db, actor, videoId(form), 'ignored');
			return { done: 'ignored' as const, title: row.title };
		} catch (err) {
			return handleServiceError(err, form);
		}
	},
	unsort: async ({ locals, request }) => {
		const actor = actorFor(locals, 'editor');
		const form = await request.formData();
		try {
			const row = setVideoStatus(db, actor, videoId(form), 'unsorted');
			return { done: 'unsorted' as const, title: row.title };
		} catch (err) {
			return handleServiceError(err, form);
		}
	}
};
