import { seriesVideos } from '#lib/server/catalog.js';
import { MIRROR_COOKIE, parseMirror } from '#lib/prefs/mirror.js';
import { forViewer } from '#lib/viewing.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, cookies }) => {
	const { series } = await parent();
	const mirror = parseMirror(cookies.get(MIRROR_COOKIE));
	return { videos: forViewer(seriesVideos(series.id), mirror) };
};
