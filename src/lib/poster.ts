/**
 * Series posters: a YouTube image of an episode, an image URL, or a plain coloured surface.
 *
 * Stored settings (`series.poster`) are `null` (automatic: the first episode), a chosen episode
 * and frame, or an image URL. The server turns them into a `PosterView` (`server/posters.ts`),
 * which only names a video that is publicly visible. The components load the image with a
 * fallback chain (`posterSources`) and show the plain surface when nothing loads.
 */
import { isRealYoutubeId } from './video.js';

/** YouTube's default thumbnail, or one of the three frames it takes from the video. */
export const POSTER_FRAMES = ['thumbnail', '1', '2', '3'] as const;
export type PosterFrame = (typeof POSTER_FRAMES)[number];

export function isPosterFrame(value: unknown): value is PosterFrame {
	return typeof value === 'string' && (POSTER_FRAMES as readonly string[]).includes(value);
}

/** Stored poster settings. `null` in the database means automatic. */
export type PosterSettings =
	{ type: 'video'; youtubeVideoId: string; frame: PosterFrame } | { type: 'image'; url: string };

/** What a poster shows, resolved on the server. `null`: the plain surface. */
export type PosterView =
	| { kind: 'video'; youtubeVideoId: string; frame: PosterFrame }
	| { kind: 'image'; url: string }
	| null;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Stored JSON as poster settings. Anything else, such as the old generated-art settings
 * (`{ type: 'art', ... }`), is automatic (`null`).
 */
export function normalizePoster(value: unknown): PosterSettings | null {
	if (!value || typeof value !== 'object') return null;
	const p = value as Record<string, unknown>;
	if (p.type === 'image' && typeof p.url === 'string' && p.url)
		return { type: 'image', url: p.url };
	if (
		p.type === 'video' &&
		typeof p.youtubeVideoId === 'string' &&
		YOUTUBE_ID.test(p.youtubeVideoId) &&
		isPosterFrame(p.frame)
	)
		return { type: 'video', youtubeVideoId: p.youtubeVideoId, frame: p.frame };
	return null;
}

/**
 * Poster settings as the poster fields of the series form (`parsePoster` in
 * `server/manage/series.ts` reads them back). Used by the form, history reverts and the import.
 */
export function posterInput(poster: PosterSettings | null): Record<string, string> {
	return {
		poster_type: poster?.type ?? 'auto',
		poster_video: poster?.type === 'video' ? poster.youtubeVideoId : '',
		poster_frame: poster?.type === 'video' ? poster.frame : 'thumbnail',
		poster_url: poster?.type === 'image' ? poster.url : ''
	};
}

/** The image names for a frame, best first: maxres, then sd, then hq. */
const FRAME_FILES: Record<PosterFrame, readonly string[]> = {
	thumbnail: ['maxresdefault', 'sddefault', 'hqdefault'],
	'1': ['maxres1', 'sd1', 'hq1'],
	'2': ['maxres2', 'sd2', 'hq2'],
	'3': ['maxres3', 'sd3', 'hq3']
};

/** The YouTube image URLs for a video frame, best first. Not every video has every size. */
export function frameUrls(youtubeVideoId: string, frame: PosterFrame): string[] {
	const id = encodeURIComponent(youtubeVideoId);
	return FRAME_FILES[frame].map((file) => `https://i.ytimg.com/vi/${id}/${file}.jpg`);
}

/**
 * The image URLs to try for a poster, in order. Empty for the plain surface, also for the fake
 * video ids of the demo data, which have no images.
 */
export function posterSources(view: PosterView): string[] {
	if (!view) return [];
	if (view.kind === 'image') return [view.url];
	return isRealYoutubeId(view.youtubeVideoId) ? frameUrls(view.youtubeVideoId, view.frame) : [];
}

/**
 * Background colours for a poster without an image. All are dark enough for white text
 * (at least 9:1), in every theme, before the scrim is even added.
 */
export const POSTER_SURFACES = [
	'#1d3557',
	'#3a2459',
	'#5a1e33',
	'#1f4d3a',
	'#5a3a12',
	'#2a4a5e',
	'#4b2c1a',
	'#2f3570',
	'#4d2350',
	'#24413f'
] as const;

/** A surface colour chosen stably from a slug (FNV-1a). */
export function posterSurface(slug: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < slug.length; i++) {
		h ^= slug.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return POSTER_SURFACES[h % POSTER_SURFACES.length];
}

/**
 * YouTube answers a missing image size with a small grey placeholder (120 by 90) instead of an
 * error, so a loaded image this narrow counts as missing too.
 */
export function isPlaceholderImage(src: string, naturalWidth: number): boolean {
	return src.startsWith('https://i.ytimg.com/') && naturalWidth > 0 && naturalWidth <= 120;
}
