/**
 * Hand-over between the autoplay countdown and the next watch page: the next video starts
 * playing at once, but only when the viewer (or the countdown they allowed) asked for it.
 * Browser memory only, so a reload or a shared link never autoplays.
 */
let pending: string | null = null;

export function requestAutoplay(youtubeVideoId: string) {
	pending = youtubeVideoId;
}

/** True once for the video that was requested. */
export function takeAutoplay(youtubeVideoId: string): boolean {
	const match = pending === youtubeVideoId;
	if (match) pending = null;
	return match;
}
