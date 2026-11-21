/**
 * Turns a `videos.list` resource into the flags Couchcrab stores.
 */
import { type ApiVideo, parseIsoDuration } from './client.js';

/**
 * Videos this long or shorter count as Shorts. YouTube allows Shorts up to three minutes and
 * the API has no Shorts flag, so duration is the only signal. A normal upload of three minutes
 * or less is caught too; an editor can still place it by hand.
 */
export const SHORT_MAX_SECONDS = 180;

export interface ClassifiedVideo {
	youtubeVideoId: string;
	youtubeChannelId: string | null;
	title: string;
	publishedAt: Date;
	durationS: number;
	hasCreatorCaptions: boolean;
	isLiveVod: boolean;
	/** Actual start of the livestream, for live VODs only. */
	liveStartedAt: Date | null;
	isShort: boolean;
	/** `upcoming` (scheduled stream or premiere) and `live` (streaming now) are not synced yet. */
	liveState: 'none' | 'upcoming' | 'live';
}

export function classifyVideo(video: ApiVideo): ClassifiedVideo {
	const durationS = parseIsoDuration(video.contentDetails?.duration) ?? 0;
	const broadcast = video.snippet?.liveBroadcastContent;
	const live = video.liveStreamingDetails;
	const liveState: ClassifiedVideo['liveState'] =
		broadcast === 'upcoming' || (live && !live.actualStartTime && live.scheduledStartTime)
			? 'upcoming'
			: broadcast === 'live' || (live?.actualStartTime && !live.actualEndTime)
				? 'live'
				: 'none';
	const isLiveVod = Boolean(live?.actualEndTime);
	return {
		youtubeVideoId: video.id,
		youtubeChannelId: video.snippet?.channelId ?? null,
		title: video.snippet?.title ?? '',
		publishedAt: new Date(video.snippet?.publishedAt ?? 0),
		durationS,
		hasCreatorCaptions: video.contentDetails?.caption === 'true',
		isLiveVod,
		liveStartedAt: isLiveVod && live?.actualStartTime ? validDate(live.actualStartTime) : null,
		// A zero duration means "unknown" (live, processing), not "short". Live VODs are never Shorts.
		isShort: !isLiveVod && durationS > 0 && durationS <= SHORT_MAX_SECONDS,
		liveState
	};
}

function validDate(value: string): Date | null {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}
