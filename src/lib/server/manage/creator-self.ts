/**
 * The creator dashboard (`/creator`): a claimed creator changes their own profile, channels and
 * videos, and can hide everything (opt out). Same rules as the rest of the service layer: every
 * function checks on the server who is acting, validates, and writes in one transaction with an
 * `audit_log` entry, here with actor `creator`, so admins can see and revert it.
 *
 * Permission rules (unit tested):
 * - only the creator the user claimed (`users.creator_id`, read again from the database);
 * - only videos on that creator's channels;
 * - only series the creator takes part in (`series_creators`) and their Extras.
 */
import { and, asc, count, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { PROFILE_COLORS } from '#lib/creator-colors.js';
import { type Executor, writeAudit } from '../audit.js';
import type { DB } from '../db/client.js';
import * as t from '../db/schema.js';
import {
	Checker,
	ForbiddenError,
	id,
	type Input,
	NotFoundError,
	optionalText,
	optionalUrl,
	text,
	ValidationError
} from './core.js';
import { BIO_MAX, creatorSnapshot } from './creators.js';
import {
	loadVideo,
	parsePlacement,
	type PlacementAudit,
	writePlacement,
	writeVideoStatus
} from './videos.js';

/** A signed-in user acting on the creator profile they claimed. Built from `locals.user`. */
export interface CreatorActor {
	/** The user id. */
	id: number;
	creatorId: number;
}

export const LINKS_MAX = 5;
export const OWN_VIDEOS_LIMIT = 300;

type CreatorRow = typeof t.creators.$inferSelect;

/**
 * Checks that the acting user still holds this creator profile (read from the database, not
 * from the session) and returns the creator. Throws `ForbiddenError` otherwise.
 */
export function assertOwnCreator(db: DB | Executor, actor: CreatorActor): CreatorRow {
	const user = db
		.select({ creatorId: t.users.creatorId })
		.from(t.users)
		.where(eq(t.users.id, actor.id))
		.get();
	if (!user || user.creatorId === null || user.creatorId !== actor.creatorId) {
		throw new ForbiddenError();
	}
	const creator = db.select().from(t.creators).where(eq(t.creators.id, actor.creatorId)).get();
	if (!creator) throw new ForbiddenError();
	return creator;
}

function auditCreator(
	tx: Executor,
	actor: CreatorActor,
	entity: string,
	entityId: number,
	before: Record<string, unknown> | null,
	after: Record<string, unknown> | null
) {
	return writeAudit(tx, {
		actor: 'creator',
		actorUserId: actor.id,
		entity,
		entityId,
		before,
		after
	});
}

/* ---------- profile ---------- */

export function getOwnProfile(db: DB, actor: CreatorActor) {
	const creator = assertOwnCreator(db, actor);
	const unsorted =
		db
			.select({ n: count() })
			.from(t.videos)
			.innerJoin(t.channels, eq(t.channels.id, t.videos.channelId))
			.where(and(eq(t.channels.creatorId, creator.id), eq(t.videos.status, 'unsorted')))
			.get()?.n ?? 0;
	return { creator, unsorted };
}

/** Reads the links textarea: one http(s) URL per line, at most `LINKS_MAX`. */
function parseLinks(c: Checker, input: Input): string[] {
	const lines = text(input, 'links')
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);
	if (lines.length > LINKS_MAX) {
		c.fail('links', 'too_long');
		return [];
	}
	const links: string[] = [];
	for (const line of lines) {
		const one = new Checker();
		const url = optionalUrl(one, { link: line }, 'link');
		if (!one.ok || !url) {
			c.fail('links', one.errors.link ?? 'invalid_url');
			return [];
		}
		if (!links.includes(url)) links.push(url);
	}
	return links;
}

/**
 * Saves bio, avatar URL, profile colour and links. The colour must be one of `PROFILE_COLORS`
 * (they keep the initials readable) or the colour the profile already has.
 */
export function updateOwnProfile(db: DB, actor: CreatorActor, input: Input): CreatorRow {
	const before = assertOwnCreator(db, actor);
	const c = new Checker();
	const bio = optionalText(c, input, 'bio', BIO_MAX);
	const avatarUrl = optionalUrl(c, input, 'avatar_url');
	const color = text(input, 'color').toLowerCase();
	if (!color) c.fail('color', 'required');
	else if (color !== before.color && !PROFILE_COLORS.some((p) => p.hex === color))
		c.fail('color', 'invalid_choice');
	const links = parseLinks(c, input);
	c.done();
	return db.transaction((tx) => {
		const row = tx
			.update(t.creators)
			.set({ bio, avatarUrl, color, links })
			.where(eq(t.creators.id, before.id))
			.returning()
			.get();
		auditCreator(tx, actor, 'creator', row.id, creatorSnapshot(before), creatorSnapshot(row));
		return row;
	});
}

