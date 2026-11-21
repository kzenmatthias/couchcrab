/**
 * Read-only queries for the public browse pages.
 *
 * Public rules, applied in every query here:
 * - only placed videos (Unsorted and ignored videos are never shown publicly), no Shorts;
 * - creators who opted out, and all their videos, never appear.
 */
import { and, desc, eq, inArray, isNull, max, sql } from 'drizzle-orm';
import { pickTranslation } from '#lib/i18n.js';
import type { VideoCard } from '#lib/video.js';
import { db, schema } from './db/index.js';

const { creators, channels, series, seriesCreators, seriesTranslations, groups, videos } = schema;

const visibleVideo = and(
	eq(videos.status, 'placed'),
	eq(videos.isShort, false),
	eq(creators.optedOut, false)
);

function videoQuery() {
	return db
		.select({
			id: videos.id,
			youtubeVideoId: videos.youtubeVideoId,
			title: videos.title,
			publishedAt: videos.publishedAt,
			durationS: videos.durationS,
			hasCreatorCaptions: videos.hasCreatorCaptions,
			episodeNumber: videos.episodeNumber,
			groupId: videos.groupId,
			seriesId: videos.seriesId,
			creatorSlug: creators.slug,
			creatorName: creators.name,
			creatorColor: creators.color,
			creatorAvatarUrl: creators.avatarUrl,
			seriesSlug: series.slug,
			seriesTitle: series.title,
			seriesPoster: series.poster
		})
		.from(videos)
		.innerJoin(channels, eq(channels.id, videos.channelId))
		.innerJoin(creators, eq(creators.id, channels.creatorId))
		.innerJoin(series, eq(series.id, videos.seriesId));
}

type VideoRow = Awaited<ReturnType<ReturnType<typeof videoQuery>['all']>>[number];

function toCard(r: VideoRow): VideoCard & { seriesId: number } {
	return {
		id: r.id,
		youtubeVideoId: r.youtubeVideoId,
		title: r.title,
		publishedAt: r.publishedAt,
		durationS: r.durationS,
		hasCreatorCaptions: r.hasCreatorCaptions,
		episodeNumber: r.episodeNumber,
		groupId: r.groupId,
		seriesId: r.seriesId!,
		creator: {
			slug: r.creatorSlug,
			name: r.creatorName,
			color: r.creatorColor,
			avatarUrl: r.creatorAvatarUrl
		},
		series: { slug: r.seriesSlug, title: r.seriesTitle, poster: r.seriesPoster }
	};
}

/* ---------- series ---------- */

export type SeriesSummary = {
	id: number;
	slug: string;
	title: string;
	kind: (typeof series.$inferSelect)['kind'];
	status: (typeof series.$inferSelect)['status'];
	grouping: (typeof series.$inferSelect)['grouping'];
	startedAt: Date | null;
	endedAt: Date | null;
	poster: (typeof series.$inferSelect)['poster'];
	creatorCount: number;
	episodeCount: number;
	lastUploadAt: Date | null;
};

/** Main series (no Extras) with counts that respect the public rules. */
export function listSeries(where = isNull(series.parentId)): SeriesSummary[] {
	const rows = db.select().from(series).where(where).all();
	if (rows.length === 0) return [];
	const ids = rows.map((r) => r.id);

	const creatorCounts = db
		.select({ seriesId: seriesCreators.seriesId, n: sql<number>`count(*)` })
		.from(seriesCreators)
		.innerJoin(creators, eq(creators.id, seriesCreators.creatorId))
		.where(and(inArray(seriesCreators.seriesId, ids), eq(creators.optedOut, false)))
		.groupBy(seriesCreators.seriesId)
		.all();
	const episodeStats = db
		.select({
			seriesId: videos.seriesId,
			n: sql<number>`count(*)`,
			last: max(videos.publishedAt)
		})
		.from(videos)
		.innerJoin(channels, eq(channels.id, videos.channelId))
		.innerJoin(creators, eq(creators.id, channels.creatorId))
		.where(and(visibleVideo, inArray(videos.seriesId, ids)))
		.groupBy(videos.seriesId)
		.all();

	const cc = new Map(creatorCounts.map((r) => [r.seriesId, r.n]));
	const es = new Map(episodeStats.map((r) => [r.seriesId, r]));
	return rows
		.map((r) => ({
			id: r.id,
			slug: r.slug,
			title: r.title,
			kind: r.kind,
			status: r.status,
			grouping: r.grouping,
			startedAt: r.startedAt,
			endedAt: r.endedAt,
			poster: r.poster,
			creatorCount: cc.get(r.id) ?? 0,
			episodeCount: es.get(r.id)?.n ?? 0,
			lastUploadAt: es.get(r.id)?.last ?? null
		}))
		.sort((a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0));
}

/** The ongoing main series with the most recent upload (or the most recent start). */
export function featuredSeries(all: SeriesSummary[]): SeriesSummary | null {
	const recency = (s: SeriesSummary) => (s.lastUploadAt ?? s.startedAt)?.getTime() ?? 0;
	const ongoing = all.filter((s) => s.status === 'ongoing');
	return [...(ongoing.length ? ongoing : all)].sort((a, b) => recency(b) - recency(a))[0] ?? null;
}

