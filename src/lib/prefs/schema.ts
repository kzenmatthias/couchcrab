/**
 * Viewing preferences: shape, defaults and migration of the versioned JSON in localStorage.
 *
 * Pure module (no browser APIs), shared by the store, the cookie mirror and the tests.
 * Creators and series are referred to by their database id.
 */

export const PREFS_STORAGE_KEY = 'couchcrab:prefs';
export const PREFS_VERSION = 1;

export const TEXT_SIZES = ['default', 'large', 'larger'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export const MOTIONS = ['system', 'reduce', 'allow'] as const;
export type Motion = (typeof MOTIONS)[number];

export const COUNTDOWNS = [10, 15, 30, 'wait'] as const;
export type Countdown = (typeof COUNTDOWNS)[number];

export const SHORTCUT_ACTIONS = ['next', 'title', 'watched'] as const;
export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];

/** Caption languages offered in the settings (names come from `Intl.DisplayNames`). */
export const CAPTION_LANGUAGES = [
	'en',
	'nl',
	'de',
	'fr',
	'es',
	'it',
	'pt',
	'sv',
	'da',
	'nb',
	'fi',
	'pl',
	'ja',
	'ko',
	'zh'
] as const;

/** Who I watch: everyone (the default) or an explicit list of creator ids. */
export type CreatorChoice = { mode: 'all' } | { mode: 'list'; ids: number[] };

/** Per series: follow the global choice or use a custom list. */
export type SeriesChoice = { mode: 'global' } | { mode: 'custom'; ids: number[] };

/** A setting with a default and explicit per-series overrides (keyed by series id). */
export type PerSeriesFlag = { default: boolean; series: Record<string, boolean> };

export type Prefs = {
	version: typeof PREFS_VERSION;
	/** Unix ms of the last change, used to merge with an account later. */
	updatedAt: number;
	creators: CreatorChoice;
	series: Record<string, SeriesChoice>;
	spoilerFree: PerSeriesFlag;
	/** Only show episodes with creator-made captions. */
	creatorCaptionsOnly: PerSeriesFlag;
	display: {
		textSize: TextSize;
		motion: Motion;
		underlineLinks: boolean;
		textOnly: boolean;
	};
	playback: {
		autoplay: boolean;
		countdown: Countdown;
		captionsOn: boolean;
		captionLanguage: string;
	};
	shortcuts: {
		enabled: boolean;
		keys: Record<ShortcutAction, string>;
	};
};

export const DEFAULT_SHORTCUT_KEYS: Record<ShortcutAction, string> = {
	next: 'n',
	title: 's',
	watched: 'm'
};

export function defaultPrefs(): Prefs {
	return {
		version: PREFS_VERSION,
		updatedAt: 0,
		creators: { mode: 'all' },
		series: {},
		spoilerFree: { default: false, series: {} },
		creatorCaptionsOnly: { default: false, series: {} },
		display: { textSize: 'default', motion: 'system', underlineLinks: false, textOnly: false },
		playback: { autoplay: true, countdown: 15, captionsOn: false, captionLanguage: 'en' },
		shortcuts: { enabled: true, keys: { ...DEFAULT_SHORTCUT_KEYS } }
	};
}

/* ---------- sanitizing ---------- */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const oneOf = <T>(list: readonly T[], v: unknown, fallback: T): T =>
	list.includes(v as T) ? (v as T) : fallback;

/** Positive integer ids, without duplicates, in their original order. */
export function cleanIds(v: unknown): number[] {
	if (!Array.isArray(v)) return [];
	const seen = new Set<number>();
	for (const id of v as unknown[])
		if (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) seen.add(id);
	return [...seen];
}

const isIdKey = (k: string) => /^[1-9]\d{0,9}$/.test(k);

function cleanCreators(v: unknown): CreatorChoice {
	if (isObj(v) && v.mode === 'list') return { mode: 'list', ids: cleanIds(v.ids) };
	return { mode: 'all' };
}

function cleanSeries(v: unknown): Record<string, SeriesChoice> {
	const out: Record<string, SeriesChoice> = {};
	if (!isObj(v)) return out;
	for (const [k, choice] of Object.entries(v)) {
		if (!isIdKey(k) || !isObj(choice)) continue;
		if (choice.mode === 'custom') out[k] = { mode: 'custom', ids: cleanIds(choice.ids) };
	}
	return out;
}

