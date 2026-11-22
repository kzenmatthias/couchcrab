/**
 * Read-only queries for the public browse pages.
 *
 * Public rules, applied in every query here:
 * - only placed videos (Unsorted and ignored videos are never shown publicly), no Shorts;
 * - creators who opted out, and all their videos, never appear;
 * - channels a creator unlinked, and their videos, never appear.
 *
 * `searchCatalog` follows the same rules, and leaves hidden (spoiler-free) titles out.
 */
import { and, desc, eq, inArray, isNotNull, isNull, max, sql } from 'drizzle-orm';
import { pickTranslation } from '#lib/i18n.js';
import { matchesTerms, matchRank, normalizeSearch, searchTerms } from '#lib/search.js';
import type { PosterView } from '#lib/poster.js';
import type { VideoCard } from '#lib/video.js';
import { db, schema } from './db/index.js';
import { resolvePosters } from './posters.js';

const { creators, channels, series, seriesCreators, seriesTranslations, groups, videos } = schema;

const visibleVideo = and(
	eq(videos.status, 'placed'),
	eq(videos.isShort, false),
	eq(creators.optedOut, false),
	isNull(channels.unlinkedAt)
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
			liveStartedAt: videos.liveStartedAt,
			episodeNumber: videos.episodeNumber,
			groupId: videos.groupId,
			seriesId: videos.seriesId,
			seriesParentId: series.parentId,
			creatorId: creators.id,
			creatorSlug: creators.slug,
			creatorName: creators.name,
			creatorColor: creators.color,
			creatorAvatarUrl: creators.avatarUrl,
			seriesSlug: series.slug,
			seriesTitle: series.title
		})
		.from(videos)
		.innerJoin(channels, eq(channels.id, videos.channelId))
		.innerJoin(creators, eq(creators.id, channels.creatorId))
		.innerJoin(series, eq(series.id, videos.seriesId));
}

type VideoRow = Awaited<ReturnType<ReturnType<typeof videoQuery>['all']>>[number];

function toCard(r: VideoRow): VideoCard {
	return {
		id: r.id,
		youtubeVideoId: r.youtubeVideoId,
		title: r.title,
		publishedAt: r.publishedAt,
		durationS: r.durationS,
		hasCreatorCaptions: r.hasCreatorCaptions,
		liveStartedAt: r.liveStartedAt,
		episodeNumber: r.episodeNumber,
		groupId: r.groupId,
		seriesId: r.seriesId!,
		povSeriesId: r.seriesParentId ?? r.seriesId!,
		creator: {
			id: r.creatorId,
			slug: r.creatorSlug,
			name: r.creatorName,
			color: r.creatorColor,
			avatarUrl: r.creatorAvatarUrl
		},
		series: { slug: r.seriesSlug, title: r.seriesTitle }
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
	/** The resolved poster: a public episode's image, an image URL, or `null` (plain surface). */
	poster: PosterView;
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

	const posters = resolvePosters(db, rows);
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
			poster: posters.get(r.id) ?? null,
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
			id: creators.id,
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

/**
 * Newest uploads first. `keep` filters for the viewer (who I watch); a window of recent uploads
 * is read so the filtered list is still full.
 */
export function latestVideos(limit = 12, keep: (video: VideoCard) => boolean = () => true) {
	return videoQuery()
		.where(visibleVideo)
		.orderBy(desc(videos.publishedAt), desc(videos.id))
		.limit(Math.max(limit, 400))
		.all()
		.map(toCard)
		.filter(keep)
		.slice(0, limit);
}

/** Public episodes by YouTube id, in the order of `ids` (unknown or hidden ids are skipped). */
export function videosByYoutubeIds(ids: readonly string[]): VideoCard[] {
	if (ids.length === 0) return [];
	const rows = videoQuery()
		.where(and(visibleVideo, inArray(videos.youtubeVideoId, [...ids])))
		.all()
		.map(toCard);
	const byId = new Map(rows.map((r) => [r.youtubeVideoId, r]));
	return ids.map((id) => byId.get(id)).filter((v): v is VideoCard => v !== undefined);
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
			parentId: s.parentId,
			slug: s.slug,
			title: s.title,
			grouping: s.grouping,
			startedAt: s.startedAt
		},
		group
	};
}

/* ---------- watch together ---------- */

/**
 * Other public live VODs of the same series whose livestream overlapped this one in time: the
 * other POVs of the same stream. Empty when the video is not a live VOD with a known start.
 */
export function livePartners(video: VideoCard): VideoCard[] {
	if (!video.liveStartedAt) return [];
	const start = video.liveStartedAt.getTime();
	const end = start + Math.max(video.durationS, 1) * 1000;
	return videoQuery()
		.where(
			and(
				visibleVideo,
				eq(videos.seriesId, video.seriesId),
				isNotNull(videos.liveStartedAt),
				sql`${videos.id} <> ${video.id}`
			)
		)
		.orderBy(videos.liveStartedAt, videos.id)
		.all()
		.map(toCard)
		.filter((v) => {
			const s = v.liveStartedAt!.getTime();
			return s < end && s + Math.max(v.durationS, 1) * 1000 > start;
		});
}

/* ---------- creators ---------- */

export function listCreators() {
	return db
		.select({
			id: creators.id,
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
		.where(and(eq(channels.creatorId, creator.id), isNull(channels.unlinkedAt)))
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
			links: creator.links,
			claimedAt: creator.claimedAt
		},
		channels: channelRows,
		series: creatorSeries,
		uploads
	};
}

/* ---------- search ---------- */

