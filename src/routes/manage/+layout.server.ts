import { actorFor } from '#lib/server/manage/http.js';
import type { LayoutServerLoad } from './$types';

/** Editors and admins only; every page load and form action checks the role again. */
export const load: LayoutServerLoad = ({ locals }) => {
	const actor = actorFor(locals, 'editor');
	return {
		theme: locals.theme,
		manager: { name: locals.user!.name, role: actor.role as 'editor' | 'admin' }
	};
};