function cleanFlag(v: unknown): PerSeriesFlag {
	const out: PerSeriesFlag = { default: false, series: {} };
	if (!isObj(v)) return out;
	out.default = bool(v.default, false);
	if (isObj(v.series))
		for (const [k, on] of Object.entries(v.series))
			if (isIdKey(k) && typeof on === 'boolean') out.series[k] = on;
	return out;
}

/** A single printable character, lower-cased. */
export function isShortcutKey(v: unknown): v is string {
	return typeof v === 'string' && /^[a-z0-9]$/.test(v);
}

function cleanShortcuts(v: unknown): Prefs['shortcuts'] {
	const keys = { ...DEFAULT_SHORTCUT_KEYS };
	const enabled = isObj(v) ? bool(v.enabled, true) : true;
	if (isObj(v) && isObj(v.keys)) {
		const used = new Set<string>();
		for (const action of SHORTCUT_ACTIONS) {
			const k = typeof v.keys[action] === 'string' ? v.keys[action].toLowerCase() : null;
			if (isShortcutKey(k) && !used.has(k)) keys[action] = k;
			used.add(keys[action]);
		}
		// Two actions on one key would be ambiguous: fall back to the defaults.
		if (new Set(Object.values(keys)).size !== SHORTCUT_ACTIONS.length)
			return { enabled, keys: { ...DEFAULT_SHORTCUT_KEYS } };
	}
	return { enabled, keys };
}

/** Validates a version-1 object field by field; anything unknown or invalid gets its default. */
function sanitize(v: Obj): Prefs {
	const d = defaultPrefs();
	const display = isObj(v.display) ? v.display : {};
	const playback = isObj(v.playback) ? v.playback : {};
	return {
		version: PREFS_VERSION,
		updatedAt: Number.isFinite(v.updatedAt) ? Number(v.updatedAt) : 0,
		creators: cleanCreators(v.creators),
		series: cleanSeries(v.series),
		spoilerFree: cleanFlag(v.spoilerFree),
		creatorCaptionsOnly: cleanFlag(v.creatorCaptionsOnly),
		display: {
			textSize: oneOf(TEXT_SIZES, display.textSize, d.display.textSize),
			motion: oneOf(MOTIONS, display.motion, d.display.motion),
			underlineLinks: bool(display.underlineLinks, d.display.underlineLinks),
			textOnly: bool(display.textOnly, d.display.textOnly)
		},
		playback: {
			autoplay: bool(playback.autoplay, d.playback.autoplay),
			countdown: oneOf(COUNTDOWNS, playback.countdown, d.playback.countdown),
			captionsOn: bool(playback.captionsOn, d.playback.captionsOn),
			captionLanguage:
				typeof playback.captionLanguage === 'string' &&
				/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(playback.captionLanguage)
					? playback.captionLanguage
					: d.playback.captionLanguage
		},
		shortcuts: cleanShortcuts(v.shortcuts)
	};
}

/**
 * Version 0 was the unversioned draft shape: `{ creators: number[] | null, spoilers: number[] }`.
 * Kept so the migration path is tested before the first real format change.
 */
function fromV0(v: Obj): Obj {
	const spoilers: Record<string, boolean> = {};
	for (const id of cleanIds(v.spoilers)) spoilers[String(id)] = true;
	return {
		updatedAt: 0,
		creators: Array.isArray(v.creators) ? { mode: 'list', ids: v.creators } : { mode: 'all' },
		spoilerFree: { default: false, series: spoilers }
	};
}

/**
 * Turns whatever was stored into valid current prefs. Older versions are migrated step by step;
 * a newer version than this code knows (written by a newer build) is read as far as it matches.
 */
export function migratePrefs(raw: unknown): Prefs {
	if (!isObj(raw)) return defaultPrefs();
	let v: Obj = raw;
	if (v.version === undefined) v = fromV0(v);
	return sanitize(v);
}

/** Parses the localStorage value; broken JSON gives the defaults. */
export function parsePrefs(json: string | null | undefined): Prefs {
	if (!json) return defaultPrefs();
	try {
		return migratePrefs(JSON.parse(json));
	} catch {
		return defaultPrefs();
	}
}

export function serializePrefs(prefs: Prefs): string {
	return JSON.stringify(prefs);
}