/** Hides (or shows again) the profile and every video of this creator on the public site. */
export function setOwnOptOut(db: DB, actor: CreatorActor, optedOut: boolean): CreatorRow {
	const before = assertOwnCreator(db, actor);
	if (before.optedOut === optedOut) return before;
	return db.transaction((tx) => {
		const row = tx
			.update(t.creators)
			.set({ optedOut })
			.where(eq(t.creators.id, before.id))
			.returning()
			.get();
		auditCreator(tx, actor, 'creator', row.id, creatorSnapshot(before), creatorSnapshot(row));
		return row;
	});
}

/* ---------- channels ---------- */

export function listOwnChannels(db: DB, actor: CreatorActor) {
	const creator = assertOwnCreator(db, actor);
	const rows = db
		.select()
		.from(t.channels)
		.where(eq(t.channels.creatorId, creator.id))
		.orderBy(asc(t.channels.kind), asc(t.channels.id))
		.all();
	const counts = new Map(
		rows.length
			? db
					.select({ channelId: t.videos.channelId, n: count() })
					.from(t.videos)
					.where(
						inArray(
							t.videos.channelId,
							rows.map((r) => r.id)
						)
					)
					.groupBy(t.videos.channelId)
					.all()
					.map((r) => [r.channelId, r.n])
			: []
	);
	return rows.map((r) => ({
		id: r.id,
		youtubeChannelId: r.youtubeChannelId,
		title: r.title,
		kind: r.kind,
		lastSyncedAt: r.lastSyncedAt,
		verified: r.verifiedAt !== null,
		videos: counts.get(r.id) ?? 0
	}));
}

/**
 * Unlinks a secondary channel from the creator's own profile: the channel and its videos leave
 * Couchcrab and the sync stops reading it. The main channel cannot be unlinked.
 */
export function unlinkOwnChannel(db: DB, actor: CreatorActor, channelId: number): void {
	const creator = assertOwnCreator(db, actor);
	db.transaction((tx) => {
		const before = tx.select().from(t.channels).where(eq(t.channels.id, channelId)).get();
		if (!before) throw new NotFoundError();
		if (before.creatorId !== creator.id) throw new ForbiddenError();
		if (before.kind !== 'secondary') throw new ValidationError({ channel: 'invalid_choice' });
		const videos =
			tx.select({ n: count() }).from(t.videos).where(eq(t.videos.channelId, channelId)).get()?.n ??
			0;
		tx.delete(t.channels).where(eq(t.channels.id, channelId)).run();
		auditCreator(
			tx,
			actor,
			'channel',
			channelId,
			{
				creatorId: before.creatorId,
				youtubeChannelId: before.youtubeChannelId,
				title: before.title,
				kind: before.kind,
				syncEnabled: before.syncEnabled,
				videos
			},
			null
		);
	});
}

/* ---------- videos ---------- */

/** Series this creator takes part in, and the Extras series of those. */
function participatingSeriesIds(db: DB, creatorId: number): number[] {
	const direct = db
		.select({ id: t.seriesCreators.seriesId })
		.from(t.seriesCreators)
		.where(eq(t.seriesCreators.creatorId, creatorId))
		.all()
		.map((r) => r.id);
	if (direct.length === 0) return [];
	const extras = db
		.select({ id: t.series.id })
		.from(t.series)
		.where(inArray(t.series.parentId, direct))
		.all()
		.map((r) => r.id);
	return [...new Set([...direct, ...extras])];
}

/** The series (main first, each followed by its Extras) and groups the creator may place into. */
export function ownPlacementChoices(db: DB, actor: CreatorActor) {
	const creator = assertOwnCreator(db, actor);
	const ids = participatingSeriesIds(db, creator.id);
	if (ids.length === 0) return { series: [], groups: [] };
	const rows = db
		.select({ id: t.series.id, title: t.series.title, parentId: t.series.parentId })
		.from(t.series)
		.where(inArray(t.series.id, ids))
		.orderBy(desc(t.series.startedAt), asc(t.series.title))
		.all();
	const mains = rows.filter((r) => r.parentId === null || !ids.includes(r.parentId));
	const series = mains.flatMap((main) => [
		main,
		...rows.filter((r) => r.parentId === main.id && r !== main)
	]);
	const groups = db
		.select({
			id: t.groups.id,
			seriesId: t.groups.seriesId,
			kind: t.groups.kind,
			number: t.groups.number,
			title: t.groups.title
		})
		.from(t.groups)
		.where(inArray(t.groups.seriesId, ids))
		.orderBy(asc(t.groups.seriesId), asc(t.groups.kind), asc(t.groups.number))
		.all();
	return { series, groups };
}

