/**
 * The signed-in viewer's prefs and progress in the database (`/api/me/*`).
 *
 * - Who I watch: `user_creators` (global list) and `user_series_creators` (custom lists).
 * - Everything else of the prefs, the item stamps and which lists are set: `user_settings`.
 * - Progress per video: `progress`, keyed by the database id of the video; the API uses
 *   YouTube ids like the browser does. Times are whole seconds in the database.
 */
import { eq, inArray, sql } from 'drizzle-orm';
import type { DB } from './db/client.js';
import {
	creators,
	progress,
	series,
	userCreators,
	userSeriesCreators,
	userSettings,
	videos
} from './db/schema.js';
import type { AccountPrefs } from './db/schema.js';
import { cleanProgress, PROGRESS_MAX_ENTRIES, type ProgressMap } from '#lib/prefs/progress.js';
import { migratePrefs, PREFS_VERSION, type Prefs } from '#lib/prefs/schema.js';
import { PROGRESS_BATCH_MAX } from '#lib/prefs/sync.js';

/** Request bodies above this size are refused. */
export const MAX_BODY_BYTES = 256 * 1024;

export class BadRequest extends Error {
	constructor(
		message: string,
		readonly status = 400
	) {
		super(message);
	}
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/* ---------- request checks ---------- */

/**
 * CSRF: a write must come from this site. Browsers send `Origin` on every cross-origin and
 * every same-origin non-GET `fetch`; a missing header is refused too.
 */
export function isSameOrigin(request: Request, url: URL): boolean {
	return request.headers.get('origin') === url.origin;
}

/** Reads a JSON body: `application/json`, at most `MAX_BODY_BYTES`. */
export async function readJson(request: Request): Promise<unknown> {
	const type = request.headers.get('content-type') ?? '';
	if (!/^application\/json\b/i.test(type)) throw new BadRequest('Expected JSON', 415);
	const length = Number(request.headers.get('content-length') ?? 0);
	if (length > MAX_BODY_BYTES) throw new BadRequest('Body too large', 413);
	const text = await request.text();
	if (text.length > MAX_BODY_BYTES) throw new BadRequest('Body too large', 413);
	try {
		return JSON.parse(text);
	} catch {
		throw new BadRequest('Invalid JSON');
	}
}

/** `{ prefs }` with a version-1 prefs object, cleaned field by field by the prefs schema. */
export function parsePrefsBody(body: unknown): Prefs {
	if (!isObj(body) || !isObj(body.prefs)) throw new BadRequest('Expected { prefs }');
	if (body.prefs.version !== PREFS_VERSION) throw new BadRequest('Unknown prefs version');
	return migratePrefs(body.prefs);
}

/** `{ entries }` with at most `PROGRESS_BATCH_MAX` progress entries by YouTube id. */
export function parseProgressBody(body: unknown): ProgressMap {
	if (!isObj(body) || !isObj(body.entries)) throw new BadRequest('Expected { entries }');
	if (Object.keys(body.entries).length > PROGRESS_BATCH_MAX)
		throw new BadRequest(`At most ${PROGRESS_BATCH_MAX} entries per request`);
	return cleanProgress(body.entries);
}

/* ---------- prefs ---------- */

/** The account's prefs, or null when it never saved any. */
export function getAccountPrefs(db: DB, userId: number): Prefs | null {
	const row = db.select().from(userSettings).where(eq(userSettings.userId, userId)).get();
	if (!row) return null;
	const stored: Partial<AccountPrefs> = isObj(row.settings) ? row.settings : {};
	const rest = isObj(stored.prefs) ? stored.prefs : {};

	const global = db
		.select({ id: userCreators.creatorId })
		.from(userCreators)
		.where(eq(userCreators.userId, userId))
		.all()
		.map((r) => r.id)
		.sort((a, b) => a - b);
	const custom: Record<string, number[]> = {};
	for (const id of Array.isArray(stored.customSeries) ? stored.customSeries : [])
		custom[String(id)] = [];
	for (const r of db
		.select()
		.from(userSeriesCreators)
		.where(eq(userSeriesCreators.userId, userId))
		.all())
		(custom[String(r.seriesId)] ??= []).push(r.creatorId);

	return migratePrefs({
		...rest,
		version: PREFS_VERSION,
		creators: stored.creatorsMode === 'list' ? { mode: 'list', ids: global } : { mode: 'all' },
		series: Object.fromEntries(
			Object.entries(custom).map(([k, ids]) => [
				k,
				{ mode: 'custom', ids: ids.sort((a, b) => a - b) }
			])
		)
	});
}

/** Replaces the account's prefs. Ids of creators or series that do not exist are dropped. */
export function saveAccountPrefs(db: DB, userId: number, prefs: Prefs): Prefs {
	db.transaction((tx) => {
		const ids = (rows: { id: number }[]) => new Set(rows.map((r) => r.id));
		const knownCreators = ids(tx.select({ id: creators.id }).from(creators).all());
		const knownSeries = ids(tx.select({ id: series.id }).from(series).all());

		const global = prefs.creators.mode === 'list' ? prefs.creators.ids : [];
		tx.delete(userCreators).where(eq(userCreators.userId, userId)).run();
		const globalRows = global
			.filter((id) => knownCreators.has(id))
			.map((creatorId) => ({ userId, creatorId }));
		if (globalRows.length) tx.insert(userCreators).values(globalRows).run();

		tx.delete(userSeriesCreators).where(eq(userSeriesCreators.userId, userId)).run();
		const customSeries: number[] = [];
		const seriesRows: { userId: number; seriesId: number; creatorId: number }[] = [];
		for (const [key, choice] of Object.entries(prefs.series)) {
			const seriesId = Number(key);
			if (choice.mode !== 'custom' || !knownSeries.has(seriesId)) continue;
			customSeries.push(seriesId);
			for (const creatorId of choice.ids)
				if (knownCreators.has(creatorId)) seriesRows.push({ userId, seriesId, creatorId });
		}
		if (seriesRows.length) tx.insert(userSeriesCreators).values(seriesRows).run();

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { creators: _c, series: _s, ...rest } = prefs;
		const settings: AccountPrefs = {
			prefs: rest,
			creatorsMode: prefs.creators.mode,
			customSeries
		};
		const updatedAt = new Date();
		tx.insert(userSettings)
			.values({ userId, settings, updatedAt })
			.onConflictDoUpdate({ target: userSettings.userId, set: { settings, updatedAt } })
			.run();
	});
	return getAccountPrefs(db, userId)!;
}

/* ---------- progress ---------- */

export function getAccountProgress(db: DB, userId: number): ProgressMap {
	const rows = db
		.select({
			id: videos.youtubeVideoId,
			seconds: progress.seconds,
			watchedAt: progress.watchedAt,
			updatedAt: progress.updatedAt
		})
		.from(progress)
		.innerJoin(videos, eq(videos.id, progress.videoId))
		.where(eq(progress.userId, userId))
		.orderBy(sql`${progress.updatedAt} DESC`)
		.limit(PROGRESS_MAX_ENTRIES)
		.all();
	const out: ProgressMap = {};
	for (const r of rows)
		out[r.id] = {
			seconds: r.seconds,
			watched: r.watchedAt !== null,
			updatedAt: r.updatedAt.getTime()
		};
	return out;
}

/**
 * Saves a batch of progress entries. Per video the newest entry wins, also against what the
 * account already has; videos that are not in the database are skipped. Returns how many
 * entries were known videos.
 */
export function saveAccountProgress(
	db: DB,
	userId: number,
	entries: ProgressMap,
	now = Date.now()
): number {
	const youtubeIds = Object.keys(entries);
	if (!youtubeIds.length) return 0;
	return db.transaction((tx) => {
		const known = tx
			.select({ id: videos.id, youtubeId: videos.youtubeVideoId })
			.from(videos)
			.where(inArray(videos.youtubeVideoId, youtubeIds))
			.all();
		for (const v of known) {
			const e = entries[v.youtubeId];
			// Whole seconds, never in the future (a wrong clock must not win every merge).
			const at = new Date(Math.floor(Math.min(e.updatedAt, now) / 1000) * 1000);
			tx.insert(progress)
				.values({
					userId,
					videoId: v.id,
					seconds: e.seconds,
					watchedAt: e.watched ? at : null,
					updatedAt: at
				})
				.onConflictDoUpdate({
					target: [progress.userId, progress.videoId],
					set: {
						seconds: sql`excluded.seconds`,
						// Keep the first time it was watched.
						watchedAt: sql`CASE WHEN excluded.watched_at IS NULL THEN NULL ELSE coalesce(${progress.watchedAt}, excluded.watched_at) END`,
						updatedAt: sql`excluded.updated_at`
					},
					setWhere: sql`excluded.updated_at >= ${progress.updatedAt}`
				})
				.run();
		}
		return known.length;
	});
}

/** For tests and the snapshot route: both parts at once. */
export function getAccountSnapshot(db: DB, userId: number) {
	return { prefs: getAccountPrefs(db, userId), progress: getAccountProgress(db, userId) };
}