export const SEARCH_SECTIONS = ['series', 'creators', 'episodes'] as const;
export type SearchSection = (typeof SEARCH_SECTIONS)[number];

/** Results per section on the first page, and with "Show all". */
export const SEARCH_LIMITS: Record<SearchSection, number> = {
	series: 6,
	creators: 8,
	episodes: 12
};
export const SEARCH_EXPANDED_MAX = 100;

export type CreatorHit = {
	slug: string;
	name: string;
	color: string;
	avatarUrl: string | null;
	claimedAt: Date | null;
	/** The channel that matched, when the creator's name itself did not. */
	viaChannel: string | null;
};

export type SearchResult<T> = { items: T[]; total: number; expanded: boolean };

export type SearchResults = {
	series: SearchResult<SeriesSummary>;
	creators: SearchResult<CreatorHit>;
	episodes: SearchResult<VideoCard>;
	total: number;
};

function take<T>(all: T[], section: SearchSection, expand: readonly SearchSection[]) {
	const expanded = expand.includes(section);
	const limit = expanded ? SEARCH_EXPANDED_MAX : SEARCH_LIMITS[section];
	return { items: all.slice(0, limit), total: all.length, expanded };
}

/**
 * Searches series titles, creator names and channel titles, and episode titles, with the
 * public rules of this file. `isSpoilerFree(povSeriesId)` tells which series hide episode
 * titles for this viewer: those titles are never matched and come back empty with
 * `titleHidden`, so an episode there is only found by its creator, channel or series.
 * Sections in `expand` return up to `SEARCH_EXPANDED_MAX` items.
 */
export function searchCatalog(
	query: string,
	{
		isSpoilerFree = () => false,
		expand = []
	}: { isSpoilerFree?: (povSeriesId: number) => boolean; expand?: readonly SearchSection[] } = {}
): SearchResults | null {
	const terms = searchTerms(query);
	if (terms.length === 0) return null;

	const seriesHits = listSeries()
		.map((s) => ({ s, title: normalizeSearch(s.title) }))
		.filter((x) => matchesTerms(terms, [x.title]))
		.sort(
			(a, b) =>
				matchRank(terms, a.title) - matchRank(terms, b.title) || a.s.title.localeCompare(b.s.title)
		)
		.map((x) => x.s);

	const channelRows = db
		.select({ creatorId: channels.creatorId, title: channels.title })
		.from(channels)
		.where(isNull(channels.unlinkedAt))
		.all();
	const creatorHits = listCreators()
		.map((c) => {
			const name = normalizeSearch(c.name);
			const own = channelRows.filter((ch) => ch.creatorId === c.id);
			const byName = matchesTerms(terms, [name]);
			const channel = byName
				? null
				: own.find((ch) => matchesTerms(terms, [name, normalizeSearch(ch.title)]));
			return { c, name, byName, channel };
		})
		.filter((x) => x.byName || x.channel)
		.sort(
			(a, b) =>
				Number(b.byName) - Number(a.byName) ||
				matchRank(terms, a.name) - matchRank(terms, b.name) ||
				a.c.name.localeCompare(b.c.name)
		)
		.map(({ c, channel }): CreatorHit => ({
			slug: c.slug,
			name: c.name,
			color: c.color,
			avatarUrl: c.avatarUrl,
			claimedAt: c.claimedAt,
			viaChannel: channel?.title ?? null
		}));

	const episodeRows = db
		.select({
			id: videos.id,
			title: videos.title,
			publishedAt: videos.publishedAt,
			seriesId: videos.seriesId,
			parentId: series.parentId,
			seriesTitle: series.title,
			creatorName: creators.name,
			channelTitle: channels.title
		})
		.from(videos)
		.innerJoin(channels, eq(channels.id, videos.channelId))
		.innerJoin(creators, eq(creators.id, channels.creatorId))
		.innerJoin(series, eq(series.id, videos.seriesId))
		.where(visibleVideo)
		.all();
	const hidden = new Map<number, boolean>();
	const isHidden = (povId: number) => {
		if (!hidden.has(povId)) hidden.set(povId, isSpoilerFree(povId));
		return hidden.get(povId)!;
	};
	const episodeHits = episodeRows
		.map((v) => {
			const titleHidden = isHidden(v.parentId ?? v.seriesId!);
			const title = titleHidden ? '' : normalizeSearch(v.title);
			const others = [v.creatorName, v.channelTitle, v.seriesTitle].map(normalizeSearch);
			return {
				v,
				titleHidden,
				matched: matchesTerms(terms, [title, ...others]),
				byTitle: title !== '' && matchesTerms(terms, [title])
			};
		})
		.filter((x) => x.matched)
		.sort(
			(a, b) =>
				Number(b.byTitle) - Number(a.byTitle) ||
				b.v.publishedAt.getTime() - a.v.publishedAt.getTime() ||
				b.v.id - a.v.id
		);
	const episodes = take(episodeHits, 'episodes', expand);
	const ids = episodes.items.map((x) => x.v.id);
	const cards = new Map(
		(ids.length ? videoQuery().where(inArray(videos.id, ids)).all() : []).map((r) => [
			r.id,
			toCard(r)
		])
	);
	const episodeCards = episodes.items.map(({ v, titleHidden }): VideoCard => {
		const card = cards.get(v.id)!;
		return titleHidden ? { ...card, title: '', titleHidden: true } : card;
	});

	const result: SearchResults = {
		series: take(seriesHits, 'series', expand),
		creators: take(creatorHits, 'creators', expand),
		episodes: { ...episodes, items: episodeCards },
		total: 0
	};
	result.total = result.series.total + result.creators.total + result.episodes.total;
	return result;
}
