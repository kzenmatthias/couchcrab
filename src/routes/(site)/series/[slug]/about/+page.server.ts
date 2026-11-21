import { MIRROR_COOKIE, parseMirror } from '#lib/prefs/mirror.js';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { series as seriesTable } from '#lib/server/db/schema.js';
import { publicSeriesHistory } from '#lib/server/community/history.js';
import { isSpoilerFree } from '#lib/viewing.js';
import type { PageServerLoad } from './$types';

/** The recent public history of this series (no viewer names; no titles when spoiler-free). */
export const load: PageServerLoad = async ({ parent, cookies }) => {
	const { series } = await parent();
	const row = db
		.select({ parentId: seriesTable.parentId })
		.from(seriesTable)
		.where(eq(seriesTable.id, series.id))
		.get();
	const povId = row?.parentId ?? series.id;
	const spoilerFree = isSpoilerFree(parseMirror(cookies.get(MIRROR_COOKIE)), povId);
	return { history: publicSeriesHistory(db, series.id, { spoilerFree }) };
};
