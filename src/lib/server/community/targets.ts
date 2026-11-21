/**
 * What a suggestion can point at (a video, a series or a creator) and the choices its form
 * offers. Only things the public can see are valid targets: placed videos that are not Shorts,
 * and creators who did not opt out.
 */
import { and, asc, eq, inArray, notInArray } from 'drizzle-orm';
import type { Executor } from '../audit.js';
import * as t from '../db/schema.js';

export const TARGET_TYPES = ['video', 'series', 'creator'] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

export type GroupChoice = {
	id: number;
	seriesId: number;
	kind: 'session' | 'week';
	number: number;
	title: string | null;
};
export type SeriesChoice = { id: number; title: string; parentId: number | null };

export interface VideoTarget {
	type: 'video';
	id: number;
	key: string;
	title: string;
	creatorName: string;
	creatorId: number;
	channelId: number;
	publishedAt: Date;
	hasCreatorCaptions: boolean;
	seriesId: number;
	seriesSlug: string;
	seriesTitle: string;
	groupId: number | null;
	/** The Extras series a livestream VOD of this video's main series goes to. */
	extras: { id: number; title: string } | null;
	series: SeriesChoice[];
	groups: GroupChoice[];
}

export interface SeriesTarget {
	type: 'series';
	id: number;
	key: string;
	title: string;
	kind: (typeof t.series.$inferSelect)['kind'];
	status: (typeof t.series.$inferSelect)['status'];
	startedAt: Date | null;
	endedAt: Date | null;
	parentId: number | null;
	hasExtras: boolean;
	/** Creators who do not take part yet (for "missing creator"). */
	otherCreators: { id: number; name: string }[];
	/** Channels of the participants (for a title rule idea). */
	channels: { id: number; title: string; creatorName: string }[];
}

export interface CreatorTarget {
	type: 'creator';
	id: number;
	key: string;
	name: string;
	bio: string | null;
	/** Series this creator takes part in (for a title rule idea). */
	inSeries: SeriesChoice[];
	/** Series this creator is missing from. */
	otherSeries: SeriesChoice[];
	channels: { id: number; title: string; creatorName: string }[];
	/** Main series (of `inSeries`) that have an Extras child. */
	withExtras: number[];
}

export type Target = VideoTarget | SeriesTarget | CreatorTarget;

export function allSeriesChoices(db: Executor): SeriesChoice[] {
	const rows = db
		.select({ id: t.series.id, title: t.series.title, parentId: t.series.parentId })
		.from(t.series)
		.orderBy(asc(t.series.title))
		.all();
	const out: SeriesChoice[] = [];
	for (const main of rows.filter((r) => r.parentId === null)) {
		out.push(main, ...rows.filter((r) => r.parentId === main.id));
	}
	return out;
}

