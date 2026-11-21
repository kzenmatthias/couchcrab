/**
 * Watch together: several livestream VODs of the same stream (one per POV) on one shared clock.
 *
 * Every VOD is placed on the clock by the moment its livestream actually started (YouTube
 * `actualStartTime`), plus an optional nudge the viewer sets when a creator's VOD is trimmed or
 * their stream delay differs. Pure module: no browser APIs, shared by the page and the tests.
 */

/** More players than this is too heavy for most connections and too small to watch. */
export const TOGETHER_MAX = 6;
/** A POV more than this far from the shared clock is put back in place (seconds). */
export const DRIFT_SEEK_S = 1;
/** Nudges are kept within this range (seconds), and rounded to tenths. */
export const NUDGE_LIMIT_S = 600;

export type TogetherPov = {
	youtubeVideoId: string;
	/** Unix ms of the actual livestream start. */
	startedAt: number;
	durationS: number;
	/** Seconds this POV is shifted on the clock; positive plays it later. */
	nudgeS?: number;
};

export type TogetherClockSpan = {
	/** Unix ms of clock time 0: the earliest livestream start. */
	originMs: number;
	/** Clock time (seconds) of each POV's video start, by YouTube id. */
	offsets: Record<string, number>;
	/** First and last clock time (seconds) at which any POV has video. */
	start: number;
	end: number;
};

export function clockSpan(povs: readonly TogetherPov[]): TogetherClockSpan {
	if (povs.length === 0) return { originMs: 0, offsets: {}, start: 0, end: 0 };
	const originMs = Math.min(...povs.map((p) => p.startedAt));
	const offsets: Record<string, number> = {};
	let start = Infinity;
	let end = -Infinity;
	for (const p of povs) {
		const offset = (p.startedAt - originMs) / 1000 + (p.nudgeS ?? 0);
		offsets[p.youtubeVideoId] = offset;
		start = Math.min(start, offset);
		end = Math.max(end, offset + Math.max(0, p.durationS));
	}
	return { originMs, offsets, start, end };
}

export type PovPosition =
	{ state: 'before'; startsIn: number } | { state: 'playing'; at: number } | { state: 'after' };

/** Where a POV's video is at clock time `clock`. */
export function povPosition(clock: number, offset: number, durationS: number): PovPosition {
	const at = clock - offset;
	if (at < 0) return { state: 'before', startsIn: -at };
	// A duration of 0 means "unknown": never call it finished.
	if (durationS > 0 && at >= durationS) return { state: 'after' };
	return { state: 'playing', at };
}

/** Whether a playing POV is far enough off the clock to seek it back in place. */
export function needsSeek(expected: number, actual: number, threshold = DRIFT_SEEK_S): boolean {
	return Math.abs(actual - expected) > threshold;
}

export function clampNudge(value: number): number {
	if (!Number.isFinite(value)) return 0;
	const clamped = Math.min(NUDGE_LIMIT_S, Math.max(-NUDGE_LIMIT_S, value));
	return Math.round(clamped * 10) / 10;
}

/* ---------- the shared clock ---------- */

/**
 * The shared clock. Runs while playing and not held; a hold (a POV that is buffering) stops it
 * without leaving the playing state, so every POV waits for the slowest one.
 */
export class TogetherClock {
	#base = 0;
	#since: number | null = null;
	#holds = new Set<string>();
	#playing = false;
	readonly #now: () => number;

	constructor(start = 0, now: () => number = () => performance.now()) {
		this.#base = start;
		this.#now = now;
	}

	get playing() {
		return this.#playing;
	}

	/** True while playing but held by a buffering POV. */
	get waiting() {
		return this.#playing && this.#holds.size > 0;
	}

	get position(): number {
		if (this.#since === null) return this.#base;
		return this.#base + (this.#now() - this.#since) / 1000;
	}

	#stop() {
		this.#base = this.position;
		this.#since = null;
	}

	#update() {
		const run = this.#playing && this.#holds.size === 0;
		if (run && this.#since === null) this.#since = this.#now();
		if (!run && this.#since !== null) this.#stop();
	}

	play() {
		this.#playing = true;
		this.#update();
	}

	pause() {
		this.#playing = false;
		this.#update();
	}

	seek(position: number) {
		this.#base = position;
		if (this.#since !== null) this.#since = this.#now();
	}

	hold(key: string, on: boolean) {
		if (on) this.#holds.add(key);
		else this.#holds.delete(key);
		this.#update();
	}
}

/* ---------- link ---------- */

const ID = /^[A-Za-z0-9_-]{11}$/;

export type TogetherQuery = {
	ids: string[];
	/** Clock time to start at, in seconds. */
	t: number;
	nudges: Record<string, number>;
	/** The POV whose sound plays. */
	audio: string | null;
};

/**
 * Reads `?v=id,id&t=90&n=id:-2.5,id:1&a=id`. Unknown or repeated ids are dropped, and at most
 * `TOGETHER_MAX` are kept.
 */
export function parseTogetherQuery(params: URLSearchParams): TogetherQuery {
	const ids: string[] = [];
	for (const raw of params.getAll('v').flatMap((v) => v.split(','))) {
		const id = raw.trim();
		if (ID.test(id) && !ids.includes(id) && ids.length < TOGETHER_MAX) ids.push(id);
	}
	const t = Number(params.get('t'));
	const nudges: Record<string, number> = {};
	for (const pair of (params.get('n') ?? '').split(',')) {
		const [id, value] = pair.split(':');
		const n = clampNudge(Number(value));
		if (id && ids.includes(id) && value !== undefined && value !== '' && n !== 0) nudges[id] = n;
	}
	const a = params.get('a');
	return {
		ids,
		t: Number.isFinite(t) && t > 0 ? Math.floor(t) : 0,
		nudges,
		audio: a && ids.includes(a) ? a : null
	};
}

/** The query string (without `?`) for a Watch together link. */
export function togetherQuery(q: Partial<TogetherQuery> & { ids: readonly string[] }): string {
	const params = new URLSearchParams();
	params.set('v', q.ids.join(','));
	if (q.t && q.t > 0) params.set('t', String(Math.floor(q.t)));
	const nudges = Object.entries(q.nudges ?? {})
		.filter(([id, n]) => q.ids.includes(id) && n !== 0)
		.map(([id, n]) => `${id}:${clampNudge(n)}`);
	if (nudges.length) params.set('n', nudges.join(','));
	if (q.audio && q.ids.includes(q.audio)) params.set('a', q.audio);
	// Keep the separators readable in a shared link.
	return params.toString().replaceAll('%2C', ',').replaceAll('%3A', ':');
}

/** Videos that can join Watch together: live VODs with a known start. */
export function togetherIds(
	videos: readonly { youtubeVideoId: string; liveStartedAt: Date | null }[]
) {
	return videos
		.filter((v) => v.liveStartedAt !== null)
		.slice(0, TOGETHER_MAX)
		.map((v) => v.youtubeVideoId);
}
