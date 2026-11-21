import { error, json } from '@sveltejs/kit';
import { videosByYoutubeIds } from '#lib/server/catalog.js';
import { API_MAX_IDS } from '#lib/prefs/store.svelte.js';
import type { RequestHandler } from './$types';

const ID = /^[A-Za-z0-9_-]{6,20}$/;

/**
 * Public episode cards by YouTube id: `?ids=a,b,c` (at most 50). Used in the browser for
 * Continue watching and for revealing titles of spoiler-free episodes. Only public data.
 */
export const GET: RequestHandler = ({ url }) => {
	const ids = (url.searchParams.get('ids') ?? '').split(',').filter((id) => ID.test(id));
	if (ids.length > API_MAX_IDS) error(400, 'Too many ids');
	return json(videosByYoutubeIds([...new Set(ids)]), {
		headers: { 'cache-control': 'public, max-age=60' }
	});
};
