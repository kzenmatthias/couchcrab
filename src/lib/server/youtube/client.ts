/**
 * A small typed client for the parts of the YouTube Data API v3 that the sync uses.
 *
 * - `fetch` is injected so tests never touch the network.
 * - The API key is only ever put in the request URL. Error messages name the endpoint,
 *   never the URL, and any echo of the key is redacted.
 */

export const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
/** The API returns at most 50 items per page and accepts at most 50 ids per call. */
export const PAGE_SIZE = 50;

/* ---------- API resource shapes (only the fields we read) ---------- */

export interface ApiChannel {
	id: string;
	snippet?: { title?: string };
	contentDetails?: { relatedPlaylists?: { uploads?: string } };
}

export interface ApiPlaylistItem {
	snippet?: { publishedAt?: string; title?: string };
	contentDetails?: { videoId?: string; videoPublishedAt?: string };
}

export interface ApiVideo {
	id: string;
	snippet?: {
		title?: string;
		channelId?: string;
		publishedAt?: string;
		/** `none`, `upcoming` or `live`. */
		liveBroadcastContent?: string;
	};
	contentDetails?: { duration?: string; caption?: string };
	liveStreamingDetails?: {
		actualStartTime?: string;
		actualEndTime?: string;
		scheduledStartTime?: string;
	};
}

interface ApiList<T> {
	items?: T[];
	nextPageToken?: string;
}

interface ApiErrorBody {
	error?: { code?: number; message?: string; errors?: { reason?: string }[] };
}

/* ---------- errors ---------- */

const QUOTA_REASONS = new Set([
	'quotaExceeded',
	'dailyLimitExceeded',
	'rateLimitExceeded',
	'userRateLimitExceeded'
]);

export class YouTubeApiError extends Error {
	constructor(
		message: string,
		/** HTTP status, or 0 for a network error. */
		readonly status: number,
		/** First `reason` from the error body, e.g. `quotaExceeded` or `keyInvalid`. */
		readonly reason: string | undefined,
		/** True when the daily quota or a rate limit is used up: retrying today will not help. */
		readonly isQuota: boolean
	) {
		super(message);
		this.name = 'YouTubeApiError';
	}
}

/* ---------- durations ---------- */

const DURATION_RE = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

/**
 * Parses an ISO 8601 duration as YouTube returns it (`PT1H2M3S`, `P1DT2H`, `P0D`) into
 * whole seconds. Returns `null` for anything that is not a duration.
 */
export function parseIsoDuration(value: string | undefined | null): number | null {
	if (!value) return null;
	const m = DURATION_RE.exec(value.trim());
	if (!m || value.trim() === 'P' || value.trim().endsWith('T')) return null;
	const [, w, d, h, min, s] = m;
	const n = (x: string | undefined) => (x ? Number(x) : 0);
	return Math.round(n(w) * 7 * 86_400 + n(d) * 86_400 + n(h) * 3_600 + n(min) * 60 + n(s));
}

/* ---------- client ---------- */

export interface YouTubeClientOptions {
	apiKey: string;
	fetch?: typeof fetch;
	baseUrl?: string;
}

export interface UploadsChannel {
	youtubeChannelId: string;
	title: string;
	uploadsPlaylistId: string;
}

export interface UploadItem {
	youtubeVideoId: string;
	/** When the video was published (or, for private items, added to the playlist). */
	publishedAt: Date;
}

export interface ListUploadsOptions {
	/** Stop at the first item published before this moment (incremental sync). */
	publishedAfter?: Date | null;
	/** Never collect more than this many items (first sync, runaway protection). */
	max: number;
}

export interface ListUploadsResult {
	items: UploadItem[];
	/** Pages requested (each costs one quota unit). */
	pages: number;
}

export type YouTubeClient = ReturnType<typeof createYouTubeClient>;

