import { error } from '@sveltejs/kit';
import { MIRROR_COOKIE, parseMirror } from '#lib/prefs/mirror.js';
import { getCreatorBySlug } from '#lib/server/catalog.js';
import { redactForViewer } from '#lib/viewing.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, cookies }) => {
	const data = getCreatorBySlug(params.slug);
	if (!data) error(404, 'Not found');
	// A creator page lists everything of that creator, but spoiler-free series keep their secrets.
	return {
		...data,
		uploads: redactForViewer(data.uploads, parseMirror(cookies.get(MIRROR_COOKIE)))
	};
};
