import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { DB } from '#lib/server/db/client.js';
import * as t from '#lib/server/db/schema.js';
import { seed } from '#lib/server/db/seed.js';
import {
	BadRequest,
	getAccountPrefs,
	getAccountProgress,
	isSameOrigin,
	MAX_BODY_BYTES,
	parsePrefsBody,
	parseProgressBody,
	readJson,
	saveAccountPrefs,
	saveAccountProgress
} from '#lib/server/me.js';
import { defaultPrefs, type Prefs } from '#lib/prefs/schema.js';
import { PROGRESS_BATCH_MAX } from '#lib/prefs/sync.js';
import { testDatabase } from './auth/helpers.js';

let db: DB;
let userId: number;
let creatorIds: number[];
let seriesId: number;
let youtubeIds: string[];

beforeEach(() => {
	db = testDatabase();
	seed(db);
	userId = db
		.insert(t.users)
		.values({ googleSub: 'unit-sync', name: 'Sync Fan' })
		.returning({ id: t.users.id })
		.get().id;
	creatorIds = db
		.select({ id: t.creators.id })
		.from(t.creators)
		.all()
		.map((r) => r.id);
	seriesId = db.select({ id: t.series.id }).from(t.series).get()!.id;
	youtubeIds = db
		.select({ id: t.videos.youtubeVideoId })
		.from(t.videos)
		.limit(3)
		.all()
		.map((r) => r.id);
});

const request = (body: string, headers: Record<string, string> = {}) =>
	new Request('http://localhost/api/me/snapshot', {
		method: 'PUT',
		headers: { 'content-type': 'application/json', ...headers },
		body
	});

async function badRequest(fn: () => unknown): Promise<BadRequest> {
	try {
		await fn();
	} catch (err) {
		if (err instanceof BadRequest) return err;
		throw err;
	}
	throw new Error('Expected a BadRequest');
}

describe('request checks', () => {
	it('only accepts writes from the same origin', () => {
		const url = new URL('http://localhost/api/me/snapshot');
		expect(isSameOrigin(request('{}', { origin: 'http://localhost' }), url)).toBe(true);
		expect(isSameOrigin(request('{}', { origin: 'https://evil.example' }), url)).toBe(false);
		expect(isSameOrigin(request('{}'), url)).toBe(false);
	});

	it('reads JSON only, and not too much of it', async () => {
		expect(await readJson(request('{"a":1}'))).toEqual({ a: 1 });
		expect((await badRequest(() => readJson(request('{', {})))).status).toBe(400);
		const form = new Request('http://localhost/', {
			method: 'PUT',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: 'a=1'
		});
		expect((await badRequest(() => readJson(form))).status).toBe(415);
		const big = request(JSON.stringify({ x: 'y'.repeat(MAX_BODY_BYTES) }));
		expect((await badRequest(() => readJson(big))).status).toBe(413);
	});

	it('validates the prefs body with the prefs schema', async () => {
		await badRequest(() => parsePrefsBody(null));
		await badRequest(() => parsePrefsBody({ prefs: [] }));
		await badRequest(() => parsePrefsBody({ prefs: { version: 2 } }));
		const p = parsePrefsBody({
			prefs: {
				version: 1,
				display: { textSize: 'huge' },
				creators: { mode: 'list', ids: [3, 'x'] }
			}
		});
		expect(p.display.textSize).toBe('default');
		expect(p.creators).toEqual({ mode: 'list', ids: [3] });
	});

	it('validates progress batches', async () => {
		await badRequest(() => parseProgressBody({}));
		await badRequest(() => parseProgressBody({ entries: [] }));
		const many = Object.fromEntries(
			Array.from({ length: PROGRESS_BATCH_MAX + 1 }, (_, i) => [
				`demo${String(i).padStart(7, '0')}`,
				{ seconds: 1, watched: false, updatedAt: 1 }
			])
		);
		await badRequest(() => parseProgressBody({ entries: many }));
		expect(
			parseProgressBody({
				entries: {
					demo0000001: { seconds: 5.7, watched: true, updatedAt: 9 },
					'bad id!': { seconds: 1 },
					demo0000002: { seconds: -1 }
				}
			})
		).toEqual({ demo0000001: { seconds: 5, watched: true, updatedAt: 9 } });
	});
});

