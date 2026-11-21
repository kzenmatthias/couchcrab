import { describe, expect, it } from 'vitest';
import { classifyVideo, SHORT_MAX_SECONDS } from '#lib/server/youtube/classify.js';
import {
	type ApiVideo,
	createYouTubeClient,
	parseIsoDuration,
	YouTubeApiError
} from '#lib/server/youtube/client.js';
import { FAKE_KEY, fakeYouTube } from './fake-youtube.js';

describe('parseIsoDuration', () => {
	it.each([
		['PT32M15S', 1935],
		['PT3H2M', 10920],
		['PT45S', 45],
		['PT1H', 3600],
		['P1DT2H3M4S', 93784],
		['P1W', 604800],
		['P0D', 0],
		['PT0S', 0],
		['PT1.6S', 2]
	])('parses %s', (input, seconds) => {
		expect(parseIsoDuration(input)).toBe(seconds);
	});

	it.each(['', 'P', 'PT', '32:15', 'PT5X', 'T5M'])('rejects %j', (input) => {
		expect(parseIsoDuration(input)).toBeNull();
	});

	it('handles a missing value', () => {
		expect(parseIsoDuration(undefined)).toBeNull();
	});
});

const video = (over: Partial<ApiVideo> = {}): ApiVideo => ({
	id: 'fxTest00001',
	snippet: {
		title: 'Something',
		channelId: 'UCfixture',
		publishedAt: '2026-10-01T00:00:00Z',
		liveBroadcastContent: 'none'
	},
	contentDetails: { duration: 'PT20M', caption: 'false' },
	...over
});

describe('classifyVideo', () => {
	it('reads creator captions from contentDetails.caption', () => {
		expect(classifyVideo(video()).hasCreatorCaptions).toBe(false);
		const withCaptions = video({ contentDetails: { duration: 'PT20M', caption: 'true' } });
		expect(classifyVideo(withCaptions).hasCreatorCaptions).toBe(true);
	});

	it('marks a finished livestream as a live VOD, never as a Short', () => {
		const vod = classifyVideo(
			video({
				contentDetails: { duration: 'PT2M', caption: 'false' },
				liveStreamingDetails: {
					actualStartTime: '2026-10-01T19:00:00Z',
					actualEndTime: '2026-10-01T19:02:00Z'
				}
			})
		);
		expect(vod).toMatchObject({ isLiveVod: true, isShort: false, liveState: 'none' });
	});

	it('detects Shorts by duration, up to and including the threshold', () => {
		const at = (s: number) =>
			classifyVideo(video({ contentDetails: { duration: `PT${s}S`, caption: 'false' } })).isShort;
		expect(at(SHORT_MAX_SECONDS)).toBe(true);
		expect(at(SHORT_MAX_SECONDS + 1)).toBe(false);
		expect(at(0)).toBe(false);
	});

	it('flags upcoming and live-now items', () => {
		const upcoming = video({
			snippet: { title: 'Soon', liveBroadcastContent: 'upcoming' },
			liveStreamingDetails: { scheduledStartTime: '2026-10-02T19:00:00Z' }
		});
		const live = video({
			snippet: { title: 'Now', liveBroadcastContent: 'live' },
			liveStreamingDetails: { actualStartTime: '2026-10-02T19:00:00Z' }
		});
		expect(classifyVideo(upcoming).liveState).toBe('upcoming');
		expect(classifyVideo(live).liveState).toBe('live');
		expect(classifyVideo(video()).liveState).toBe('none');
	});
});

describe('createYouTubeClient', () => {
	it('resolves the uploads playlist of a channel', async () => {
		const yt = fakeYouTube();
		const client = createYouTubeClient({ apiKey: FAKE_KEY, fetch: yt.fetch });
		expect(await client.getChannel('UCfixturePebblewick00001')).toEqual({
			youtubeChannelId: 'UCfixturePebblewick00001',
			title: 'Pebblewick',
			uploadsPlaylistId: 'UUfixturePebblewick00001'
		});
		expect(await client.getChannel('UCdoesnotexist')).toBeNull();
		expect(yt.calls[0].params).toMatchObject({ part: 'contentDetails,snippet' });
	});

	it('pages through uploads until the limit or an older item', async () => {
		const yt = fakeYouTube({ pageSize: 3 });
		const client = createYouTubeClient({ apiKey: FAKE_KEY, fetch: yt.fetch });
		const all = await client.listUploads('UUfixturePebblewick00001', { max: 100 });
		expect(all.items).toHaveLength(7);
		expect(all.pages).toBe(3);

		const limited = await client.listUploads('UUfixturePebblewick00001', { max: 4 });
		expect(limited.items.map((i) => i.youtubeVideoId)).toEqual([
			'fxPeb000010',
			'fxPeb000009',
			'fxPeb000008',
			'fxPeb000007'
		]);

		const since = await client.listUploads('UUfixturePebblewick00001', {
			max: 100,
			publishedAfter: new Date('2026-10-16T00:00:00Z')
		});
		expect(since.items.map((i) => i.youtubeVideoId)).toEqual(['fxPeb000010', 'fxPeb000009']);
		expect(since.pages).toBe(1);
	});

	it('asks for video details in batches of 50', async () => {
		const yt = fakeYouTube();
		const client = createYouTubeClient({ apiKey: FAKE_KEY, fetch: yt.fetch });
		const ids = Array.from({ length: 120 }, (_, i) => `fxNone${String(i).padStart(5, '0')}`);
		ids[0] = 'fxPeb000010';
		const found = await client.getVideos(ids);
		expect(found.map((v) => v.id)).toEqual(['fxPeb000010']);
		const batches = yt.calls.filter((c) => c.endpoint === 'videos');
		expect(batches.map((b) => b.params.id.split(',').length)).toEqual([50, 50, 20]);
		expect(batches[0].params.part).toBe('contentDetails,snippet,liveStreamingDetails');
	});

	it('reports quota errors clearly and never leaks the key', async () => {
		const yt = fakeYouTube();
		yt.fail(403, yt.quotaBody());
		const client = createYouTubeClient({ apiKey: FAKE_KEY, fetch: yt.fetch });
		const error = await client.getVideos(['fxPeb000010']).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(YouTubeApiError);
		expect(error).toMatchObject({ isQuota: true, status: 403, reason: 'quotaExceeded' });
		expect((error as Error).message).toMatch(/quota exceeded/i);
		expect((error as Error).message).not.toContain(FAKE_KEY);
	});

	it('reports other HTTP and network errors without the key', async () => {
		const yt = fakeYouTube();
		yt.fail(400, {
			error: {
				code: 400,
				message: `API key not valid: ${FAKE_KEY}`,
				errors: [{ reason: 'keyInvalid' }]
			}
		});
		const client = createYouTubeClient({ apiKey: FAKE_KEY, fetch: yt.fetch });
		const error = (await client.getChannel('UCx').catch((e: unknown) => e)) as YouTubeApiError;
		expect(error.isQuota).toBe(false);
		expect(error.message).toContain('400');
		expect(error.message).toContain('YOUTUBE_API_KEY');
		expect(error.message).not.toContain(FAKE_KEY);

		const offline = createYouTubeClient({
			apiKey: FAKE_KEY,
			fetch: () => Promise.reject(new Error(`connect failed for key=${FAKE_KEY}`))
		});
		const netError = (await offline.getChannel('UCx').catch((e: unknown) => e)) as Error;
		expect(netError.message).toMatch(/could not reach/i);
		expect(netError.message).not.toContain(FAKE_KEY);
	});
});
