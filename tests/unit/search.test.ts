/**
 * Search: normalisation and matching (pure), and the catalog search with the public rules
 * (opted-out creators, unlinked channels, spoiler-free titles) on a seeded in-memory database.
 */
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import * as t from '#lib/server/db/schema.js';
import {
	listOwnChannels,
	placeOwnVideo,
	relinkOwnChannel,
	setOwnOptOut,
	unlinkOwnChannel
} from '#lib/server/manage/creator-self.js';
import { matchesTerms, matchRank, normalizeSearch, searchTerms } from '#lib/search.js';

vi.mock('#lib/server/db/index.js', async () => {
	const { seeded } = await import('./manage/fixtures.js');
	const schema = await import('#lib/server/db/schema.js');
	return { db: seeded().db, schema };
});

const { db } = await import('#lib/server/db/index.js');
const { searchCatalog, SEARCH_LIMITS } = await import('#lib/server/catalog.js');

const juno = () => db.select().from(t.users).where(eq(t.users.name, 'Tidecaller Juno')).get()!;
const actor = () => ({ id: juno().id, creatorId: juno().creatorId! });
const season = () =>
	db.select().from(t.series).where(eq(t.series.slug, 'lanternfall-season-3')).get()!;

describe('normalisation and matching', () => {
	it('ignores case, accents and punctuation', () => {
		expect(normalizeSearch('  Ÿé  Ömë-Straße! ')).toBe('ye ome strasse');
		expect(normalizeSearch('LANTÉRNFALL 3: Deep')).toBe('lanternfall 3 deep');
		expect(searchTerms('Deep  deep DARK')).toEqual(['deep', 'dark']);
		expect(searchTerms('  ?! ')).toEqual([]);
	});

	it('needs every word, in any of the fields', () => {
		const fields = ['into the deep dark', 'marrowfen'];
		expect(matchesTerms(['deep', 'marrow'], fields)).toBe(true);
		expect(matchesTerms(['deep', 'juno'], fields)).toBe(false);
		expect(matchesTerms([], fields)).toBe(false);
	});

	it('ranks a prefix before a word before the middle of a word', () => {
		expect(matchRank(['ember'], 'ember hearts')).toBe(0);
		expect(matchRank(['hearts'], 'ember hearts')).toBe(1);
		expect(matchRank(['earts'], 'ember hearts')).toBe(2);
	});
});

describe('searchCatalog', () => {
	it('returns null for an empty query', () => {
		expect(searchCatalog('   ')).toBeNull();
	});

	it('finds series, creators and episodes, case- and accent-insensitively', () => {
		const r = searchCatalog('ÉMBER hearts')!;
		expect(r.series.items.map((s) => s.slug)).toEqual(['ember-hearts']);
		expect(r.episodes.total).toBeGreaterThan(0);
		expect(r.episodes.items.every((v) => v.series.slug === 'ember-hearts')).toBe(true);

		const deep = searchCatalog('deep dark')!;
		expect(deep.episodes.items.length).toBeGreaterThan(0);
		expect(deep.episodes.items.every((v) => /deep dark/i.test(v.title))).toBe(true);
		expect(searchCatalog('juno')!.creators.items.map((c) => c.slug)).toEqual(['tidecaller-juno']);
	});

	it('never finds unsorted videos or creators who opted out', () => {
		expect(searchCatalog('texture pack')!.total).toBe(0);
		expect(searchCatalog('vesper')!.creators.total).toBe(0);
	});

	it('limits each section, and shows more for an expanded section', () => {
		const all = searchCatalog('lanternfall')!;
		expect(all.episodes.total).toBeGreaterThan(SEARCH_LIMITS.episodes);
		expect(all.episodes.items).toHaveLength(SEARCH_LIMITS.episodes);
		expect(all.episodes.expanded).toBe(false);
		const more = searchCatalog('lanternfall', { expand: ['episodes'] })!;
		expect(more.episodes.items).toHaveLength(more.episodes.total);
		expect(more.episodes.expanded).toBe(true);
	});

	it('hides a creator who opts out, and brings them back', () => {
		setOwnOptOut(db, actor(), true);
		const r = searchCatalog('tidecaller')!;
		expect(r.creators.total).toBe(0);
		expect(r.episodes.total).toBe(0);
		setOwnOptOut(db, actor(), false);
		expect(searchCatalog('tidecaller')!.creators.total).toBe(1);
	});

	it('matches a creator by channel title, but not by a channel they unlinked', () => {
		const second = listOwnChannels(db, actor()).find((c) => c.kind === 'secondary')!;
		const video = db
			.select()
			.from(t.videos)
			.where(eq(t.videos.title, 'Late night building chat'))
			.get()!;
		placeOwnVideo(db, actor(), video.id, { series_id: String(season().id) });
		const hit = searchCatalog('juno plays')!.creators.items[0];
		expect(hit).toMatchObject({ slug: 'tidecaller-juno', viaChannel: second.title });
		expect(searchCatalog('late night building')!.episodes.total).toBe(1);

		unlinkOwnChannel(db, actor(), second.id);
		expect(searchCatalog('juno plays')!.creators.total).toBe(0);
		expect(searchCatalog('late night building')!.episodes.total).toBe(0);

		relinkOwnChannel(db, actor(), second.id);
		expect(searchCatalog('late night building')!.episodes.total).toBe(1);
	});

	it('does not search or return hidden titles in spoiler-free series', () => {
		const spoilerFree = { isSpoilerFree: (id: number) => id === season().id };
		const deep = searchCatalog('lanternfall deep dark', spoilerFree)!;
		expect(deep.episodes.total).toBe(0);

		// Found by the creator or the series instead, without the title.
		const byCreator = searchCatalog('juno', spoilerFree)!;
		const hidden = byCreator.episodes.items.filter((v) => v.povSeriesId === season().id);
		expect(hidden.length).toBeGreaterThan(0);
		expect(hidden.every((v) => v.title === '' && v.titleHidden)).toBe(true);
		// Other series keep their titles.
		expect(
			byCreator.episodes.items
				.filter((v) => v.povSeriesId !== season().id)
				.every((v) => v.title !== '' && !v.titleHidden)
		).toBe(true);
		// Extras follow their parent series.
		const extras = searchCatalog('lanternfall', {
			...spoilerFree,
			expand: ['episodes']
		})!.episodes.items.filter((v) => v.seriesId !== v.povSeriesId);
		expect(extras.length).toBeGreaterThan(0);
		expect(extras.every((v) => v.titleHidden)).toBe(true);
	});
});
