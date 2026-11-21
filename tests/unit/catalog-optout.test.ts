/**
 * The public catalog queries hide a creator who opted out, and all their videos, everywhere.
 * The app database is replaced by a seeded in-memory one.
 */
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as t from '#lib/server/db/schema.js';
import { setOwnOptOut } from '#lib/server/manage/creator-self.js';

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
