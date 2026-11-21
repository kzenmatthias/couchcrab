import { count, eq, isNull } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const { series, seriesCreators } = schema;
	const rows = db
		.select({
			slug: series.slug,
			title: series.title,
			kind: series.kind,
			startedAt: series.startedAt,
			poster: series.poster,
			creatorCount: count(seriesCreators.creatorId)
		})
		.from(series)
		.leftJoin(seriesCreators, eq(seriesCreators.seriesId, series.id))
		.where(isNull(series.parentId))
		.groupBy(series.id)
		.orderBy(series.startedAt)
		.all();

	return { series: rows.reverse() };
};
