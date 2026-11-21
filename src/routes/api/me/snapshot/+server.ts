import { error, json } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/guards.js';
import { db } from '#lib/server/db/index.js';
import {
	BadRequest,
	getAccountSnapshot,
	isSameOrigin,
	parsePrefsBody,
	readJson,
	saveAccountPrefs
} from '#lib/server/me.js';
import type { RequestHandler } from './$types';

const NO_STORE = { 'cache-control': 'private, no-store' };

/** The signed-in viewer's prefs (null when never saved) and progress, by YouTube id. */
export const GET: RequestHandler = ({ locals }) => {
	const user = requireUser(locals);
	return json(getAccountSnapshot(db, user.id), { headers: NO_STORE });
};

/** Replaces the prefs: `{ prefs }`, validated with the prefs schema. Same-origin only. */
export const PUT: RequestHandler = async ({ locals, request, url }) => {
	const user = requireUser(locals);
	if (!isSameOrigin(request, url)) error(403, 'Cross-site request refused');
	try {
		const prefs = saveAccountPrefs(db, user.id, parsePrefsBody(await readJson(request)));
		return json({ prefs }, { headers: NO_STORE });
	} catch (err) {
		if (err instanceof BadRequest) error(err.status, err.message);
		throw err;
	}
};
