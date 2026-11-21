import { error, json } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/guards.js';
import { db } from '#lib/server/db/index.js';
import {
	BadRequest,
	isSameOrigin,
	parseProgressBody,
	readJson,
	saveAccountProgress
} from '#lib/server/me.js';
import type { RequestHandler } from './$types';

/** Saves a batch of progress entries: `{ entries: { [youtubeId]: entry } }`. Same-origin only. */
export const POST: RequestHandler = async ({ locals, request, url }) => {
	const user = requireUser(locals);
	if (!isSameOrigin(request, url)) error(403, 'Cross-site request refused');
	try {
		const saved = saveAccountProgress(db, user.id, parseProgressBody(await readJson(request)));
		return json({ saved }, { headers: { 'cache-control': 'private, no-store' } });
	} catch (err) {
		if (err instanceof BadRequest) error(err.status, err.message);
		throw err;
	}
};
