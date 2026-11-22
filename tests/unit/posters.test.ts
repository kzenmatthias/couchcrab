/**
 * Which image a series poster shows: the automatic first episode with the public rules, a chosen
 * episode, and the fallbacks. Plus the pure helpers in `src/lib/poster.ts`.
 */
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { render } from 'svelte/server';
import { beforeEach, describe, expect, it } from 'vitest';
import SeriesPoster from '#lib/components/SeriesPoster.svelte';
import {
	frameUrls,
	isPlaceholderImage,
	normalizePoster,
	POSTER_SURFACES,
	posterSources,
	posterSurface
} from '#lib/poster.js';
import type { DB } from '#lib/server/db/client.js';
import * as t from '#lib/server/db/schema.js';
import { resolvePoster, resolvePosters } from '#lib/server/posters.js';
import { testDatabase } from './auth/helpers.js';

let db: DB;
let channelA: number;
let channelB: number;
let creatorB: number;
let mainId: number;
let extrasId: number;
let otherId: number;
let n = 0;

const day = (d: number) => new Date(Date.UTC(2026, 0, d));
const id = () => `vid${String(++n).padStart(8, '0')}`;

function video(
	seriesId: number | null,
	publishedDay: number,
	extra: Partial<typeof t.videos.$inferInsert> = {}
) {
	const youtubeVideoId = extra.youtubeVideoId ?? id();
	db.insert(t.videos)
		.values({
			youtubeVideoId,
			channelId: channelA,
			title: `Episode ${youtubeVideoId}`,
			publishedAt: day(publishedDay),
			seriesId,
			status: seriesId ? 'placed' : 'unsorted',
			fetchedAt: day(publishedDay),
			...extra
		})
		.run();
	return youtubeVideoId;
}

const row = (seriesId: number) =>
	db.select().from(t.series).where(eq(t.series.id, seriesId)).get()!;
const setPoster = (seriesId: number, poster: unknown) =>
	db
		.update(t.series)
		.set({ poster: poster as t.PosterSettings })
		.where(eq(t.series.id, seriesId))
		.run();
const viewOf = (seriesId: number) => resolvePoster(db, row(seriesId));

beforeEach(() => {
	db = testDatabase();
	n = 0;
	const creator = (slug: string) =>
		db.insert(t.creators).values({ slug, name: slug, color: '#123456' }).returning().get().id;
	const a = creator('ann');
	creatorB = creator('bo');
	const channel = (creatorId: number, ytId: string) =>
		db
			.insert(t.channels)
			.values({ creatorId, youtubeChannelId: ytId, title: ytId })
			.returning()
			.get().id;
	channelA = channel(a, 'UCaaaaaaaaaaaaaaaaaaaaaa');
	channelB = channel(creatorB, 'UCbbbbbbbbbbbbbbbbbbbbbb');
	const series = (slug: string, parentId: number | null = null) =>
		db.insert(t.series).values({ slug, title: slug, kind: 'season', parentId }).returning().get()
			.id;
	mainId = series('main');
	extrasId = series('main-extras', mainId);
	otherId = series('other');
});

