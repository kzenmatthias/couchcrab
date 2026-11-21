import { error } from '@sveltejs/kit';
import { seriesSessions, seriesVideos } from '#lib/server/catalog.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { series } = await parent();
	const extras = series.extras;
	if (!extras) error(404, 'Not found');
	return {
		extras,
		videos: seriesVideos(extras.id),
		sessions: extras.grouping === 'session' ? seriesSessions(extras.id) : []
	};
};
