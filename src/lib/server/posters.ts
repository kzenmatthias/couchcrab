/**
 * Which image a series poster shows (`src/lib/poster.ts` for the shapes).
 *
 * - A chosen episode is used while it is publicly visible and placed in the series or its
 *   Extras (or, for an Extras series, its main series). Otherwise the poster is automatic.
 * - Automatic: the YouTube thumbnail of the first episode of the main series: the earliest
 *   published placed video, no Shorts, no live VODs, nothing from an opted-out creator or an
 *   unlinked channel. Uploads from before the series' start date and uploads on a secondary
 *   channel only count when there is nothing else. An Extras series uses the first episode of its main series.
 * - No such episode: `null`, the plain surface.
 *
 * `resolvePosters` does this for many series with two queries, for the list pages.
 */
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { normalizePoster, type PosterView } from '../poster.js';
import type { Executor } from './audit.js';
import * as t from './db/schema.js';

export type PosterRow = { id: number; parentId: number | null; poster: unknown };

/** The public visibility rules of `catalog.ts`, for a query joined with channels and creators. */
const visible = () =>
	and(
		eq(t.videos.status, 'placed'),
		eq(t.videos.isShort, false),
		eq(t.creators.optedOut, false),
		isNull(t.channels.unlinkedAt)
	);

/** The poster of each series, by series id. */
export function resolvePosters(db: Executor, rows: readonly PosterRow[]): Map<number, PosterView> {
	const out = new Map<number, PosterView>();
	if (rows.length === 0) return out;
	const mainOf = (r: PosterRow) => r.parentId ?? r.id;

	// Chosen episodes that are still public, with the main series they belong to.
	const chosenIds = new Set<string>();
	for (const r of rows) {
		const p = normalizePoster(r.poster);
		if (p?.type === 'image') out.set(r.id, { kind: 'image', url: p.url });
		else if (p?.type === 'video') chosenIds.add(p.youtubeVideoId);
	}
	const chosenMain = new Map<string, number>();
	if (chosenIds.size > 0) {
		for (const v of db
			.select({
				youtubeVideoId: t.videos.youtubeVideoId,
				main: sql<number>`coalesce(${t.series.parentId}, ${t.series.id})`
			})
			.from(t.videos)
			.innerJoin(t.channels, eq(t.channels.id, t.videos.channelId))
			.innerJoin(t.creators, eq(t.creators.id, t.channels.creatorId))
			.innerJoin(t.series, eq(t.series.id, t.videos.seriesId))
			.where(and(visible(), inArray(t.videos.youtubeVideoId, [...chosenIds])))
			.all())
			chosenMain.set(v.youtubeVideoId, v.main);
	}

	const needAuto = new Set<number>();
	for (const r of rows) {
		if (out.has(r.id)) continue;
		const p = normalizePoster(r.poster);
		if (p?.type === 'video' && chosenMain.get(p.youtubeVideoId) === mainOf(r)) {
			out.set(r.id, { kind: 'video', youtubeVideoId: p.youtubeVideoId, frame: p.frame });
			continue;
		}
		needAuto.add(mainOf(r));
	}

	if (needAuto.size > 0) {
		const ranked = db
			.select({
				seriesId: t.videos.seriesId,
				youtubeVideoId: t.videos.youtubeVideoId,
				// Uploads from before the series started (announcements, previews) and uploads on a
				// secondary channel (VODs, clips) only count when nothing else is there.
				rank: sql<number>`row_number() over (partition by ${t.videos.seriesId} order by case when ${t.series.startedAt} is not null and ${t.videos.publishedAt} < ${t.series.startedAt} then 1 else 0 end, case when ${t.channels.kind} = 'main' then 0 else 1 end, ${t.videos.publishedAt}, ${t.videos.id})`.as(
					'rank'
				)
			})
			.from(t.videos)
			.innerJoin(t.channels, eq(t.channels.id, t.videos.channelId))
			.innerJoin(t.creators, eq(t.creators.id, t.channels.creatorId))
			.innerJoin(t.series, eq(t.series.id, t.videos.seriesId))
			.where(
				and(visible(), eq(t.videos.isLiveVod, false), inArray(t.videos.seriesId, [...needAuto]))
			)
			.as('ranked');
		const first = new Map(
			db
				.select({ seriesId: ranked.seriesId, youtubeVideoId: ranked.youtubeVideoId })
				.from(ranked)
				.where(eq(ranked.rank, 1))
				.all()
				.map((r) => [r.seriesId, r.youtubeVideoId])
		);
		for (const r of rows) {
			if (out.has(r.id)) continue;
			const id = first.get(mainOf(r));
			out.set(r.id, id ? { kind: 'video', youtubeVideoId: id, frame: 'thumbnail' } : null);
		}
	}
	return out;
}

/** The poster of one series. */
export function resolvePoster(db: Executor, row: PosterRow): PosterView {
	return resolvePosters(db, [row]).get(row.id) ?? null;
}
