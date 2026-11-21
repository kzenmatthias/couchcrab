/**
 * The viewing prefs store (Svelte 5 runes). One instance per app, created in the root layout
 * and shared through context.
 *
 * - On the server and during hydration it only knows the cookie mirror, so the first render in
 *   the browser matches the server HTML.
 * - `load()` (after mount) reads localStorage: the full prefs and the watch progress.
 * - Every change is written to localStorage and to the cookie mirror. When the mirrored part
 *   changed, `onMirrorChange` runs (the layout re-runs the server loads, which filter by it).
 * - `connect(adapter)` syncs with an account through a `PrefsSyncAdapter`.
 */
import { getContext, setContext } from 'svelte';
import type { VideoCard } from '#lib/video.js';
import {
	effectiveCreators,
	isCreatorCaptionsOnly,
	isCustomSeries,
	isSpoilerFree
} from '#lib/viewing.js';
import {
	MIRROR_COOKIE,
	parseMirror,
	prefsFromMirror,
	serializeMirror,
	toMirror,
	type ViewingMirror
} from './mirror.js';
import {
	PROGRESS_STORAGE_KEY,
	parseProgress,
	prune,
	recordPosition,
	setWatched,
	type ProgressEntry,
	type ProgressMap
} from './progress.js';
import {
	PREFS_STORAGE_KEY,
	defaultPrefs,
	parsePrefs,
	serializePrefs,
	type Prefs
} from './schema.js';
import { mergeSnapshots, type PrefsSyncAdapter } from './sync.js';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;
const PUSH_DELAY_MS = 2000;
/** Also the limit of `/api/videos`. */
export const API_MAX_IDS = 50;

/** A card as the JSON API returns it (dates as strings). */
type CardJson = Omit<VideoCard, 'publishedAt'> & { publishedAt: string };

export class ViewingStore {
	prefs: Prefs = $state(defaultPrefs());
	progress: ProgressMap = $state({});
	/** Real titles fetched for spoiler-free episodes, by YouTube id. */
	titles: Record<string, string> = $state({});
	/** True once localStorage has been read (browser only). */
	loaded = $state(false);

	readonly mirror: ViewingMirror = $derived(toMirror(this.prefs));

