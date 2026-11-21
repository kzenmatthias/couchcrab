import { error } from '@sveltejs/kit';
import { seriesSessions, seriesVideos } from '#lib/server/catalog.js';
import { MIRROR_COOKIE, parseMirror } from '#lib/prefs/mirror.js';
import { forViewer } from '#lib/viewing.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, cookies }) => {
	const { series } = await parent();
	const mirror = parseMirror(cookies.get(MIRROR_COOKIE));
	const extras = series.extras;
	if (!extras) error(404, 'Not found');
	return {
		extras,
		videos: forViewer(seriesVideos(extras.id), mirror),
		sessions: extras.grouping === 'session' ? seriesSessions(extras.id) : []
	};
};
