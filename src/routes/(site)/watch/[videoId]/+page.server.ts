import { error } from '@sveltejs/kit';
import { MIRROR_COOKIE, parseMirror } from '#lib/prefs/mirror.js';
import { getVideo, seriesSessions, seriesVideos } from '#lib/server/catalog.js';
import { groupBySession, groupByWeek, isoWeekKey, sortTimeline } from '#lib/timeline.js';
import { isShown, isSpoilerFree, nextEpisode, redactForViewer } from '#lib/viewing.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, cookies }) => {
	const found = getVideo(params.videoId);
	if (!found) error(404, 'Not found');
	const { video, series, group } = found;
	const mirror = parseMirror(cookies.get(MIRROR_COOKIE));
	const all = seriesVideos(series.id);

	// Timeline groups (weeks, sessions or one list), each in timeline order.
	let groups: (typeof all)[];
	let week: { number: number; start: Date; end: Date } | null = null;
	if (series.grouping === 'session') {
		groups = groupBySession(all, seriesSessions(series.id)).map((g) => g.items);
	} else if (series.grouping === 'week') {
		const weeks = groupByWeek(all, series.startedAt);
		const key = isoWeekKey(video.publishedAt);
		const match = weeks.find((w) => w.key === key);
		if (match) week = { number: match.number, start: match.start, end: match.end };
		groups = weeks.map((w) => w.items);
	} else {
		groups = [sortTimeline(all)];
	}

	// The queue is the rest of the same week or session, for the creators I watch.
	const current = groups.find((items) => items.some((v) => v.id === video.id)) ?? [video];
	const queue = current.filter((v) => v.id === video.id || isShown(mirror, v));
	const next = nextEpisode(groups, video.id, (v) => isShown(mirror, v));
	const [redactedVideo, ...redactedQueue] = redactForViewer([video, ...queue], mirror);

	return {
		video: redactedVideo,
		series,
		group,
		week,
		queue: redactedQueue,
		next: next ? redactForViewer([next], mirror)[0] : null,
		spoilerFree: isSpoilerFree(mirror, video.povSeriesId)
	};
};