	#onMirrorChange: () => void;
	#lastMirror: string;
	#adapter: PrefsSyncAdapter | null = null;
	#pushTimer: ReturnType<typeof setTimeout> | null = null;
	#pendingTitles: string[] = [];
	#titleTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(cookieValue: string | null, onMirrorChange: () => void = () => {}) {
		this.prefs = prefsFromMirror(parseMirror(cookieValue));
		this.#lastMirror = serializeMirror(this.mirror);
		this.#onMirrorChange = onMirrorChange;
	}

	/* ---------- storage ---------- */

	/** Reads localStorage. Call once in the browser, after hydration. */
	load() {
		let stored: string | null = null;
		let progress: string | null = null;
		try {
			stored = localStorage.getItem(PREFS_STORAGE_KEY);
			progress = localStorage.getItem(PROGRESS_STORAGE_KEY);
		} catch {
			/* storage unavailable: keep the cookie values */
		}
		// Without stored prefs the cookie (already applied) is the best copy we have.
		if (stored) this.prefs = parsePrefs(stored);
		this.progress = parseProgress(progress);
		this.loaded = true;
		this.#save();
		window.addEventListener('storage', this.#onStorage);
	}

	destroy() {
		if (typeof window !== 'undefined') window.removeEventListener('storage', this.#onStorage);
	}

	/** Another tab changed the prefs or progress. */
	#onStorage = (event: StorageEvent) => {
		if (event.key === PREFS_STORAGE_KEY) {
			this.prefs = parsePrefs(event.newValue);
			this.#checkMirror();
		} else if (event.key === PROGRESS_STORAGE_KEY) {
			this.progress = parseProgress(event.newValue);
		}
	};

	#save() {
		try {
			localStorage.setItem(PREFS_STORAGE_KEY, serializePrefs(this.prefs));
		} catch {
			/* full or unavailable: the cookie still carries the important part */
		}
		this.#checkMirror();
		this.#schedulePush();
	}

	#saveProgress() {
		this.progress = prune(this.progress);
		try {
			localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(this.progress));
		} catch {
			/* ignore */
		}
		this.#schedulePush();
	}

	#checkMirror() {
		const value = serializeMirror(this.mirror);
		document.cookie = `${MIRROR_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`;
		if (value !== this.#lastMirror) {
			this.#lastMirror = value;
			this.#onMirrorChange();
		}
	}

	/** Changes the prefs through a draft copy, then saves them. */
	update(change: (draft: Prefs) => void) {
		const draft = $state.snapshot(this.prefs);
		change(draft);
		draft.updatedAt = Date.now();
		this.prefs = draft;
		this.#save();
	}

	/* ---------- account sync ---------- */

	async connect(adapter: PrefsSyncAdapter) {
		this.#adapter = adapter;
		const merged = mergeSnapshots(
			{ prefs: $state.snapshot(this.prefs), progress: $state.snapshot(this.progress) },
			await adapter.pull()
		);
		this.prefs = merged.prefs;
		this.progress = merged.progress;
		this.#save();
		this.#saveProgress();
	}

	disconnect() {
		this.#adapter = null;
		if (this.#pushTimer) clearTimeout(this.#pushTimer);
	}

	#schedulePush() {
		if (!this.#adapter) return;
		if (this.#pushTimer) clearTimeout(this.#pushTimer);
		this.#pushTimer = setTimeout(() => {
			void this.#adapter?.push({
				prefs: $state.snapshot(this.prefs),
				progress: $state.snapshot(this.progress)
			});
		}, PUSH_DELAY_MS);
	}

	/* ---------- who I watch ---------- */

	/** Creator ids watched in a series (or globally without one); null is everyone. */
	watching(seriesId?: number): number[] | null {
		return seriesId === undefined ? this.mirror.global : effectiveCreators(this.mirror, seriesId);
	}

	isCustom(seriesId: number) {
		return isCustomSeries(this.mirror, seriesId);
	}

	/** Turns one creator on or off in the global list. */
	toggleCreator(id: number, allIds: readonly number[]) {
		this.update((p) => {
			const current = p.creators.mode === 'all' ? [...allIds] : p.creators.ids;
			const ids = current.includes(id) ? current.filter((c) => c !== id) : [...current, id];
			p.creators =
				ids.length === allIds.length && allIds.every((c) => ids.includes(c))
					? { mode: 'all' }
					: { mode: 'list', ids };
		});
	}

	selectAll() {
		this.update((p) => (p.creators = { mode: 'all' }));
	}

	clearAll() {
		this.update((p) => (p.creators = { mode: 'list', ids: [] }));
	}

	/** Global list or a custom list that starts from what the series showed so far. */
	setSeriesMode(seriesId: number, mode: 'global' | 'custom', seriesCreatorIds: readonly number[]) {
		this.update((p) => setMode(p, seriesId, mode, seriesCreatorIds));
	}

	/** Turns a creator on or off for one series (switches that series to a custom list). */
	toggleSeriesCreator(seriesId: number, id: number, seriesCreatorIds: readonly number[]) {
		this.update((p) => {
			setMode(p, seriesId, 'custom', seriesCreatorIds);
			const choice = p.series[String(seriesId)];
			if (choice?.mode !== 'custom') return;
			choice.ids = choice.ids.includes(id)
				? choice.ids.filter((c) => c !== id)
				: [...choice.ids, id];
		});
	}

	/* ---------- per-series viewing options ---------- */

	spoilerFree(seriesId: number) {
		return isSpoilerFree(this.mirror, seriesId);
	}

	setSpoilerFree(seriesId: number, on: boolean) {
		this.update((p) => (p.spoilerFree.series[String(seriesId)] = on));
	}

	creatorCaptionsOnly(seriesId: number) {
		return isCreatorCaptionsOnly(this.mirror, seriesId);
	}

	setCreatorCaptionsOnly(seriesId: number, on: boolean) {
		this.update((p) => (p.creatorCaptionsOnly.series[String(seriesId)] = on));
	}

	/* ---------- progress ---------- */

	entry(youtubeId: string): ProgressEntry | undefined {
		return this.progress[youtubeId];
	}

	recordPosition(youtubeId: string, seconds: number, durationS: number) {
		this.progress[youtubeId] = recordPosition(
			this.progress[youtubeId],
			seconds,
			durationS,
			Date.now()
		);
		this.#saveProgress();
	}

	setWatched(youtubeId: string, watched: boolean) {
		this.progress[youtubeId] = setWatched(this.progress[youtubeId], watched, Date.now());
		this.#saveProgress();
	}

	/* ---------- episodes from the API ---------- */

	/** Public episode cards by YouTube id (with their real titles). */
	async fetchCards(ids: readonly string[]): Promise<VideoCard[]> {
		const out: VideoCard[] = [];
		for (let i = 0; i < ids.length; i += API_MAX_IDS) {
			const chunk = ids.slice(i, i + API_MAX_IDS).map(encodeURIComponent);
			const res = await fetch(`/api/videos?ids=${chunk.join(',')}`);
			if (!res.ok) continue;
			const cards = (await res.json()) as CardJson[];
			// Plain data for the cards, not reactive state.
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			out.push(...cards.map((c) => ({ ...c, publishedAt: new Date(c.publishedAt) })));
		}
		return out;
	}

	/** Asks for the real title of a spoiler-free episode; batched, result lands in `titles`. */
	requestTitle(youtubeId: string) {
		if (youtubeId in this.titles || this.#pendingTitles.includes(youtubeId)) return;
		this.#pendingTitles.push(youtubeId);
		if (this.#titleTimer) return;
		this.#titleTimer = setTimeout(() => {
			const ids = this.#pendingTitles;
			this.#pendingTitles = [];
			this.#titleTimer = null;
			void this.fetchCards(ids).then((cards) => {
				for (const c of cards) this.titles[c.youtubeVideoId] = c.title;
			});
		}, 0);
	}
}

function setMode(
	p: Prefs,
	seriesId: number,
	mode: 'global' | 'custom',
	seriesCreatorIds: readonly number[]
) {
	const key = String(seriesId);
	if (mode === 'global') {
		delete p.series[key];
		return;
	}
	if (p.series[key]?.mode === 'custom') return;
	const global = p.creators.mode === 'all' ? null : p.creators.ids;
	p.series[key] = {
		mode: 'custom',
		ids: seriesCreatorIds.filter((id) => global === null || global.includes(id))
	};
}

const KEY = Symbol('viewing');

export function setViewing(store: ViewingStore) {
	setContext(KEY, store);
}

export function getViewing(): ViewingStore {
	return getContext<ViewingStore>(KEY);
}
