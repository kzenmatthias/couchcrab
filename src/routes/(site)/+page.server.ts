import { getLocale } from '#lib/paraglide/runtime.js';
import {
	featuredSeries,
	latestVideos,
	listCreators,
	listSeries,
	seriesDescription
} from '#lib/server/catalog.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const series = listSeries();
	const featured = featuredSeries(series);
	return {
		featured: featured
			? { ...featured, description: seriesDescription(featured.id, getLocale()) }
			: null,
		latest: latestVideos(12),
		series,
		creators: listCreators()
	};
};
