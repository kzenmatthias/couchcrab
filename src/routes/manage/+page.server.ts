import { db } from '#lib/server/db/index.js';
import { dashboard } from '#lib/server/manage/dashboard.js';
import { pendingCounts } from '#lib/server/community/review.js';
import { actorFor, load as guarded } from '#lib/server/manage/http.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const actor = actorFor(locals, 'editor');
	return guarded(() => ({ ...dashboard(db, actor), review: pendingCounts(db, actor) }));
};
