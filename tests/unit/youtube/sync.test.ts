import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asc, eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DB, openDatabase } from '#lib/server/db/client.js';
import * as t from '#lib/server/db/schema.js';
import { createYouTubeClient } from '#lib/server/youtube/client.js';
import { formatSummary, runSync, type SyncOptions } from '#lib/server/youtube/sync.js';
import { FAKE_KEY, fakeYouTube } from './fake-youtube.js';

const PEBBLE = 'UCfixturePebblewick00001';
const MARROW = 'UCfixtureMarrowfen000001';
const DAY = 86_400_000;
const FIRST_RUN = new Date('2026-10-21T08:00:00Z');

let dir: string;
let db: DB;
let yt: ReturnType<typeof fakeYouTube>;
let ids: { s1: number; s1Extras: number; other: number; week1: number; week2: number };
let creators: { pebble: number; marrow: number };

function setup() {
	const [pebble, marrow] = db
		.insert(t.creators)
		.values([
			{ slug: 'pebblewick', name: 'Pebblewick', color: '#e05d5d' },
			{ slug: 'marrowfen', name: 'Marrowfen', color: '#ffd166' }
		])
		.returning({ id: t.creators.id })
		.all();
	creators = { pebble: pebble.id, marrow: marrow.id };
	db.insert(t.channels)
		.values([
			{ creatorId: pebble.id, youtubeChannelId: PEBBLE, title: 'Pebblewick' },
			{ creatorId: marrow.id, youtubeChannelId: MARROW, title: 'Marrowfen' },
			{
				creatorId: marrow.id,
				youtubeChannelId: 'UCfixtureMarrowOff000001',
				title: 'Marrowfen archive',
				syncEnabled: false
			}
		])
		.run();
	const [s1, other] = db
		.insert(t.series)
		.values([
			{ slug: 'season-1', title: 'Season 1', kind: 'season', grouping: 'week' },
			{ slug: 'other', title: 'Other', kind: 'other', grouping: 'none' }
		])
		.returning({ id: t.series.id })
		.all();
	const extras = db
		.insert(t.series)
		.values({
			slug: 'season-1-extras',
			title: 'Season 1 Extras',
			kind: 'other',
			grouping: 'none',
			parentId: s1.id
		})
		.returning({ id: t.series.id })
		.get();
	db.insert(t.seriesCreators)
		.values([
			{ seriesId: s1.id, creatorId: pebble.id },
			{ seriesId: other.id, creatorId: marrow.id }
		])
		.run();
	const [week1, week2] = db
		.insert(t.groups)
		.values([
			{
				seriesId: s1.id,
				kind: 'week',
				number: 1,
				startsAt: new Date('2026-09-28T00:00:00Z'),
				endsAt: new Date('2026-10-12T00:00:00Z')
			},
			{ seriesId: s1.id, kind: 'week', number: 2, startsAt: new Date('2026-10-12T00:00:00Z') }
		])
		.returning({ id: t.groups.id })
		.all();
	db.insert(t.titleRules)
		.values([
			{ seriesId: s1.id, pattern: 'season 1', priority: 10 },
			{
				seriesId: s1.id,
				pattern: String.raw`^\[S1\] Bonus`,
				match: 'regex',
				target: 'extras',
				priority: 20
			},
			{ seriesId: s1.id, pattern: 'cooking', enabled: false, priority: 99 }
		])
		.run();
	ids = { s1: s1.id, s1Extras: extras.id, other: other.id, week1: week1.id, week2: week2.id };
}

const sync = (at: Date, over: Partial<SyncOptions> = {}) =>
	runSync({
		db,
		client: createYouTubeClient({ apiKey: FAKE_KEY, fetch: yt.fetch }),
		now: () => at,
		...over
	});

const video = (youtubeVideoId: string) =>
	db.select().from(t.videos).where(eq(t.videos.youtubeVideoId, youtubeVideoId)).get();

const channel = (youtubeChannelId: string) =>
	db.select().from(t.channels).where(eq(t.channels.youtubeChannelId, youtubeChannelId)).get();

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'couchcrab-sync-'));
	db = openDatabase(join(dir, 'test.db'));
	migrate(db, { migrationsFolder: './src/lib/server/db/migrations' });
	yt = fakeYouTube({ pageSize: 3 });
	setup();
});

afterEach(() => {
	db.$client.close();
	rmSync(dir, { recursive: true, force: true });
});

