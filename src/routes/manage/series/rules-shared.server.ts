/** Data the rule pages share: channels a rule can use and names for the test results. */
import { db } from '#lib/server/db/index.js';
import { seriesChannels } from '#lib/server/manage/rules.js';
import { seriesChoices } from '#lib/server/manage/series.js';
import { groupChoices } from '#lib/server/manage/videos.js';

export function ruleContext(seriesId: number) {
	return {
		channels: seriesChannels(db, seriesId),
		seriesTitles: Object.fromEntries(seriesChoices(db).map((s) => [s.id, s.title])),
		groups: groupChoices(db)
	};
}
