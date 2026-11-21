import { error } from '@sveltejs/kit';
import { getLocale } from '#lib/paraglide/runtime.js';
import { getSeriesBySlug, seriesCreatorList, seriesDescription } from '#lib/server/catalog.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ params }) => {
	const series = getSeriesBySlug(params.slug);
	if (!series) error(404, 'Not found');
	return {
		series,
		creators: seriesCreatorList(series.id),
		description: seriesDescription(series.id, getLocale())
	};
};
