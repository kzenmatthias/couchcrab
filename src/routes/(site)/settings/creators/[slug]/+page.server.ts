import { error } from '@sveltejs/kit';
import { getSeriesBySlug, seriesCreatorList } from '#lib/server/catalog.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const series = getSeriesBySlug(params.slug);
	// Extras follow the list of their parent series, so they have no picker of their own.
	if (!series || series.parent) error(404, 'Not found');
	return {
		series: { id: series.id, slug: series.slug, title: series.title },
		creators: seriesCreatorList(series.id)
	};
};