export function createYouTubeClient(options: YouTubeClientOptions) {
	const { apiKey } = options;
	const fetchFn = options.fetch ?? globalThis.fetch;
	const base = (options.baseUrl ?? YOUTUBE_API_BASE).replace(/\/$/, '');
	if (!apiKey) throw new Error('A YouTube API key is required.');

	const redact = (text: string) => (apiKey ? text.split(apiKey).join('***') : text);

	async function get<T>(endpoint: string, params: Record<string, string>): Promise<T> {
		const url = new URL(`${base}/${endpoint}`);
		for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
		url.searchParams.set('key', apiKey);
		const name = `${endpoint}.list`;

		let response: Response;
		try {
			response = await fetchFn(url, { headers: { accept: 'application/json' } });
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			throw new YouTubeApiError(
				`Could not reach the YouTube API (${name}): ${redact(detail)}`,
				0,
				undefined,
				false
			);
		}

		if (!response.ok) {
			let body: ApiErrorBody = {};
			try {
				body = (await response.json()) as ApiErrorBody;
			} catch {
				// Not JSON: keep the status only.
			}
			const reason = body.error?.errors?.[0]?.reason;
			const apiMessage = body.error?.message ? redact(body.error.message) : response.statusText;
			const isQuota =
				response.status === 429 || (response.status === 403 && QUOTA_REASONS.has(reason ?? ''));
			if (isQuota) {
				throw new YouTubeApiError(
					`YouTube API quota exceeded (${name}${reason ? `, ${reason}` : ''}). ` +
						'The daily quota resets at midnight Pacific time.',
					response.status,
					reason,
					true
				);
			}
			const hint =
				reason === 'keyInvalid' || response.status === 400
					? ' Check YOUTUBE_API_KEY and that the YouTube Data API v3 is enabled for it.'
					: '';
			throw new YouTubeApiError(
				`YouTube API error ${response.status} on ${name}${reason ? ` (${reason})` : ''}: ${apiMessage}.${hint}`,
				response.status,
				reason,
				false
			);
		}

		return (await response.json()) as T;
	}

	/** Looks up a channel and its uploads playlist. Returns `null` when YouTube has no such channel. */
	async function getChannel(youtubeChannelId: string): Promise<UploadsChannel | null> {
		const data = await get<ApiList<ApiChannel>>('channels', {
			part: 'contentDetails,snippet',
			id: youtubeChannelId,
			maxResults: '1'
		});
		const channel = data.items?.[0];
		const uploads = channel?.contentDetails?.relatedPlaylists?.uploads;
		if (!channel || !uploads) return null;
		return {
			youtubeChannelId: channel.id,
			title: channel.snippet?.title ?? '',
			uploadsPlaylistId: uploads
		};
	}

	/**
	 * Finds a channel by id or by handle (`@name`) for the management tool. Returns its id and
	 * title, or `null` when YouTube has no such channel.
	 */
	async function findChannel(
		query: { id: string } | { handle: string }
	): Promise<{ youtubeChannelId: string; title: string } | null> {
		const data = await get<ApiList<ApiChannel>>('channels', {
			part: 'snippet',
			...('id' in query ? { id: query.id } : { forHandle: query.handle }),
			maxResults: '1'
		});
		const channel = data.items?.[0];
		if (!channel) return null;
		return { youtubeChannelId: channel.id, title: channel.snippet?.title ?? '' };
	}

	/**
	 * Pages through an uploads playlist, newest first, until an item is older than
	 * `publishedAfter`, `max` items are collected, or the playlist ends.
	 */
	async function listUploads(
		playlistId: string,
		{ publishedAfter, max }: ListUploadsOptions
	): Promise<ListUploadsResult> {
		const items: UploadItem[] = [];
		let pageToken: string | undefined;
		let pages = 0;
		for (;;) {
			const params: Record<string, string> = {
				part: 'contentDetails,snippet',
				playlistId,
				maxResults: String(PAGE_SIZE)
			};
			if (pageToken) params.pageToken = pageToken;
			const data = await get<ApiList<ApiPlaylistItem>>('playlistItems', params);
			pages++;
			for (const item of data.items ?? []) {
				const videoId = item.contentDetails?.videoId;
				const when = item.contentDetails?.videoPublishedAt ?? item.snippet?.publishedAt;
				if (!videoId || !when) continue;
				const publishedAt = new Date(when);
				if (publishedAfter && publishedAt < publishedAfter) return { items, pages };
				items.push({ youtubeVideoId: videoId, publishedAt });
				if (items.length >= max) return { items, pages };
			}
			pageToken = data.nextPageToken;
			if (!pageToken) return { items, pages };
		}
	}

	/** Fetches video details in batches of 50. Ids YouTube does not return (deleted, private) are absent. */
	async function getVideos(ids: readonly string[]): Promise<ApiVideo[]> {
		const out: ApiVideo[] = [];
		for (let i = 0; i < ids.length; i += PAGE_SIZE) {
			const batch = ids.slice(i, i + PAGE_SIZE);
			const data = await get<ApiList<ApiVideo>>('videos', {
				part: 'contentDetails,snippet,liveStreamingDetails',
				id: batch.join(','),
				maxResults: String(PAGE_SIZE)
			});
			out.push(...(data.items ?? []));
		}
		return out;
	}

	return { getChannel, findChannel, listUploads, getVideos };
}