describe('runSync: first sync', () => {
	it('stores uploads and places them with the title rules', async () => {
		const summary = await sync(FIRST_RUN);
		const pebble = summary.channels.find((c) => c.youtubeChannelId === PEBBLE);
		expect(pebble).toMatchObject({
			status: 'ok',
			fetched: 7,
			new: 6,
			placed: 4,
			unsorted: 1,
			ignored: 1,
			skipped: 1,
			errors: []
		});

		// Regular episodes: main series, in the week their publish date falls in.
		expect(video('fxPeb000010')).toMatchObject({
			seriesId: ids.s1,
			groupId: ids.week2,
			status: 'placed',
			placedBy: 'rule',
			durationS: 1935,
			hasCreatorCaptions: true
		});
		expect(video('fxPeb000004')).toMatchObject({ seriesId: ids.s1, groupId: ids.week1 });
		// Livestream VOD matched by a main rule: goes to Extras.
		expect(video('fxPeb000009')).toMatchObject({
			seriesId: ids.s1Extras,
			isLiveVod: true,
			status: 'placed'
		});
		// Higher-priority regex rule targeting Extras beats the contains rule.
		expect(video('fxPeb000007')).toMatchObject({ seriesId: ids.s1Extras });
		// Shorts are stored as ignored so they are not picked up again.
		expect(video('fxPeb000008')).toMatchObject({
			isShort: true,
			status: 'ignored',
			placedBy: 'sync',
			seriesId: null
		});
		// Only a disabled rule matches: Unsorted.
		expect(video('fxPeb000005')).toMatchObject({ status: 'unsorted', seriesId: null });
		// Upcoming premiere is not stored yet.
		expect(video('fxPeb000006')).toBeUndefined();

		// Marrowfen has no rules: Unsorted. The channel with sync off is not touched.
		expect(video('fxMar000001')).toMatchObject({ status: 'unsorted' });
		expect(summary.channels.map((c) => c.youtubeChannelId)).toEqual([PEBBLE, MARROW]);
		expect(yt.calls.some((c) => c.params.id === 'UCfixtureMarrowOff000001')).toBe(false);
	});

	it('writes an audit entry for every insert and placement', async () => {
		await sync(FIRST_RUN);
		const log = db.select().from(t.auditLog).orderBy(asc(t.auditLog.id)).all();
		expect(log.filter((e) => e.actor === 'sync')).toHaveLength(7);
		const placements = log.filter((e) => e.actor === 'rule');
		expect(placements).toHaveLength(4);
		const episode = video('fxPeb000010');
		expect(placements.find((e) => e.entityId === episode?.id)).toMatchObject({
			entity: 'video',
			before: { status: 'unsorted', seriesId: null },
			after: { status: 'placed', seriesId: ids.s1, placedBy: 'rule' }
		});
	});

	it('keeps the cursor before an upcoming stream', async () => {
		await sync(FIRST_RUN);
		// The premiere was listed on 8 October: the next sync must look back that far.
		expect(channel(PEBBLE)?.lastSyncedAt).toEqual(new Date('2026-10-08T10:00:00Z'));
		expect(channel(MARROW)?.lastSyncedAt).toEqual(FIRST_RUN);
	});

	it('takes at most firstSyncMax uploads on a first sync', async () => {
		const summary = await sync(FIRST_RUN, { firstSyncMax: 2, channel: PEBBLE });
		expect(summary.channels).toHaveLength(1);
		expect(summary.channels[0]).toMatchObject({ fetched: 2, new: 2 });
	});

	it('writes nothing in a dry run but reports the same', async () => {
		const dry = await sync(FIRST_RUN, { dryRun: true });
		expect(dry.dryRun).toBe(true);
		expect(dry.channels[0]).toMatchObject({ new: 6, placed: 4, unsorted: 1 });
		expect(db.select().from(t.videos).all()).toHaveLength(0);
		expect(db.select().from(t.auditLog).all()).toHaveLength(0);
		expect(channel(PEBBLE)?.lastSyncedAt).toBeNull();
		expect(formatSummary(dry, { actions: true })).toContain('fxPeb000010');
	});
});

