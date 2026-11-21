import { MIRROR_COOKIE, parseMirror } from '#lib/prefs/mirror.js';
import { getVideo, livePartners, videosByYoutubeIds } from '#lib/server/catalog.js';
import { parseTogetherQuery } from '#lib/together.js';
import { redactForViewer } from '#lib/viewing.js';
import type { VideoCard } from '#lib/video.js';
import type { PageServerLoad } from './$types';

/**
 * Watch together: `?v=id,id,...` plays those live VODs side by side on one clock. Only public
 * live VODs with a known livestream start can join; other ids are dropped.
 */
export const load: PageServerLoad = ({ url, cookies }) => {
	const query = parseTogetherQuery(url.searchParams);
	const mirror = parseMirror(cookies.get(MIRROR_COOKIE));
	const povs = videosByYoutubeIds(query.ids).filter((v) => v.liveStartedAt !== null);

	// Other POVs of the same streams that can be added.
	const seen = new Set(povs.map((v) => v.id));
	const candidates: VideoCard[] = [];
	for (const pov of povs) {
		for (const partner of livePartners(pov)) {
			if (seen.has(partner.id)) continue;
			seen.add(partner.id);
			candidates.push(partner);
		}
	}
	candidates.sort((a, b) => a.liveStartedAt!.getTime() - b.liveStartedAt!.getTime());

	const first = povs[0] ? getVideo(povs[0].youtubeVideoId) : null;
	const ids = new Set(povs.map((v) => v.youtubeVideoId));
	return {
		povs: redactForViewer(povs, mirror),
		candidates: redactForViewer(candidates, mirror),
		series: first ? { slug: first.series.slug, title: first.series.title } : null,
		group: first?.group ?? null,
		start: query.t,
		nudges: Object.fromEntries(Object.entries(query.nudges).filter(([id]) => ids.has(id))),
		audio: query.audio && ids.has(query.audio) ? query.audio : (povs[0]?.youtubeVideoId ?? null),
		/** Ids that were asked for but cannot join (not public, or not a live VOD). */
		dropped: query.ids.filter((id) => !ids.has(id)).length
	};
};