describe('automatic poster', () => {
	it('is the thumbnail of the earliest placed episode of the main series', () => {
		video(mainId, 5);
		const first = video(mainId, 2);
		video(mainId, 9);
		expect(viewOf(mainId)).toEqual({ kind: 'video', youtubeVideoId: first, frame: 'thumbnail' });
	});

	it('prefers uploads from the series start onward, on a main channel', () => {
		db.update(t.series)
			.set({ startedAt: day(10) })
			.where(eq(t.series.id, mainId))
			.run();
		const secondary = db
			.insert(t.channels)
			.values({
				creatorId: creatorB,
				youtubeChannelId: 'UCcccccccccccccccccccccc',
				title: 'vods',
				kind: 'secondary'
			})
			.returning()
			.get().id;
		const preview = video(mainId, 3);
		expect(viewOf(mainId)).toMatchObject({ youtubeVideoId: preview });
		video(mainId, 10, { channelId: secondary });
		const episode = video(mainId, 11);
		expect(viewOf(mainId)).toMatchObject({ youtubeVideoId: episode });
	});

	it('skips Shorts, live VODs, unplaced videos and Extras videos', () => {
		video(mainId, 1, { isShort: true });
		video(mainId, 2, { isLiveVod: true });
		video(mainId, 3, { status: 'ignored' });
		video(extrasId, 1);
		const first = video(mainId, 4);
		expect(viewOf(mainId)).toMatchObject({ youtubeVideoId: first });
	});

	it('never uses a video of an opted-out creator or an unlinked channel', () => {
		const fromB = video(mainId, 1, { channelId: channelB });
		const fromA = video(mainId, 3);
		expect(viewOf(mainId)).toMatchObject({ youtubeVideoId: fromB });

		db.update(t.creators).set({ optedOut: true }).where(eq(t.creators.id, creatorB)).run();
		expect(viewOf(mainId)).toMatchObject({ youtubeVideoId: fromA });

		db.update(t.creators).set({ optedOut: false }).where(eq(t.creators.id, creatorB)).run();
		db.update(t.channels)
			.set({ unlinkedAt: day(1) })
			.where(eq(t.channels.id, channelB))
			.run();
		expect(viewOf(mainId)).toMatchObject({ youtubeVideoId: fromA });
	});

	it('uses the main series for an Extras series', () => {
		video(extrasId, 1);
		const first = video(mainId, 2);
		expect(viewOf(extrasId)).toMatchObject({ youtubeVideoId: first });
	});

	it('is the plain surface (null) without any public episode', () => {
		video(mainId, 1, { isShort: true });
		expect(viewOf(mainId)).toBeNull();
	});

	it('treats old generated-art settings as automatic', () => {
		const first = video(mainId, 1);
		setPoster(mainId, { type: 'art', palette: 'meadow', seed: 3 });
		expect(viewOf(mainId)).toMatchObject({ youtubeVideoId: first, frame: 'thumbnail' });
	});

	it('resolves many series with a fixed number of queries', () => {
		const a = video(mainId, 1);
		const b = video(otherId, 1);
		const rows = [row(mainId), row(extrasId), row(otherId)];
		const queries: string[] = [];
		const client = db.$client;
		const prepare = client.prepare.bind(client);
		client.prepare = (source: string) => {
			queries.push(source);
			return prepare(source);
		};
		try {
			const map = resolvePosters(db, rows);
			expect(map.get(mainId)).toMatchObject({ youtubeVideoId: a });
			expect(map.get(extrasId)).toMatchObject({ youtubeVideoId: a });
			expect(map.get(otherId)).toMatchObject({ youtubeVideoId: b });
		} finally {
			client.prepare = prepare;
		}
		expect(queries).toHaveLength(1);
	});
});

describe('chosen poster', () => {
	it('uses the chosen episode and frame, also one from the Extras', () => {
		video(mainId, 1);
		const chosen = video(extrasId, 5);
		setPoster(mainId, { type: 'video', youtubeVideoId: chosen, frame: '2' });
		expect(viewOf(mainId)).toEqual({ kind: 'video', youtubeVideoId: chosen, frame: '2' });
	});

	it('falls back to automatic when the chosen episode is hidden or elsewhere', () => {
		const first = video(mainId, 1);
		const hidden = video(mainId, 5, { channelId: channelB });
		setPoster(mainId, { type: 'video', youtubeVideoId: hidden, frame: '1' });
		expect(viewOf(mainId)).toMatchObject({ youtubeVideoId: hidden });

		db.update(t.creators).set({ optedOut: true }).where(eq(t.creators.id, creatorB)).run();
		expect(viewOf(mainId)).toEqual({ kind: 'video', youtubeVideoId: first, frame: 'thumbnail' });

		const elsewhere = video(otherId, 2);
		setPoster(mainId, { type: 'video', youtubeVideoId: elsewhere, frame: '1' });
		expect(viewOf(mainId)).toMatchObject({ youtubeVideoId: first });

		setPoster(mainId, { type: 'video', youtubeVideoId: 'unknownvid1', frame: '1' });
		expect(viewOf(mainId)).toMatchObject({ youtubeVideoId: first });
	});

	it('shows an image URL as it is', () => {
		setPoster(mainId, { type: 'image', url: 'https://example.com/p.jpg' });
		expect(viewOf(mainId)).toEqual({ kind: 'image', url: 'https://example.com/p.jpg' });
	});
});

