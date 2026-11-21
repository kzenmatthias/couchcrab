import { db } from '#lib/server/db/index.js';
import { actorFor, load as guarded } from '#lib/server/manage/http.js';
import { listSeries } from '#lib/server/manage/series.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const actor = actorFor(locals, 'editor');
	return { series: guarded(() => listSeries(db, actor)) };
};
