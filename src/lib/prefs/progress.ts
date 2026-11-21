/**
 * Watch progress per video, keyed by YouTube video id (stable across database rebuilds).
 * Pure helpers; the store keeps the map in localStorage (never in the cookie).
 */

export const PROGRESS_STORAGE_KEY = 'couchcrab:progress';
/** A video counts as watched from 90% on (end credits and outros are often skipped). */
export const WATCHED_RATIO = 0.9;
/** Below this many seconds a video does not show up in Continue watching. */
export const CONTINUE_MIN_SECONDS = 10;
/** Oldest entries are dropped beyond this, so localStorage stays small. */
export const PROGRESS_MAX_ENTRIES = 3000;

export type ProgressEntry = {
	/** Last playback position in seconds. */
	seconds: number;
	watched: boolean;
	/** Unix ms. */
	updatedAt: number;
};

export type ProgressMap = Record<string, ProgressEntry>;

/** Saves a playback position. Reaching 90% marks the video watched; watched stays watched. */
export function recordPosition(
	entry: ProgressEntry | undefined,
	seconds: number,
	durationS: number,
	now: number
): ProgressEntry {
	const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
	const reached = durationS > 0 && s >= durationS * WATCHED_RATIO;
	return { seconds: s, watched: (entry?.watched ?? false) || reached, updatedAt: now };
}

export function setWatched(
	entry: ProgressEntry | undefined,
	watched: boolean,
	now: number
): ProgressEntry {
	return { seconds: entry?.seconds ?? 0, watched, updatedAt: now };
}

/** Whole percent watched (0 to 100), or 0 without a known duration. */
export function percentWatched(entry: ProgressEntry | undefined, durationS: number): number {
	if (!entry || durationS <= 0) return 0;
	return Math.min(100, Math.max(0, Math.round((entry.seconds / durationS) * 100)));
}

/** Started but not watched, most recent first. */
export function continueWatchingIds(map: ProgressMap, limit = 12): string[] {
	return Object.entries(map)
		.filter(([, e]) => !e.watched && e.seconds >= CONTINUE_MIN_SECONDS)
		.sort((a, b) => b[1].updatedAt - a[1].updatedAt)
		.slice(0, limit)
		.map(([id]) => id);
}

const VIDEO_KEY = /^[A-Za-z0-9_-]{6,20}$/;

export function cleanProgress(raw: unknown): ProgressMap {
	const out: ProgressMap = {};
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
	for (const [id, e] of Object.entries(raw as Record<string, unknown>)) {
		if (!VIDEO_KEY.test(id) || typeof e !== 'object' || e === null) continue;
		const { seconds, watched, updatedAt } = e as Record<string, unknown>;
		if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) continue;
		out[id] = {
			seconds: Math.floor(seconds),
			watched: watched === true,
			updatedAt: typeof updatedAt === 'number' && Number.isFinite(updatedAt) ? updatedAt : 0
		};
	}
	return prune(out);
}

/** Keeps the most recently updated entries. */
export function prune(map: ProgressMap, max = PROGRESS_MAX_ENTRIES): ProgressMap {
	const entries = Object.entries(map);
	if (entries.length <= max) return map;
	entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
	return Object.fromEntries(entries.slice(0, max));
}

export function parseProgress(json: string | null | undefined): ProgressMap {
	if (!json) return {};
	try {
		return cleanProgress(JSON.parse(json));
	} catch {
		return {};
	}
}

/** Per video the most recent entry wins. */
export function mergeProgress(a: ProgressMap, b: ProgressMap): ProgressMap {
	const out: ProgressMap = { ...a };
	for (const [id, e] of Object.entries(b)) {
		const mine = out[id];
		if (!mine || e.updatedAt > mine.updatedAt) out[id] = e;
	}
	return prune(out);
}
