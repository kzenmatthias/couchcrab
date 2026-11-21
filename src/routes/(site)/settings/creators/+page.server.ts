import { listCreators, listSeries, seriesCreatorList } from '#lib/server/catalog.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
	creators: listCreators(),
	series: listSeries().map((s) => ({
		id: s.id,
		slug: s.slug,
		title: s.title,
		poster: s.poster,
		creatorIds: seriesCreatorList(s.id).map((c) => c.id)
	}))
});
