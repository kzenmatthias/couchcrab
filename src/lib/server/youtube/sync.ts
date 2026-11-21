/**
 * The YouTube sync: fetches new uploads, stores them, places them with the title rules, and
 * keeps stored API data fresh (YouTube API policy: refresh or delete within 30 days).
 *
 * Network calls happen first; all writes for one channel (or one refresh run) then happen in a
 * single transaction. A dry run performs the same writes and rolls them back, so its summary is
 * exactly what a real run would do.
 */
import { and, asc, eq, inArray, lt } from 'drizzle-orm';
import { TransactionRollbackError } from 'drizzle-orm/errors';
import { type Executor, writeAudit } from '../audit.js';
import type { DB } from '../db/client.js';
import * as t from '../db/schema.js';
import { type ClassifiedVideo, classifyVideo } from './classify.js';
import { type YouTubeClient, YouTubeApiError } from './client.js';
import { type CandidateRule, type RuleSeries, placeVideo } from './rules.js';

const DAY_S = 86_400;
/** Incremental syncs look this far back before `last_synced_at`, for late or rescheduled uploads. */
export const SAFETY_MARGIN_S = 3 * DAY_S;
/** On the first sync of a channel, take at most this many of its latest uploads. */
export const FIRST_SYNC_MAX = 200;
/** Runaway protection for incremental syncs. */
export const INCREMENTAL_MAX = 1000;
/** Stored API data older than this is refreshed (the policy limit is 30 days). */
export const REFRESH_AFTER_S = 25 * DAY_S;

export type VideoAction = 'placed' | 'unsorted' | 'ignored' | 'updated' | 'restored' | 'removed';

export interface SyncAction {
	youtubeVideoId: string;
	title: string;
	action: VideoAction;
	seriesId?: number;
	target?: 'main' | 'extras';
}

export interface ChannelSummary {
	youtubeChannelId: string;
	title: string;
	status: 'ok' | 'skipped' | 'error';
	note?: string;
	/** Uploads read from the playlist. */
	fetched: number;
	new: number;
	placed: number;
	unsorted: number;
	/** New Shorts, stored as `ignored`. */
	ignored: number;
	/** Upcoming or live-now items, left for a later sync. */
	skipped: number;
	/** Known videos whose data was refreshed. */
	updated: number;
	errors: string[];
	actions: SyncAction[];
}

export interface RefreshSummary {
	checked: number;
	refreshed: number;
	restored: number;
	removed: number;
	errors: string[];
	actions: SyncAction[];
}

export interface SyncSummary {
	dryRun: boolean;
	channels: ChannelSummary[];
	refresh: RefreshSummary | null;
}

export interface SyncOptions {
	db: DB;
	client: YouTubeClient;
	now?: () => Date;
	/** Only this YouTube channel id. */
	channel?: string;
	dryRun?: boolean;
	/** Skip fetching uploads; only run the retention refresh. */
	refreshOnly?: boolean;
	firstSyncMax?: number;
}

type ChannelRow = {
	id: number;
	creatorId: number;
	youtubeChannelId: string;
	title: string;
	lastSyncedAt: Date | null;
	optedOut: boolean;
};

type VideoRow = typeof t.videos.$inferSelect;

