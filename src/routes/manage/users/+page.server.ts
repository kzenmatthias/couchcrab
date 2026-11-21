import { PROMOTE_TRUST_THRESHOLD } from '$app/env/private';
import { db } from '#lib/server/db/index.js';
import { promotionCandidates, trustCounts } from '#lib/server/community/review.js';
import { id as parseId, NotFoundError, text } from '#lib/server/manage/core.js';
import { actorFor, handleServiceError, load as guarded } from '#lib/server/manage/http.js';
import { listUsers, setUserRole } from '#lib/server/manage/users.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const actor = actorFor(locals, 'admin');
	const q = url.searchParams.get('q') ?? '';
	const users = guarded(() => listUsers(db, actor, q));
	const threshold = PROMOTE_TRUST_THRESHOLD ?? 10;
	const trust = trustCounts(
		db,
		users.map((u) => u.id)
	);
	const promote = promotionCandidates(db, actor, threshold);
	return {
		q,
		me: actor.id,
		threshold,
		users: users.map((u) => ({ ...u, trust: trust.get(u.id)!, promote: promote.has(u.id) }))
	};
};

export const actions: Actions = {
	role: async ({ locals, request }) => {
		const actor = actorFor(locals, 'admin');
		const form = await request.formData();
		const userId = parseId(text(form, 'user_id'));
		try {
			if (userId === null) throw new NotFoundError();
			setUserRole(db, actor, userId, form);
		} catch (err) {
			return handleServiceError(err, form, { userId });
		}
		return { saved: userId };
	}
};
