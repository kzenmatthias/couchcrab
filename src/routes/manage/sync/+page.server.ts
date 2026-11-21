import { YOUTUBE_API_KEY } from '$app/env/private';
import { db } from '#lib/server/db/index.js';
import { flag } from '#lib/server/manage/core.js';
import { actorFor } from '#lib/server/manage/http.js';
import { syncNow, youtubeClientFor } from '#lib/server/manage/sync.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	actorFor(locals, 'admin');
	return { hasApiKey: Boolean(YOUTUBE_API_KEY) };
};

export const actions: Actions = {
	sync: async ({ locals, request }) => {
		const actor = actorFor(locals, 'admin');
		const form = await request.formData();
		const dryRun = flag(form, 'dry_run');
		try {
			const summary = await syncNow(db, actor, youtubeClientFor(YOUTUBE_API_KEY), { dryRun });
			return summary ? { summary } : { noKey: true };
		} catch (err) {
			return { failed: err instanceof Error ? err.message : String(err) };
		}
	}
};
