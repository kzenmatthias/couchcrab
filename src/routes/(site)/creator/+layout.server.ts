import type { LayoutServerLoad } from './$types';

/**
 * Only says whether to show the dashboard navigation. The checks are in every page load and
 * action (`creatorActorFor`), so a 403 renders this section's error page inside the layout.
 */
export const load: LayoutServerLoad = ({ locals }) => ({
	isCreator: locals.user?.creatorId != null
});