export type OwnVideoStatus = 'unsorted' | 'placed' | 'ignored';

export interface OwnVideoFilter {
	status?: OwnVideoStatus | null;
	seriesId?: number | null;
}

/** The creator's own videos: unsorted first, then placed, then ignored; newest first in each. */
export function listOwnVideos(db: DB, actor: CreatorActor, filter: OwnVideoFilter = {}) {
	const creator = assertOwnCreator(db, actor);
	const where: SQL[] = [eq(t.channels.creatorId, creator.id)];
	if (filter.status) where.push(eq(t.videos.status, filter.status));
	if (filter.seriesId) where.push(eq(t.videos.seriesId, filter.seriesId));
	const rows = db
		.select({
			id: t.videos.id,
			youtubeVideoId: t.videos.youtubeVideoId,
			title: t.videos.title,
			publishedAt: t.videos.publishedAt,
			durationS: t.videos.durationS,
			isShort: t.videos.isShort,
			isLiveVod: t.videos.isLiveVod,
			status: t.videos.status,
			seriesId: t.videos.seriesId,
			groupId: t.videos.groupId,
			seriesTitle: t.series.title,
			channelTitle: t.channels.title
		})
		.from(t.videos)
		.innerJoin(t.channels, eq(t.channels.id, t.videos.channelId))
		.leftJoin(t.series, eq(t.series.id, t.videos.seriesId))
		.where(and(...where))
		.orderBy(desc(t.videos.publishedAt), desc(t.videos.id))
		.limit(OWN_VIDEOS_LIMIT)
		.all();
	const rank: Record<OwnVideoStatus, number> = { unsorted: 0, placed: 1, ignored: 2 };
	// A stable sort keeps the newest-first order inside each status.
	return rows.sort((a, b) => rank[a.status] - rank[b.status]);
}

/** Loads a video and checks it is on one of this creator's channels (403 otherwise). */
function loadOwnVideo(db: DB, creatorId: number, videoId: number) {
	const video = loadVideo(db, videoId);
	const channel = db
		.select({ creatorId: t.channels.creatorId })
		.from(t.channels)
		.where(eq(t.channels.id, video.channelId))
		.get();
	if (!channel || channel.creatorId !== creatorId) throw new ForbiddenError();
	return video;
}

const creatorAudit =
	(actor: CreatorActor): PlacementAudit =>
	(tx, videoId, before, after) =>
		auditCreator(tx, actor, 'video', videoId, before, after);

/**
 * Places one of the creator's own videos into a series they take part in (or its Extras), with
 * an optional session or week of that series. Writes `placed_by = user`, actor `creator`.
 */
export function placeOwnVideo(db: DB, actor: CreatorActor, videoId: number, input: Input) {
	const creator = assertOwnCreator(db, actor);
	const before = loadOwnVideo(db, creator.id, videoId);
	const placement = parsePlacement(db, input);
	if (!participatingSeriesIds(db, creator.id).includes(placement.seriesId)) {
		throw new ForbiddenError();
	}
	return writePlacement(db, before, placement, creatorAudit(actor));
}

/** Ignores one of the creator's own videos, or puts it back in Unsorted. */
export function setOwnVideoStatus(
	db: DB,
	actor: CreatorActor,
	videoId: number,
	status: 'ignored' | 'unsorted'
) {
	const creator = assertOwnCreator(db, actor);
	return writeVideoStatus(db, loadOwnVideo(db, creator.id, videoId), status, creatorAudit(actor));
}

/** Parses the `status` and `series` filters of the My videos page. */
export function parseVideoFilter(params: URLSearchParams): OwnVideoFilter {
	const status = params.get('status');
	return {
		status: status === 'unsorted' || status === 'placed' || status === 'ignored' ? status : null,
		seriesId: id(params.get('series') ?? '')
	};
}

/** Channels this user asked to add that are not on Couchcrab yet (creator requests in review). */
export function listOwnPendingClaims(db: DB, actor: CreatorActor) {
	assertOwnCreator(db, actor);
	return db
		.select({
			id: t.claims.id,
			youtubeChannelId: t.claims.youtubeChannelId,
			createdAt: t.claims.createdAt
		})
		.from(t.claims)
		.where(and(eq(t.claims.userId, actor.id), eq(t.claims.status, 'pending_review')))
		.orderBy(asc(t.claims.createdAt))
		.all();
}
