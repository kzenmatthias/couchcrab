import { seriesSessions, seriesVideos } from '#lib/server/catalog.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { series } = await parent();
	return {
		videos: seriesVideos(series.id),
		sessions: series.grouping === 'session' ? seriesSessions(series.id) : []
	};
};
