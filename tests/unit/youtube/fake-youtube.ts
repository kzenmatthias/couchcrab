/**
 * An in-memory stand-in for the YouTube Data API, built from the recorded-style fixtures in
 * tests/fixtures/youtube. Tests change its state (add, edit or delete videos) between syncs.
 */
import { readFileSync } from 'node:fs';
import type { ApiChannel, ApiPlaylistItem, ApiVideo } from '#lib/server/youtube/client.js';

const fixture = <T>(name: string): T =>
	JSON.parse(readFileSync(new URL(`../../fixtures/youtube/${name}`, import.meta.url), 'utf8')) as T;

export const FAKE_KEY = 'fake-key-0123456789';

export interface FakeCall {
	endpoint: string;
	params: Record<string, string>;
}

export function fakeYouTube({ pageSize = 3 } = {}) {
	const channels = fixture<{ items: ApiChannel[] }>('channels.list.json').items;
	const playlists = fixture<Record<string, ApiPlaylistItem[]>>('playlistItems.list.json');
	const videos = new Map(
		fixture<{ items: ApiVideo[] }>('videos.list.json').items.map((v) => [v.id, v])
	);
	const calls: FakeCall[] = [];
	let failWith: { status: number; body: unknown } | null = null;

	const json = (body: unknown, status = 200) =>
		new Response(JSON.stringify(body), {
			status,
			headers: { 'content-type': 'application/json' }
		});

	const fetch: typeof globalThis.fetch = (input) => {
		const url = new URL(input instanceof Request ? input.url : String(input));
		const endpoint = url.pathname.split('/').pop() ?? '';
		const params = Object.fromEntries(url.searchParams);
		if (params.key !== FAKE_KEY) return Promise.resolve(json({ error: { code: 400 } }, 400));
		delete params.key;
		calls.push({ endpoint, params });
		if (failWith) return Promise.resolve(json(failWith.body, failWith.status));

		if (endpoint === 'channels') {
			return Promise.resolve(json({ items: channels.filter((c) => c.id === params.id) }));
		}
		if (endpoint === 'playlistItems') {
			const all = playlists[params.playlistId];
			if (!all) return Promise.resolve(json({ error: { code: 404, message: 'Not found' } }, 404));
			const start = Number(params.pageToken ?? 0);
			const items = all.slice(start, start + pageSize);
			const next = start + pageSize < all.length ? String(start + pageSize) : undefined;
			return Promise.resolve(json({ items, ...(next ? { nextPageToken: next } : {}) }));
		}
		if (endpoint === 'videos') {
			const ids = params.id.split(',');
			return Promise.resolve(
				json({ items: ids.flatMap((id) => (videos.has(id) ? [videos.get(id)] : [])) })
			);
		}
		return Promise.resolve(json({ error: { code: 404 } }, 404));
	};

	return {
		fetch,
		calls,
		channels,
		playlists,
		videos,
		/** Makes every following request fail with this response. */
		fail(status: number, body: unknown) {
			failWith = { status, body };
		},
		quotaBody: () => fixture<unknown>('quota-exceeded.json'),
		/** Adds a new upload at the top of a channel's uploads playlist. */
		upload(playlistId: string, video: ApiVideo) {
			playlists[playlistId].unshift({
				snippet: { publishedAt: video.snippet?.publishedAt, title: video.snippet?.title },
				contentDetails: { videoId: video.id, videoPublishedAt: video.snippet?.publishedAt }
			});
			videos.set(video.id, video);
		},
		requestedVideoIds: () =>
			calls.filter((c) => c.endpoint === 'videos').flatMap((c) => c.params.id.split(','))
	};
}