describe('account prefs', () => {
	it('has none until saved', () => {
		expect(getAccountPrefs(db, userId)).toBeNull();
	});

	it('round-trips through the tables, lists in user_creators and user_series_creators', () => {
		const p: Prefs = {
			...defaultPrefs(),
			updatedAt: 50,
			stamps: { creators: 50, [`series.${seriesId}`]: 40, display: 30 },
			creators: { mode: 'list', ids: [creatorIds[1], creatorIds[0], 99999] },
			series: {
				[String(seriesId)]: { mode: 'custom', ids: [creatorIds[2]] },
				'88888': { mode: 'custom', ids: [] }
			},
			display: { textSize: 'large', motion: 'reduce', underlineLinks: true, textOnly: false }
		};
		const saved = saveAccountPrefs(db, userId, p);
		// Unknown creators and series are dropped.
		expect(saved.creators).toEqual({
			mode: 'list',
			ids: [creatorIds[0], creatorIds[1]].sort((a, b) => a - b)
		});
		expect(saved.series).toEqual({ [String(seriesId)]: { mode: 'custom', ids: [creatorIds[2]] } });
		expect(saved.display).toEqual(p.display);
		expect(saved.stamps).toEqual(p.stamps);
		expect(
			db.select().from(t.userCreators).where(eq(t.userCreators.userId, userId)).all()
		).toHaveLength(2);
		expect(db.select().from(t.userSeriesCreators).all()).toEqual([
			{ userId, seriesId, creatorId: creatorIds[2] }
		]);
	});

	it('keeps an empty list apart from everyone', () => {
		saveAccountPrefs(db, userId, {
			...defaultPrefs(),
			creators: { mode: 'list', ids: [] },
			series: { [String(seriesId)]: { mode: 'custom', ids: [] } }
		});
		const p = getAccountPrefs(db, userId)!;
		expect(p.creators).toEqual({ mode: 'list', ids: [] });
		expect(p.series[String(seriesId)]).toEqual({ mode: 'custom', ids: [] });
		saveAccountPrefs(db, userId, defaultPrefs());
		expect(getAccountPrefs(db, userId)!.creators).toEqual({ mode: 'all' });
		expect(db.select().from(t.userCreators).all()).toHaveLength(0);
	});
});

describe('account progress', () => {
	it('saves by YouTube id, newest wins, unknown videos are skipped', () => {
		const [a, b] = youtubeIds;
		const now = 1_000_000_000;
		expect(
			saveAccountProgress(
				db,
				userId,
				{
					[a]: { seconds: 100, watched: false, updatedAt: 500_400 },
					[b]: { seconds: 900, watched: true, updatedAt: 600_000 },
					demoUnknown1: { seconds: 1, watched: false, updatedAt: 1 }
				},
				now
			)
		).toBe(2);
		expect(getAccountProgress(db, userId)).toEqual({
			[a]: { seconds: 100, watched: false, updatedAt: 500_000 },
			[b]: { seconds: 900, watched: true, updatedAt: 600_000 }
		});

		// An older entry does not overwrite a newer one; a newer one does.
		saveAccountProgress(
			db,
			userId,
			{ [a]: { seconds: 5, watched: false, updatedAt: 100_000 } },
			now
		);
		saveAccountProgress(
			db,
			userId,
			{ [b]: { seconds: 10, watched: true, updatedAt: 700_000 } },
			now
		);
		const p = getAccountProgress(db, userId);
		expect(p[a].seconds).toBe(100);
		expect(p[b]).toEqual({ seconds: 10, watched: true, updatedAt: 700_000 });
		// The first watch time stays.
		const row = db
			.select()
			.from(t.progress)
			.all()
			.find((r) => r.seconds === 10)!;
		expect(row.watchedAt!.getTime()).toBe(600_000);
	});

	it('never stores a time in the future', () => {
		const [a] = youtubeIds;
		saveAccountProgress(
			db,
			userId,
			{ [a]: { seconds: 1, watched: false, updatedAt: 9e12 } },
			5_000
		);
		expect(getAccountProgress(db, userId)[a].updatedAt).toBe(5_000);
	});
});