/** Runs `apply` in a transaction; in a dry run it is rolled back afterwards. */
function write<T>(db: DB, dryRun: boolean, apply: (tx: Executor) => T): T {
	let result: T | undefined;
	try {
		db.transaction((tx) => {
			result = apply(tx);
			if (dryRun) tx.rollback();
		});
	} catch (error) {
		if (!(dryRun && error instanceof TransactionRollbackError)) throw error;
	}
	return result as T;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function runSync(options: SyncOptions): Promise<SyncSummary> {
	const { db } = options;
	const dryRun = options.dryRun ?? false;
	const summary: SyncSummary = { dryRun, channels: [], refresh: null };

	const channelRows: ChannelRow[] = db
		.select({
			id: t.channels.id,
			creatorId: t.channels.creatorId,
			youtubeChannelId: t.channels.youtubeChannelId,
			title: t.channels.title,
			lastSyncedAt: t.channels.lastSyncedAt,
			optedOut: t.creators.optedOut
		})
		.from(t.channels)
		.innerJoin(t.creators, eq(t.creators.id, t.channels.creatorId))
		.where(
			and(
				eq(t.channels.syncEnabled, true),
				options.channel ? eq(t.channels.youtubeChannelId, options.channel) : undefined
			)
		)
		.orderBy(asc(t.channels.id))
		.all();

	if (options.channel && channelRows.length === 0) {
		throw new Error(`No channel with sync enabled has YouTube id ${options.channel}.`);
	}

	let quotaError: string | null = null;
	if (!options.refreshOnly) {
		for (const channel of channelRows) {
			if (quotaError) {
				summary.channels.push({
					...emptyChannelSummary(channel),
					status: 'error',
					errors: [`Not synced: ${quotaError}`]
				});
				continue;
			}
			const result = await syncChannel(options, channel);
			summary.channels.push(result);
			if (result.status === 'error' && result.note === 'quota') quotaError = result.errors[0];
		}
	}

	if (quotaError) {
		summary.refresh = { ...emptyRefreshSummary(), errors: [`Not run: ${quotaError}`] };
	} else {
		const channelId = options.channel ? channelRows[0]?.id : undefined;
		summary.refresh = await refreshStale(options, channelId);
	}
	return summary;
}

function emptyChannelSummary(channel: ChannelRow): ChannelSummary {
	return {
		youtubeChannelId: channel.youtubeChannelId,
		title: channel.title,
		status: 'ok',
		fetched: 0,
		new: 0,
		placed: 0,
		unsorted: 0,
		ignored: 0,
		skipped: 0,
		updated: 0,
		errors: [],
		actions: []
	};
}

function emptyRefreshSummary(): RefreshSummary {
	return { checked: 0, refreshed: 0, restored: 0, removed: 0, errors: [], actions: [] };
}

async function syncChannel(options: SyncOptions, channel: ChannelRow): Promise<ChannelSummary> {
	const s = emptyChannelSummary(channel);
	if (channel.optedOut) {
		return { ...s, status: 'skipped', note: 'Creator opted out' };
	}
	const now = options.now?.() ?? new Date();

	try {
		const yt = await options.client.getChannel(channel.youtubeChannelId);
		if (!yt) {
			return { ...s, status: 'error', errors: ['Channel not found on YouTube'] };
		}
		const since = channel.lastSyncedAt
			? new Date(channel.lastSyncedAt.getTime() - SAFETY_MARGIN_S * 1000)
			: null;
		const uploads = await options.client.listUploads(yt.uploadsPlaylistId, {
			publishedAfter: since,
			max: since ? INCREMENTAL_MAX : (options.firstSyncMax ?? FIRST_SYNC_MAX)
		});
		s.fetched = uploads.items.length;
		const listedAt = new Map(uploads.items.map((i) => [i.youtubeVideoId, i.publishedAt]));
		const details = (await options.client.getVideos([...listedAt.keys()])).map(classifyVideo);

		write(options.db, options.dryRun ?? false, (tx) => {
			const context = loadRuleContext(tx, channel.creatorId);
			let cursor = now;
			for (const video of details) {
				if (video.liveState !== 'none') {
					s.skipped++;
					// Come back for it: do not move the cursor past a stream that has not ended.
					const listed = listedAt.get(video.youtubeVideoId) ?? video.publishedAt;
					if (listed < cursor) cursor = listed;
					continue;
				}
				const existing = tx
					.select()
					.from(t.videos)
					.where(eq(t.videos.youtubeVideoId, video.youtubeVideoId))
					.get();
				if (existing) {
					const action = refreshVideo(tx, existing, video, now);
					if (action === 'restored') s.actions.push({ ...actionOf(video), action });
					s.updated++;
					continue;
				}
				insertVideo(tx, channel, video, now, context, s);
			}
			tx.update(t.channels)
				.set({ lastSyncedAt: cursor })
				.where(eq(t.channels.id, channel.id))
				.run();
		});
	} catch (error) {
		const quota = error instanceof YouTubeApiError && error.isQuota;
		return { ...s, status: 'error', note: quota ? 'quota' : undefined, errors: [message(error)] };
	}
	return s;
}

const actionOf = (video: Pick<ClassifiedVideo, 'youtubeVideoId' | 'title'>) => ({
	youtubeVideoId: video.youtubeVideoId,
	title: video.title
});

/** The API fields we store for a video. */
function apiFields(video: ClassifiedVideo, now: Date) {
	return {
		title: video.title,
		publishedAt: video.publishedAt,
		durationS: video.durationS,
		hasCreatorCaptions: video.hasCreatorCaptions,
		isLiveVod: video.isLiveVod,
		liveStartedAt: video.liveStartedAt,
		isShort: video.isShort,
		fetchedAt: now
	};
}

/** Marks a video whose API data was removed because YouTube stopped returning it. */
const isBlanked = (row: Pick<VideoRow, 'title' | 'status'>) =>
	row.title === '' && row.status === 'ignored';

/**
 * Refreshes the API data of a stored video. Never touches its placement. A video that was
 * blanked earlier (YouTube did not return it) and is back gets its previous status again.
 */
function refreshVideo(
	tx: Executor,
	row: VideoRow,
	video: ClassifiedVideo,
	now: Date
): 'updated' | 'restored' {
	const restore = isBlanked(row);
	const status: VideoRow['status'] = restore
		? row.seriesId !== null
			? 'placed'
			: video.isShort
				? 'ignored'
				: 'unsorted'
		: row.status;
	tx.update(t.videos)
		.set({ ...apiFields(video, now), status })
		.where(eq(t.videos.id, row.id))
		.run();
	if (restore) {
		writeAudit(tx, {
			actor: 'sync',
			entity: 'video',
			entityId: row.id,
			before: { title: row.title, status: row.status },
			after: { title: video.title, status },
			createdAt: now
		});
	}
	return restore ? 'restored' : 'updated';
}

function insertVideo(
	tx: Executor,
	channel: ChannelRow,
	video: ClassifiedVideo,
	now: Date,
	context: RuleContext,
	s: ChannelSummary
) {
	const status = video.isShort ? 'ignored' : 'unsorted';
	const placedBy = video.isShort ? 'sync' : null;
	const inserted = tx
		.insert(t.videos)
		.values({
			...apiFields(video, now),
			youtubeVideoId: video.youtubeVideoId,
			channelId: channel.id,
			status,
			placedBy
		})
		.returning({ id: t.videos.id })
		.get();
	s.new++;
	writeAudit(tx, {
		actor: 'sync',
		entity: 'video',
		entityId: inserted.id,
		before: null,
		after: {
			youtubeVideoId: video.youtubeVideoId,
			channelId: channel.id,
			title: video.title,
			status,
			placedBy
		},
		createdAt: now
	});

	if (video.isShort) {
		s.ignored++;
		s.actions.push({ ...actionOf(video), action: 'ignored' });
		return;
	}

	const placement = placeVideo(
		{
			title: video.title,
			channelId: channel.id,
			publishedAt: video.publishedAt,
			isLiveVod: video.isLiveVod
		},
		context.rules,
		context.series
	);
	if (!placement) {
		s.unsorted++;
		s.actions.push({ ...actionOf(video), action: 'unsorted' });
		return;
	}
	tx.update(t.videos)
		.set({
			seriesId: placement.seriesId,
			groupId: placement.groupId,
			status: 'placed',
			placedBy: 'rule'
		})
		.where(eq(t.videos.id, inserted.id))
		.run();
	writeAudit(tx, {
		actor: 'rule',
		entity: 'video',
		entityId: inserted.id,
		before: { seriesId: null, groupId: null, status: 'unsorted', placedBy: null },
		after: {
			seriesId: placement.seriesId,
			groupId: placement.groupId,
			status: 'placed',
			placedBy: 'rule',
			ruleId: placement.ruleId
		},
		createdAt: now
	});
	s.placed++;
	s.actions.push({
		...actionOf(video),
		action: 'placed',
		seriesId: placement.seriesId,
		target: placement.target
	});
}

export interface RuleContext {
	rules: CandidateRule[];
	series: Map<number, RuleSeries>;
}

/** Enabled rules of the series this creator takes part in, plus what the engine needs to know about those series. */
export function loadRuleContext(tx: Executor, creatorId: number): RuleContext {
	const seriesIds = tx
		.select({ id: t.seriesCreators.seriesId })
		.from(t.seriesCreators)
		.where(eq(t.seriesCreators.creatorId, creatorId))
		.all()
		.map((r) => r.id);
	if (seriesIds.length === 0) return { rules: [], series: new Map() };

	const rules: CandidateRule[] = tx
		.select()
		.from(t.titleRules)
		.where(and(inArray(t.titleRules.seriesId, seriesIds), eq(t.titleRules.enabled, true)))
		.all();
	const ruleSeriesIds = [...new Set(rules.map((r) => r.seriesId))];
	return { rules, series: loadRuleSeries(tx, ruleSeriesIds) };
}

/** What the rule engine needs to know about these series and their Extras children. */
export function loadRuleSeries(tx: Executor, ruleSeriesIds: number[]): Map<number, RuleSeries> {
	const series = new Map<number, RuleSeries>();
	if (ruleSeriesIds.length === 0) return series;
	const children = tx
		.select({ id: t.series.id, parentId: t.series.parentId })
		.from(t.series)
		.where(inArray(t.series.parentId, ruleSeriesIds))
		.orderBy(asc(t.series.id))
		.all();
	const allIds = [...ruleSeriesIds, ...children.map((c) => c.id)];
	const rows = tx
		.select({
			id: t.series.id,
			grouping: t.series.grouping,
			startedAt: t.series.startedAt,
			endedAt: t.series.endedAt
		})
		.from(t.series)
		.where(inArray(t.series.id, allIds))
		.all();
	const groups = tx.select().from(t.groups).where(inArray(t.groups.seriesId, allIds)).all();

	for (const row of rows) {
		series.set(row.id, {
			id: row.id,
			grouping: row.grouping,
			startedAt: row.startedAt,
			endedAt: row.endedAt,
			extrasId: children.find((c) => c.parentId === row.id)?.id ?? null,
			groups: groups
				.filter((g) => g.seriesId === row.id)
				.map((g) => ({ id: g.id, startsAt: g.startsAt, endsAt: g.endsAt }))
		});
	}
	return series;
}

/**
 * Retention: refreshes every video whose API data is older than `REFRESH_AFTER_S`. Videos that
 * YouTube no longer returns (deleted, private) are blanked: title, duration, flags and publish
 * date are cleared and the status becomes `ignored`. The YouTube id and the placement stay, so
 * the video comes back in place if YouTube returns it again.
 */
export async function refreshStale(
	options: SyncOptions,
	channelId?: number
): Promise<RefreshSummary> {
	const s = emptyRefreshSummary();
	const now = options.now?.() ?? new Date();
	const cutoff = new Date(now.getTime() - REFRESH_AFTER_S * 1000);
	const rows = options.db
		.select()
		.from(t.videos)
		.where(
			and(
				lt(t.videos.fetchedAt, cutoff),
				channelId !== undefined ? eq(t.videos.channelId, channelId) : undefined
			)
		)
		.orderBy(asc(t.videos.id))
		.all();
	s.checked = rows.length;
	if (rows.length === 0) return s;

	let found: Map<string, ClassifiedVideo>;
	try {
		const details = await options.client.getVideos(rows.map((r) => r.youtubeVideoId));
		found = new Map(details.map((d) => [d.id, classifyVideo(d)]));
	} catch (error) {
		s.errors.push(message(error));
		return s;
	}

	write(options.db, options.dryRun ?? false, (tx) => {
		for (const row of rows) {
			const video = found.get(row.youtubeVideoId);
			if (video) {
				const action = refreshVideo(tx, row, video, now);
				if (action === 'restored') {
					s.restored++;
					s.actions.push({ ...actionOf(video), action });
				} else s.refreshed++;
				continue;
			}
			if (isBlanked(row)) {
				tx.update(t.videos).set({ fetchedAt: now }).where(eq(t.videos.id, row.id)).run();
				continue;
			}
			tx.update(t.videos)
				.set({
					title: '',
					publishedAt: new Date(0),
					durationS: 0,
					hasCreatorCaptions: false,
					isLiveVod: false,
					liveStartedAt: null,
					isShort: false,
					status: 'ignored',
					fetchedAt: now
				})
				.where(eq(t.videos.id, row.id))
				.run();
			writeAudit(tx, {
				actor: 'sync',
				entity: 'video',
				entityId: row.id,
				before: { title: row.title, status: row.status },
				after: { title: '', status: 'ignored', reason: 'not returned by YouTube' },
				createdAt: now
			});
			s.removed++;
			s.actions.push({ youtubeVideoId: row.youtubeVideoId, title: row.title, action: 'removed' });
		}
	});
	return s;
}

/* ---------- report ---------- */

function table(headers: string[], rows: string[][]): string {
	const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
	const numeric = headers.map((_, i) => rows.every((r) => /^\d*$/.test(r[i])) && i > 0);
	const line = (cells: string[]) =>
		cells
			.map((c, i) => (numeric[i] ? c.padStart(widths[i]) : c.padEnd(widths[i])))
			.join('  ')
			.trimEnd();
	return [line(headers), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
}

/** Renders the summary as plain-text tables for the CLI. */
export function formatSummary(summary: SyncSummary, { actions = false } = {}): string {
	const out: string[] = [];
	if (summary.channels.length > 0) {
		out.push(
			table(
				[
					'Channel',
					'Status',
					'Fetched',
					'New',
					'Placed',
					'Unsorted',
					'Shorts',
					'Skipped',
					'Updated',
					'Errors'
				],
				summary.channels.map((c) => [
					`${c.title} (${c.youtubeChannelId})`,
					c.note && c.status !== 'error' ? `${c.status}: ${c.note}` : c.status,
					String(c.fetched),
					String(c.new),
					String(c.placed),
					String(c.unsorted),
					String(c.ignored),
					String(c.skipped),
					String(c.updated),
					String(c.errors.length)
				])
			)
		);
	}
	const r = summary.refresh;
	if (r) {
		out.push(
			table(
				['Retention', 'Checked', 'Refreshed', 'Restored', 'Removed', 'Errors'],
				[
					[
						'videos older than 25 days',
						String(r.checked),
						String(r.refreshed),
						String(r.restored),
						String(r.removed),
						String(r.errors.length)
					]
				]
			)
		);
	}
	const errors = [
		...summary.channels.flatMap((c) => c.errors.map((e) => `${c.youtubeChannelId}: ${e}`)),
		...(r?.errors.map((e) => `retention: ${e}`) ?? [])
	];
	if (errors.length > 0) out.push(['Errors:', ...errors.map((e) => `  ${e}`)].join('\n'));
	if (actions) {
		const list = [...summary.channels.flatMap((c) => c.actions), ...(r?.actions ?? [])];
		if (list.length > 0) {
			out.push(
				[
					'Videos:',
					...list.map(
						(a) =>
							`  ${a.action.padEnd(8)} ${a.youtubeVideoId}  ${a.title}` +
							(a.seriesId !== undefined ? `  -> series ${a.seriesId} (${a.target})` : '')
					)
				].join('\n')
			);
		}
	}
	return out.join('\n\n');
}