export function allGroupChoices(db: Executor): GroupChoice[] {
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

function extrasOf(db: Executor, seriesId: number) {
	return (
		db
			.select({ id: t.series.id, title: t.series.title })
			.from(t.series)
			.where(eq(t.series.parentId, seriesId))
			.get() ?? null
	);
}

function channelsOfCreators(db: Executor, creatorIds: number[]) {
	if (creatorIds.length === 0) return [];
	return db
		.select({ id: t.channels.id, title: t.channels.title, creatorName: t.creators.name })
		.from(t.channels)
		.innerJoin(t.creators, eq(t.creators.id, t.channels.creatorId))
		.where(inArray(t.channels.creatorId, creatorIds))
		.orderBy(asc(t.creators.name), asc(t.channels.id))
		.all();
}

function participantIds(db: Executor, seriesId: number): number[] {
	return db
		.select({ id: t.seriesCreators.creatorId })
		.from(t.seriesCreators)
		.where(eq(t.seriesCreators.seriesId, seriesId))
		.all()
		.map((r) => r.id);
}

export function loadVideoTarget(db: Executor, youtubeVideoId: string): VideoTarget | null {
	const row = db
		.select({
			id: t.videos.id,
			title: t.videos.title,
			publishedAt: t.videos.publishedAt,
			hasCreatorCaptions: t.videos.hasCreatorCaptions,
			seriesId: t.videos.seriesId,
			groupId: t.videos.groupId,
			channelId: t.videos.channelId,
			creatorId: t.creators.id,
			creatorName: t.creators.name,
			seriesSlug: t.series.slug,
			seriesTitle: t.series.title,
			seriesParentId: t.series.parentId
		})
		.from(t.videos)
		.innerJoin(t.channels, eq(t.channels.id, t.videos.channelId))
		.innerJoin(t.creators, eq(t.creators.id, t.channels.creatorId))
		.innerJoin(t.series, eq(t.series.id, t.videos.seriesId))
		.where(
			and(
				eq(t.videos.youtubeVideoId, youtubeVideoId),
				eq(t.videos.status, 'placed'),
				eq(t.videos.isShort, false),
				eq(t.creators.optedOut, false)
			)
		)
		.get();
	if (!row || row.seriesId === null) return null;
	return {
		type: 'video',
		id: row.id,
		key: youtubeVideoId,
		title: row.title,
		creatorName: row.creatorName,
		creatorId: row.creatorId,
		channelId: row.channelId,
		publishedAt: row.publishedAt,
		hasCreatorCaptions: row.hasCreatorCaptions,
		seriesId: row.seriesId,
		seriesSlug: row.seriesSlug,
		seriesTitle: row.seriesTitle,
		groupId: row.groupId,
		// Only a video in a main series can move to that series' Extras.
		extras: row.seriesParentId === null ? extrasOf(db, row.seriesId) : null,
		series: allSeriesChoices(db),
		groups: allGroupChoices(db)
	};
}

export function loadSeriesTarget(db: Executor, slug: string): SeriesTarget | null {
	const s = db.select().from(t.series).where(eq(t.series.slug, slug)).get();
	if (!s) return null;
	const members = participantIds(db, s.id);
	return {
		type: 'series',
		id: s.id,
		key: s.slug,
		title: s.title,
		kind: s.kind,
		status: s.status,
		startedAt: s.startedAt,
		endedAt: s.endedAt,
		parentId: s.parentId,
		hasExtras: extrasOf(db, s.id) !== null,
		otherCreators: db
			.select({ id: t.creators.id, name: t.creators.name })
			.from(t.creators)
			.where(
				and(
					eq(t.creators.optedOut, false),
					members.length ? notInArray(t.creators.id, members) : undefined
				)
			)
			.orderBy(asc(t.creators.name))
			.all(),
		channels: channelsOfCreators(db, members)
	};
}

export function loadCreatorTarget(db: Executor, slug: string): CreatorTarget | null {
	const c = db
		.select()
		.from(t.creators)
		.where(and(eq(t.creators.slug, slug), eq(t.creators.optedOut, false)))
		.get();
	if (!c) return null;
	const inIds = new Set(
		db
			.select({ id: t.seriesCreators.seriesId })
			.from(t.seriesCreators)
			.where(eq(t.seriesCreators.creatorId, c.id))
			.all()
			.map((r) => r.id)
	);
	const all = allSeriesChoices(db);
	const mains = all.filter((s) => s.parentId === null);
	const parents = new Set(all.map((s) => s.parentId).filter((n): n is number => n !== null));
	return {
		type: 'creator',
		id: c.id,
		key: c.slug,
		name: c.name,
		bio: c.bio,
		inSeries: mains.filter((s) => inIds.has(s.id)),
		otherSeries: mains.filter((s) => !inIds.has(s.id)),
		channels: channelsOfCreators(db, [c.id]),
		withExtras: mains.filter((s) => inIds.has(s.id) && parents.has(s.id)).map((s) => s.id)
	};
}

export function loadTarget(db: Executor, type: string, key: string): Target | null {
	if (!key) return null;
	if (type === 'video') return loadVideoTarget(db, key);
	if (type === 'series') return loadSeriesTarget(db, key);
	if (type === 'creator') return loadCreatorTarget(db, key);
	return null;
}

/** Creators who did not opt out, for the creator request form. */
export function publicCreators(db: Executor) {
	return db
		.select({ id: t.creators.id, name: t.creators.name, slug: t.creators.slug })
		.from(t.creators)
		.where(eq(t.creators.optedOut, false))
		.orderBy(asc(t.creators.name))
		.all();
}
