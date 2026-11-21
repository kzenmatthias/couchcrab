import { db } from '#lib/server/db/index.js';
import { actorFor, load as guarded, paramId } from '#lib/server/manage/http.js';
import { getSeries } from '#lib/server/manage/series.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, params }) => {
	const actor = actorFor(locals, 'editor');
	const detail = guarded(() => getSeries(db, actor, paramId(params.id)));
	return { detail };
};
