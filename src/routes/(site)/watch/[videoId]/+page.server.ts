import { error } from '@sveltejs/kit';
import { getVideo, seriesVideos } from '#lib/server/catalog.js';
import { groupByWeek, isoWeekKey, sortTimeline } from '#lib/timeline.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const found = getVideo(params.videoId);
	if (!found) error(404, 'Not found');
	const { video, series, group } = found;
	const all = seriesVideos(series.id);

	// The queue is the rest of the same week or session, in timeline order.
	let week: { number: number; start: Date; end: Date } | null = null;
	let queue = sortTimeline(all);
	if (series.grouping === 'session') {
		queue = queue.filter((v) => v.groupId === video.groupId);
	} else if (series.grouping === 'week') {
		const key = isoWeekKey(video.publishedAt);
		const match = groupByWeek(all, series.startedAt).find((w) => w.key === key);
		if (match) {
			week = { number: match.number, start: match.start, end: match.end };
			queue = match.items;
		}
	}

	return { video, series, group, week, queue };
};