export function seriesDescription(seriesId: number, locale: string) {
	const rows = db
		.select({ locale: seriesTranslations.locale, description: seriesTranslations.description })
		.from(seriesTranslations)
		.where(eq(seriesTranslations.seriesId, seriesId))
		.all();
	const picked = pickTranslation(rows, locale);
	return picked
		? {
				text: picked.value.description,
				locale: picked.value.locale,
				isFallback: picked.isFallback
			}
		: null;
}

export function seriesCreatorList(seriesId: number) {
	return db
		.select({
			slug: creators.slug,
			name: creators.name,
			color: creators.color,
			avatarUrl: creators.avatarUrl
		})
		.from(seriesCreators)
		.innerJoin(creators, eq(creators.id, seriesCreators.creatorId))
		.where(and(eq(seriesCreators.seriesId, seriesId), eq(creators.optedOut, false)))
		.orderBy(creators.name)
		.all();
}

export function getSeriesBySlug(slug: string) {
	const row = db.select().from(series).where(eq(series.slug, slug)).get();
	if (!row) return null;
	const [summary] = listSeries(eq(series.id, row.id));
	const extras = listSeries(eq(series.parentId, row.id));
	const parent = row.parentId
		? (db
				.select({ slug: series.slug, title: series.title })
				.from(series)
				.where(eq(series.id, row.parentId))
				.get() ?? null)
		: null;
	return { ...summary, parent, extras: extras[0] ?? null };
}

export function seriesVideos(seriesId: number) {
	return videoQuery()
		.where(and(visibleVideo, eq(videos.seriesId, seriesId)))
		.orderBy(videos.publishedAt, videos.id)
		.all()
		.map(toCard);
}

export function seriesSessions(seriesId: number) {
	return db
		.select({
			id: groups.id,
			number: groups.number,
			title: groups.title,
			startsAt: groups.startsAt
		})
		.from(groups)
		.where(and(eq(groups.seriesId, seriesId), eq(groups.kind, 'session')))
		.orderBy(groups.number)
		.all();
}

/* ---------- videos ---------- */

export function latestVideos(limit = 12) {
	return videoQuery()
		.where(visibleVideo)
		.orderBy(desc(videos.publishedAt), desc(videos.id))
		.limit(limit)
		.all()
		.map(toCard);
}

export function getVideo(youtubeVideoId: string) {
	const row = videoQuery()
		.where(and(visibleVideo, eq(videos.youtubeVideoId, youtubeVideoId)))
		.get();
	if (!row) return null;
	const s = db.select().from(series).where(eq(series.id, row.seriesId!)).get()!;
	const group = row.groupId
		? (db
				.select({
					id: groups.id,
					number: groups.number,
					title: groups.title,
					startsAt: groups.startsAt
				})
				.from(groups)
				.where(eq(groups.id, row.groupId))
				.get() ?? null)
		: null;
	return {
		video: toCard(row),
		series: {
			id: s.id,
			slug: s.slug,
			title: s.title,
			grouping: s.grouping,
			startedAt: s.startedAt,
			poster: s.poster
		},
		group
	};
}

/* ---------- creators ---------- */

export function listCreators() {
	return db
		.select({
			slug: creators.slug,
			name: creators.name,
			color: creators.color,
			avatarUrl: creators.avatarUrl,
			claimedAt: creators.claimedAt
		})
		.from(creators)
		.where(eq(creators.optedOut, false))
		.orderBy(creators.name)
		.all();
}

export function getCreatorBySlug(slug: string) {
	const creator = db
		.select()
		.from(creators)
		.where(and(eq(creators.slug, slug), eq(creators.optedOut, false)))
		.get();
	if (!creator) return null;
	const channelRows = db
		.select({
			youtubeChannelId: channels.youtubeChannelId,
			title: channels.title,
			kind: channels.kind
		})
		.from(channels)
		.where(eq(channels.creatorId, creator.id))
		.orderBy(channels.kind, channels.title)
		.all();
	const seriesIds = db
		.select({ id: seriesCreators.seriesId })
		.from(seriesCreators)
		.innerJoin(series, eq(series.id, seriesCreators.seriesId))
		.where(and(eq(seriesCreators.creatorId, creator.id), isNull(series.parentId)))
		.all()
		.map((r) => r.id);
	const creatorSeries = seriesIds.length ? listSeries(inArray(series.id, seriesIds)) : [];
	const uploads = videoQuery()
		.where(and(visibleVideo, eq(creators.id, creator.id)))
		.orderBy(desc(videos.publishedAt), desc(videos.id))
		.limit(12)
		.all()
		.map(toCard);
	return {
		creator: {
			slug: creator.slug,
			name: creator.name,
			color: creator.color,
			avatarUrl: creator.avatarUrl,
			bio: creator.bio,
			claimedAt: creator.claimedAt
		},
		channels: channelRows,
		series: creatorSeries,
		uploads
	};
}