describe('poster helpers', () => {
	it('normalizes stored settings', () => {
		expect(normalizePoster(null)).toBeNull();
		expect(normalizePoster({ type: 'art', palette: 'dusk', seed: 1 })).toBeNull();
		expect(normalizePoster({ type: 'video', youtubeVideoId: 'short', frame: '1' })).toBeNull();
		expect(
			normalizePoster({ type: 'video', youtubeVideoId: 'abcdefghijk', frame: '4' })
		).toBeNull();
		expect(normalizePoster({ type: 'video', youtubeVideoId: 'abcdefghijk', frame: '3' })).toEqual({
			type: 'video',
			youtubeVideoId: 'abcdefghijk',
			frame: '3'
		});
		expect(normalizePoster({ type: 'image', url: 'https://x.test/a.png' })).toEqual({
			type: 'image',
			url: 'https://x.test/a.png'
		});
	});

	it('lists the YouTube sizes best first', () => {
		expect(frameUrls('abcdefghijk', 'thumbnail')).toEqual([
			'https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg',
			'https://i.ytimg.com/vi/abcdefghijk/sddefault.jpg',
			'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg'
		]);
		expect(frameUrls('abcdefghijk', '2')).toEqual([
			'https://i.ytimg.com/vi/abcdefghijk/maxres2.jpg',
			'https://i.ytimg.com/vi/abcdefghijk/sd2.jpg',
			'https://i.ytimg.com/vi/abcdefghijk/hq2.jpg'
		]);
	});

	it('has no images for the plain surface and the demo ids', () => {
		expect(posterSources(null)).toEqual([]);
		expect(posterSources({ kind: 'video', youtubeVideoId: 'demo0000001', frame: '1' })).toEqual([]);
		expect(posterSources({ kind: 'image', url: 'https://x.test/a.png' })).toEqual([
			'https://x.test/a.png'
		]);
	});

	it('picks a stable surface colour that is dark enough for white text', () => {
		expect(posterSurface('lanternfall')).toBe(posterSurface('lanternfall'));
		const lum = (hex: string) => {
			const [r, g, b] = [1, 3, 5].map((i) => {
				const v = parseInt(hex.slice(i, i + 2), 16) / 255;
				return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
			});
			return 0.2126 * r + 0.7152 * g + 0.0722 * b;
		};
		for (const c of POSTER_SURFACES) expect(1.05 / (lum(c) + 0.05)).toBeGreaterThanOrEqual(7);
	});

	it('treats only the small YouTube placeholder as missing', () => {
		expect(isPlaceholderImage('https://i.ytimg.com/vi/x/maxres1.jpg', 120)).toBe(true);
		expect(isPlaceholderImage('https://i.ytimg.com/vi/x/maxres1.jpg', 1280)).toBe(false);
		expect(isPlaceholderImage('https://example.com/a.jpg', 100)).toBe(false);
	});
});

describe('SeriesPoster', () => {
	const props = {
		slug: 'main',
		title: 'Main Season',
		kind: 'season' as const,
		startedAt: null,
		creatorCount: 2
	};

	it('renders the first image source, decorative and lazy, with the title as text', () => {
		const { body } = render(SeriesPoster, {
			props: { ...props, poster: { kind: 'video', youtubeVideoId: 'abcdefghijk', frame: '1' } }
		});
		expect(body).toContain('src="https://i.ytimg.com/vi/abcdefghijk/maxres1.jpg"');
		expect(body).toContain('alt=""');
		expect(body).toContain('loading="lazy"');
		expect(body).toContain('Main Season');
	});

	it('renders the plain surface without an image', () => {
		const { body } = render(SeriesPoster, { props: { ...props, poster: null } });
		expect(body).not.toContain('<img');
		expect(body).toContain(`background-color: ${posterSurface('main')}`);
	});
});

describe('migration 0007', () => {
	it('sets generated-art posters to null and keeps the others', () => {
		const sql = readFileSync('src/lib/server/db/migrations/0007_art_posters_to_auto.sql', 'utf8');
		setPoster(mainId, { type: 'art', palette: 'meadow', seed: 11 });
		setPoster(extrasId, { type: 'image', url: 'https://example.com/p.jpg' });
		setPoster(otherId, { type: 'video', youtubeVideoId: 'abcdefghijk', frame: '1' });
		db.$client.exec(sql);
		expect(row(mainId).poster).toBeNull();
		expect(row(extrasId).poster).toEqual({ type: 'image', url: 'https://example.com/p.jpg' });
		expect(row(otherId).poster).toMatchObject({ type: 'video' });
	});
});
