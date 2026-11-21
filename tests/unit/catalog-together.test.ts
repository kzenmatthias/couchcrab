/**
 * Watch together: the other POVs of a livestream are the public live VODs of the same series
 * that overlapped it in time. The app database is replaced by a seeded in-memory one.
 */
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import * as t from '#lib/server/db/schema.js';

vi.mock('#lib/server/db/index.js', async () => {
	const { seeded } = await import('./manage/fixtures.js');
	const schema = await import('#lib/server/db/schema.js');
	return { db: seeded().db, schema };
});

const { db } = await import('#lib/server/db/index.js');
const catalog = await import('#lib/server/catalog.js');

const streams = () =>
	db.select().from(t.series).where(eq(t.series.slug, 'skyforge-games-2026-streams')).get()!;

describe('livePartners', () => {
	it('finds the other POVs of the same day, not those of the other day', () => {
		const all = catalog.seriesVideos(streams().id);
		expect(all).toHaveLength(8);
		const first = all.find((v) => v.liveStartedAt !== null)!;
		const partners = catalog.livePartners(first);
		expect(partners).toHaveLength(3);
		expect(partners.every((p) => p.groupId === first.groupId)).toBe(true);
		expect(partners.map((p) => p.id)).not.toContain(first.id);
	});

	it('is empty for a video that is not a live VOD with a known start', () => {
		const season = db
			.select()
			.from(t.series)
			.where(eq(t.series.slug, 'lanternfall-season-3'))
			.get()!;
		const episode = catalog.seriesVideos(season.id)[0];
		expect(episode.liveStartedAt).toBeNull();
		expect(catalog.livePartners(episode)).toEqual([]);
	});

	it('leaves out a POV whose video is no longer public', () => {
		const first = catalog.seriesVideos(streams().id)[0];
		const other = catalog.livePartners(first)[0];
		db.update(t.videos).set({ status: 'ignored' }).where(eq(t.videos.id, other.id)).run();
		expect(catalog.livePartners(first).map((p) => p.id)).not.toContain(other.id);
		db.update(t.videos).set({ status: 'placed' }).where(eq(t.videos.id, other.id)).run();
	});
});
