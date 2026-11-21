/**
 * The public catalog queries hide a creator who opted out, and all their videos, everywhere, and
 * the videos of a channel the creator unlinked.
 * The app database is replaced by a seeded in-memory one.
 */
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as t from '#lib/server/db/schema.js';
import {
	listOwnChannels,
	placeOwnVideo,
	relinkOwnChannel,
	setOwnOptOut,
	unlinkOwnChannel
} from '#lib/server/manage/creator-self.js';

vi.mock('#lib/server/db/index.js', async () => {
	const { seeded } = await import('./manage/fixtures.js');
	const schema = await import('#lib/server/db/schema.js');
	return { db: seeded().db, schema };
});

const { db } = await import('#lib/server/db/index.js');
const catalog = await import('#lib/server/catalog.js');

const juno = () => db.select().from(t.users).where(eq(t.users.name, 'Tidecaller Juno')).get()!;
const actor = () => ({ id: juno().id, creatorId: juno().creatorId! });
const season = () =>
	db.select().from(t.series).where(eq(t.series.slug, 'lanternfall-season-3')).get()!;
const isJuno = (v: { creator: { slug: string } }) => v.creator.slug === 'tidecaller-juno';

describe('opting out hides a creator from the catalog', () => {
	beforeEach(() => {
		setOwnOptOut(db, actor(), false);
	});

	it('shows the creator while they have not opted out', () => {
		expect(catalog.getCreatorBySlug('tidecaller-juno')).not.toBeNull();
		expect(catalog.seriesVideos(season().id).some(isJuno)).toBe(true);
	});

	it('removes the profile and every video from the public queries, and brings them back', () => {
		const episodesBefore = catalog.listSeries().find((s) => s.slug === 'lanternfall-season-3')!;
		const junoVideos = catalog.seriesVideos(season().id).filter(isJuno);
		expect(junoVideos.length).toBeGreaterThan(0);

		setOwnOptOut(db, actor(), true);

		expect(catalog.getCreatorBySlug('tidecaller-juno')).toBeNull();
		expect(catalog.listCreators().some((c) => c.slug === 'tidecaller-juno')).toBe(false);
		expect(catalog.seriesCreatorList(season().id).some((c) => c.slug === 'tidecaller-juno')).toBe(
			false
		);
		expect(catalog.seriesVideos(season().id).some(isJuno)).toBe(false);
		expect(catalog.latestVideos(400).some(isJuno)).toBe(false);
		const ids = junoVideos.map((v) => v.youtubeVideoId);
		expect(catalog.videosByYoutubeIds(ids)).toEqual([]);
		expect(catalog.getVideo(ids[0])).toBeNull();
		const episodesAfter = catalog.listSeries().find((s) => s.slug === 'lanternfall-season-3')!;
		expect(episodesAfter.episodeCount).toBe(episodesBefore.episodeCount - junoVideos.length);
		expect(episodesAfter.creatorCount).toBe(episodesBefore.creatorCount - 1);

		setOwnOptOut(db, actor(), false);
		expect(catalog.getCreatorBySlug('tidecaller-juno')).not.toBeNull();
		expect(catalog.seriesVideos(season().id).filter(isJuno)).toHaveLength(junoVideos.length);
	});
});

describe('unlinking a channel hides its videos from the catalog', () => {
	it('hides the channel and its videos, and linking again brings them back', () => {
		const second = listOwnChannels(db, actor()).find((c) => c.kind === 'secondary')!;
		const video = db
			.select()
			.from(t.videos)
			.where(eq(t.videos.title, 'Late night building chat'))
			.get()!;
		placeOwnVideo(db, actor(), video.id, { series_id: String(season().id) });
		const shown = () => catalog.seriesVideos(season().id).some((v) => v.id === video.id);
		const channelShown = () =>
			catalog
				.getCreatorBySlug('tidecaller-juno')!
				.channels.some((c) => c.youtubeChannelId === second.youtubeChannelId);
		expect(shown()).toBe(true);
		expect(channelShown()).toBe(true);

		unlinkOwnChannel(db, actor(), second.id);
		expect(shown()).toBe(false);
		expect(channelShown()).toBe(false);
		expect(catalog.latestVideos(400).some((v) => v.id === video.id)).toBe(false);
		expect(catalog.videosByYoutubeIds([video.youtubeVideoId])).toEqual([]);
		expect(catalog.getVideo(video.youtubeVideoId)).toBeNull();
		// The rest of the creator stays public.
		expect(catalog.getCreatorBySlug('tidecaller-juno')).not.toBeNull();
		expect(catalog.seriesVideos(season().id).some(isJuno)).toBe(true);

		relinkOwnChannel(db, actor(), second.id);
		expect(shown()).toBe(true);
		expect(channelShown()).toBe(true);
	});
});
