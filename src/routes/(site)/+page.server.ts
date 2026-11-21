import { getLocale } from '#lib/paraglide/runtime.js';
import {
	featuredSeries,
	latestVideos,
	listCreators,
	listSeries,
	seriesDescription
} from '#lib/server/catalog.js';
import { MIRROR_COOKIE, parseMirror } from '#lib/prefs/mirror.js';
import { isShown, redactForViewer } from '#lib/viewing.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ cookies }) => {
	const mirror = parseMirror(cookies.get(MIRROR_COOKIE));
	const series = listSeries();
	const featured = featuredSeries(series);
	return {
		featured: featured
			? { ...featured, description: seriesDescription(featured.id, getLocale()) }
			: null,
		latest: redactForViewer(
			latestVideos(12, (v) => isShown(mirror, v)),
			mirror
		),
		series,
		creators: listCreators()
	};
};