describe('runSync: later syncs', () => {
	it('only fetches recent uploads and picks up a finished stream', async () => {
		await sync(FIRST_RUN);
		yt.calls.length = 0;

		// The premiere has been streamed, and a new episode came out.
		yt.videos.set('fxPeb000006', {
			id: 'fxPeb000006',
			snippet: {
				publishedAt: '2026-10-24T19:00:00Z',
				channelId: PEBBLE,
				title: 'Season 1 Finale stream',
				liveBroadcastContent: 'none'
			},
			contentDetails: { duration: 'PT2H', caption: 'false' },
			liveStreamingDetails: {
				actualStartTime: '2026-10-24T19:00:00Z',
				actualEndTime: '2026-10-24T21:00:00Z'
			}
		});
		yt.upload('UUfixturePebblewick00001', {
			id: 'fxPeb000011',
			snippet: {
				publishedAt: '2026-10-27T16:00:00Z',
				channelId: PEBBLE,
				title: 'Season 1 Episode 6: Bridges',
				liveBroadcastContent: 'none'
			},
			contentDetails: { duration: 'PT30M', caption: 'false' }
		});

		const summary = await sync(new Date('2026-10-28T08:00:00Z'), { channel: PEBBLE });
		expect(summary.channels[0]).toMatchObject({ new: 2, placed: 2, skipped: 0 });
		expect(video('fxPeb000011')).toMatchObject({ seriesId: ids.s1, groupId: ids.week2 });
		expect(video('fxPeb000006')).toMatchObject({ seriesId: ids.s1Extras, isLiveVod: true });
		// Cursor was 8 October minus the safety margin: older uploads are not requested again.
		const requested = yt.requestedVideoIds();
		expect(requested).toContain('fxPeb000007');
		expect(requested).not.toContain('fxPeb000005');
		expect(requested).not.toContain('fxPeb000004');
		expect(channel(PEBBLE)?.lastSyncedAt).toEqual(new Date('2026-10-28T08:00:00Z'));
	});

	it('refreshes data but never overwrites a placement made by a user', async () => {
		await sync(FIRST_RUN);
		const episode = video('fxPeb000010');
		db.update(t.videos)
			.set({ seriesId: ids.other, groupId: null, placedBy: 'user', status: 'placed' })
			.where(eq(t.videos.id, episode!.id))
			.run();
		const resource = yt.videos.get('fxPeb000010')!;
		resource.snippet = { ...resource.snippet, title: 'Season 1 Episode 5 (renamed)' };

		const later = new Date('2026-10-22T08:00:00Z');
		await sync(later, { channel: PEBBLE });
		expect(video('fxPeb000010')).toMatchObject({
			title: 'Season 1 Episode 5 (renamed)',
			seriesId: ids.other,
			placedBy: 'user',
			fetchedAt: later
		});
	});

	it('skips channels of creators who opted out', async () => {
		db.update(t.creators).set({ optedOut: true }).where(eq(t.creators.id, creators.marrow)).run();
		const summary = await sync(FIRST_RUN);
		expect(summary.channels.find((c) => c.youtubeChannelId === MARROW)).toMatchObject({
			status: 'skipped',
			new: 0
		});
		expect(yt.calls.some((c) => c.params.id === MARROW)).toBe(false);
		expect(video('fxMar000001')).toBeUndefined();
		expect(channel(MARROW)?.lastSyncedAt).toBeNull();
	});

	it('stops on a quota error and reports it per channel', async () => {
		yt.fail(403, yt.quotaBody());
		const summary = await sync(FIRST_RUN);
		expect(summary.channels.map((c) => c.status)).toEqual(['error', 'error']);
		expect(summary.channels[0].errors[0]).toMatch(/quota/i);
		expect(summary.channels[1].errors[0]).toMatch(/^Not synced/);
		// One request, then the sync gives up.
		expect(yt.calls).toHaveLength(1);
		expect(formatSummary(summary)).not.toContain(FAKE_KEY);
	});

	it('fails clearly for an unknown --channel', async () => {
		await expect(sync(FIRST_RUN, { channel: 'UCnothere' })).rejects.toThrow(/UCnothere/);
	});
});

describe('runSync: retention', () => {
	it('refreshes stale videos and blanks ones YouTube no longer returns', async () => {
		await sync(FIRST_RUN);
		yt.videos.delete('fxPeb000007');
		yt.calls.length = 0;

		const later = new Date(FIRST_RUN.getTime() + 26 * DAY);
		const summary = await sync(later, { refreshOnly: true });
		expect(summary.channels).toHaveLength(0);
		expect(yt.calls.every((c) => c.endpoint === 'videos')).toBe(true);
		expect(summary.refresh).toMatchObject({ checked: 7, refreshed: 6, removed: 1, errors: [] });
		expect(video('fxPeb000010')?.fetchedAt).toEqual(later);
		expect(video('fxPeb000007')).toMatchObject({
			title: '',
			durationS: 0,
			publishedAt: new Date(0),
			status: 'ignored',
			// The placement stays, so the video returns to the same place.
			seriesId: ids.s1Extras,
			fetchedAt: later
		});
		const removal = db
			.select()
			.from(t.auditLog)
			.where(eq(t.auditLog.entityId, video('fxPeb000007')!.id))
			.all()
			.at(-1);
		expect(removal).toMatchObject({ actor: 'sync', after: { title: '', status: 'ignored' } });

		// It comes back: restored in place.
		yt.videos.set('fxPeb000007', {
			id: 'fxPeb000007',
			snippet: {
				publishedAt: '2026-10-12T15:00:00Z',
				channelId: PEBBLE,
				title: '[S1] Bonus: Season 1 bloopers',
				liveBroadcastContent: 'none'
			},
			contentDetails: { duration: 'PT9M', caption: 'false' }
		});
		const again = await sync(new Date(later.getTime() + 26 * DAY), { refreshOnly: true });
		expect(again.refresh).toMatchObject({ restored: 1, removed: 0 });
		expect(video('fxPeb000007')).toMatchObject({
			title: '[S1] Bonus: Season 1 bloopers',
			status: 'placed',
			seriesId: ids.s1Extras
		});
	});

	it('leaves recently fetched videos alone', async () => {
		await sync(FIRST_RUN);
		yt.calls.length = 0;
		const summary = await sync(new Date(FIRST_RUN.getTime() + 10 * DAY), { refreshOnly: true });
		expect(summary.refresh).toMatchObject({ checked: 0 });
		expect(yt.calls).toHaveLength(0);
	});
});
