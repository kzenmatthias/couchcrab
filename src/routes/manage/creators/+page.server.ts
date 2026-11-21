import { db } from '#lib/server/db/index.js';
import { listCreators } from '#lib/server/manage/creators.js';
import { actorFor, load as guarded } from '#lib/server/manage/http.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const actor = actorFor(locals, 'editor');
	const q = url.searchParams.get('q') ?? '';
	return { q, creators: guarded(() => listCreators(db, actor, q)) };
};
