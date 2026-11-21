import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
	theme: locals.theme,
	user: locals.user
		? {
				name: locals.user.name,
				avatarUrl: locals.user.avatarUrl,
				creatorId: locals.user.creatorId,
				role: locals.user.role
			}
		: null
});
