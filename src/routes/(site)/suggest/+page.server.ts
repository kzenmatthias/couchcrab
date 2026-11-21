import { redirect } from '@sveltejs/kit';
import { MIRROR_COOKIE, parseMirror } from '#lib/prefs/mirror.js';
import { db } from '#lib/server/db/index.js';
import { trustCounts } from '#lib/server/community/review.js';
import { createSuggestion, NOTE_MAX } from '#lib/server/community/suggestions.js';
import { loadTarget } from '#lib/server/community/targets.js';
import { requireUser } from '#lib/server/auth/guards.js';
import { handleServiceError } from '#lib/server/manage/http.js';
import { isSpoilerFree } from '#lib/viewing.js';
import type { Actions, PageServerLoad } from './$types';

/** `?video=<YouTube id>`, `?series=<slug>` or `?creator=<slug>`. */
function targetParam(url: URL): { type: string; key: string } {
	for (const type of ['video', 'series', 'creator']) {
		const key = url.searchParams.get(type);
		if (key) return { type, key };
	}
	return { type: '', key: '' };
}

export const load: PageServerLoad = ({ locals, url, cookies }) => {
	// Signed out: sign in first, then come back here.
	if (!locals.user)
		redirect(303, `/signin?redirect_to=${encodeURIComponent(url.pathname + url.search)}`);
	const { type, key } = targetParam(url);
	const found = loadTarget(db, type, key);
	const trust = trustCounts(db, [locals.user.id]).get(locals.user.id)!;
	if (!found) return { target: null, trust, noteMax: NOTE_MAX };
	if (found.type === 'video') {
		// Spoiler-free series keep the title out of this page too.
		const parent = found.series.find((s) => s.id === found.seriesId)?.parentId ?? null;
		if (isSpoilerFree(parseMirror(cookies.get(MIRROR_COOKIE)), parent ?? found.seriesId))
			return { target: { ...found, title: '' }, trust, noteMax: NOTE_MAX };
	}
	return { target: found, trust, noteMax: NOTE_MAX };
};

export const actions: Actions = {
	default: async ({ locals, request, url }) => {
		const user = requireUser(locals);
		const form = await request.formData();
		const { type, key } = targetParam(url);
		try {
			createSuggestion(db, user.id, type, key, form);
		} catch (err) {
			return handleServiceError(err, form);
		}
		return { sent: true as const };
	}
};
