import { db } from '#lib/server/db/index.js';
import { actorFor, load as guarded } from '#lib/server/manage/http.js';
import { applyRulesToUnsorted } from '#lib/server/manage/rules.js';
import { listSeries, seriesChoices } from '#lib/server/manage/series.js';
import { groupChoices } from '#lib/server/manage/videos.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const actor = actorFor(locals, 'editor');
	return {
		series: guarded(() => listSeries(db, actor)),
		seriesTitles: Object.fromEntries(seriesChoices(db).map((s) => [s.id, s.title])),
		groups: groupChoices(db)
	};
};

export const actions: Actions = {
	/** Dry run: what the engine would place, nothing written. */
	preview: ({ locals }) => {
		const actor = actorFor(locals, 'editor');
		return { preview: applyRulesToUnsorted(db, actor, { dryRun: true }) };
	},
	apply: ({ locals }) => {
		const actor = actorFor(locals, 'editor');
		return { applied: applyRulesToUnsorted(db, actor, { dryRun: false }) };
	}
};
