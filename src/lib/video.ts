/** Shared shapes and helpers for episodes, used by the server loads and the components. */
export type CreatorRef = {
	id: number;
	slug: string;
	name: string;
	color: string;
	avatarUrl: string | null;
};

export type SeriesRef = {
	slug: string;
	title: string;
};

/** One episode as the cards, timelines and the player need it. */
export type VideoCard = {
	id: number;
	youtubeVideoId: string;
	title: string;
	publishedAt: Date;
	durationS: number;
	hasCreatorCaptions: boolean;
	/** Actual livestream start, for live VODs whose start is known (Watch together). */
	liveStartedAt: Date | null;
	episodeNumber: number | null;
	groupId: number | null;
	seriesId: number;
	/** The series whose who-I-watch list and viewing options apply (the parent of an Extras series). */
	povSeriesId: number;
	creator: CreatorRef;
	series: SeriesRef;
	/** Spoiler-free: the real title was removed (`title` is empty). */
	titleHidden?: boolean;
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
/** The fake ids of the demo data (`demo` + 7 base-36 characters). */
const DEMO_ID = /^demo[0-9a-z]{7}$/;

/** True when the id looks like a real YouTube video id (and not one of the demo ids). */
export function isRealYoutubeId(id: string): boolean {
	return YOUTUBE_ID.test(id) && !DEMO_ID.test(id);
}

export function youtubeThumbnailUrl(id: string): string {
	return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`;
}

export function youtubeWatchUrl(id: string): string {
	return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
}

export function youtubeChannelUrl(channelId: string): string {
	return `https://www.youtube.com/channel/${encodeURIComponent(channelId)}`;
}

/** Clock-style duration for the thumbnail badge: `31:20`, `1:12:00`. Not locale dependent. */
export function clockDuration(totalSeconds: number): string {
	const s = Math.max(0, Math.round(totalSeconds));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	const pad = (n: number) => String(n).padStart(2, '0');
	return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/**
 * Spoken duration in the active locale, e.g. "1 hour, 12 minutes" or "1 uur en 12 minuten".
 * Seconds are dropped (rounded to the minute) because nobody needs them read out.
 */
export function spokenDuration(totalSeconds: number, locale: string): string {
	const minutes = Math.max(1, Math.round(totalSeconds / 60));
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	const unit = (value: number, u: 'hour' | 'minute') =>
		new Intl.NumberFormat(locale, { style: 'unit', unit: u, unitDisplay: 'long' }).format(value);
	const parts = [h ? unit(h, 'hour') : null, m ? unit(m, 'minute') : null].filter(
		(p): p is string => p !== null
	);
	return new Intl.ListFormat(locale, { style: 'long', type: 'unit' }).format(parts);
}

/** Up to two initials for an avatar without a picture. */
export function initials(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return '?';
	if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
	return (words[0][0] + words[1][0]).toUpperCase();
}

/** Black or white, whichever reads better on the given hex background colour. */
export function textOn(hex: string): '#000000' | '#ffffff' {
	const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return '#000000';
	const full = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
	const channel = (i: number) => {
		const v = parseInt(full.slice(i, i + 2), 16) / 255;
		return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	};
	const l = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
	// Contrast with black is (l + 0.05) / 0.05, with white 1.05 / (l + 0.05).
	return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? '#000000' : '#ffffff';
}
