/** The Unsorted queue: place a video by hand, ignore it, or send it back to Unsorted. */
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { Executor } from '../audit.js';
import type { DB } from '../db/client.js';
import * as t from '../db/schema.js';
import {
	type Actor,
	assertRole,
	auditUser,
	Checker,
	id,
	type Input,
	NotFoundError,
	text
} from './core.js';

export const QUEUE_LIMIT = 200;

export function listQueue(db: DB, actor: Actor, status: 'unsorted' | 'ignored') {
	assertRole(actor, 'editor');
	return (
		db
			.select({
				id: t.videos.id,
				youtubeVideoId: t.videos.youtubeVideoId,
				title: t.videos.title,
				publishedAt: t.videos.publishedAt,
				durationS: t.videos.durationS,
				isShort: t.videos.isShort,
				isLiveVod: t.videos.isLiveVod,
				channelTitle: t.channels.title,
				creatorName: t.creators.name
			})
			.from(t.videos)
			.innerJoin(t.channels, eq(t.channels.id, t.videos.channelId))
			.innerJoin(t.creators, eq(t.creators.id, t.channels.creatorId))
			// Videos of a channel the creator unlinked stay out of the queue until it is restored.
			.where(and(eq(t.videos.status, status), isNull(t.channels.unlinkedAt)))
			.orderBy(desc(t.videos.publishedAt), desc(t.videos.id))
			.limit(QUEUE_LIMIT)
			.all()
	);
}

/** Groups of every series, for the placement form. */
export function groupChoices(db: DB) {
	return db
		.select({
			id: t.groups.id,
			seriesId: t.groups.seriesId,
			kind: t.groups.kind,
			number: t.groups.number,
			title: t.groups.title
		})
		.from(t.groups)
		.orderBy(asc(t.groups.seriesId), asc(t.groups.kind), asc(t.groups.number))
		.all();
}

type VideoRow = typeof t.videos.$inferSelect;
export const placementOf = (v: VideoRow) => ({
	seriesId: v.seriesId,
	groupId: v.groupId,
	status: v.status,
	placedBy: v.placedBy
});

export function loadVideo(db: DB, videoId: number): VideoRow {
	const video = db.select().from(t.videos).where(eq(t.videos.id, videoId)).get();
	if (!video) throw new NotFoundError();
	return video;
}

/**
 * Reads and checks a placement form: `series_id` (required, must exist) and an optional
 * `group_id` of that series. Throws a `ValidationError`.
 */
export function parsePlacement(db: DB, input: Input): { seriesId: number; groupId: number | null } {
	const c = new Checker();
	const seriesId = id(text(input, 'series_id'));
	if (!text(input, 'series_id')) c.fail('series_id', 'required');
	else if (
		seriesId === null ||
		!db.select({ id: t.series.id }).from(t.series).where(eq(t.series.id, seriesId)).get()
	)
		c.fail('series_id', 'invalid_choice');
	let groupId: number | null = null;
	if (text(input, 'group_id')) {
		groupId = id(text(input, 'group_id'));
		const group =
			groupId === null
				? undefined
				: db
						.select({ seriesId: t.groups.seriesId })
						.from(t.groups)
						.where(eq(t.groups.id, groupId))
						.get();
		if (!group) c.fail('group_id', 'invalid_choice');
		else if (seriesId !== null && group.seriesId !== seriesId) c.fail('group_id', 'group_mismatch');
	}
	c.done();
	return { seriesId: seriesId!, groupId };
}

/** The audit writer of the person changing a placement (an editor, or a claimed creator). */
export type PlacementAudit = (
	tx: Executor,
	videoId: number,
	before: Record<string, unknown>,
	after: Record<string, unknown>
) => void;

const editorAudit =
	(actor: Actor): PlacementAudit =>
	(tx, videoId, before, after) =>
		auditUser(tx, actor, 'video', videoId, before, after);

/** Writes a checked placement (`placed_by = user`) and its audit entry in one transaction. */
export function writePlacement(
	db: DB,
	before: VideoRow,
	placement: { seriesId: number; groupId: number | null },
	audit: PlacementAudit
): VideoRow {
	return db.transaction((tx) => {
		const row = tx
			.update(t.videos)
			.set({ ...placement, status: 'placed', placedBy: 'user' })
			.where(eq(t.videos.id, before.id))
			.returning()
			.get();
		audit(tx, before.id, placementOf(before), placementOf(row));
		return row;
	});
}

/** Writes `ignored` (or back to Unsorted, which clears the placement) and its audit entry. */
export function writeVideoStatus(
	db: DB,
	before: VideoRow,
	status: 'ignored' | 'unsorted',
	audit: PlacementAudit
): VideoRow {
	return db.transaction((tx) => {
		const row = tx
			.update(t.videos)
			.set(
				status === 'unsorted'
					? { status, seriesId: null, groupId: null, placedBy: null }
					: { status, placedBy: 'user' }
			)
			.where(eq(t.videos.id, before.id))
			.returning()
			.get();
		audit(tx, before.id, placementOf(before), placementOf(row));
		return row;
	});
}

/** Places a video in a series (main or Extras) and optionally a group. Sets `placed_by = user`. */
export function placeVideoByHand(db: DB, actor: Actor, videoId: number, input: Input): VideoRow {
	assertRole(actor, 'editor');
	const before = loadVideo(db, videoId);
	return writePlacement(db, before, parsePlacement(db, input), editorAudit(actor));
}

/** Ignores a video (`status = ignored`) or puts an ignored one back in Unsorted. */
export function setVideoStatus(
	db: DB,
	actor: Actor,
	videoId: number,
	status: 'ignored' | 'unsorted'
): VideoRow {
	assertRole(actor, 'editor');
	return writeVideoStatus(db, loadVideo(db, videoId), status, editorAudit(actor));
}

/**
 * Corrects the "creator captions" flag of a video (a reviewed suggestion or a revert). The sync
 * refreshes this flag from YouTube, so a later sync can set it back.
 */
export function setVideoCaptions(
	db: DB,
	actor: Actor,
	videoId: number,
	hasCreatorCaptions: boolean
): VideoRow {
	assertRole(actor, 'editor');
	const before = loadVideo(db, videoId);
	return db.transaction((tx) => {
		const row = tx
			.update(t.videos)
			.set({ hasCreatorCaptions })
			.where(eq(t.videos.id, videoId))
			.returning()
			.get();
		auditUser(
			tx,
			actor,
			'video',
			videoId,
			{ hasCreatorCaptions: before.hasCreatorCaptions },
			{ hasCreatorCaptions: row.hasCreatorCaptions }
		);
		return row;
	});
}
