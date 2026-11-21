/**
 * Cookie mirror of the preferences the server needs to render without a flash: who I watch
 * (global and per series), spoiler-free, only-creator-captions and text-only lists.
 *
 * The browser writes it from the prefs store; the server only reads it. Progress is never in
 * the cookie (it grows with every video and stays in localStorage).
 *
 * Format (version 1), tokens joined by `~`, ids in base 36 joined by `.`:
 *
 *   1            format version, always first
 *   g*           global list: everyone (also the meaning when `g` is missing)
 *   g1.2.a       global list: these creator ids (`g` alone: nobody)
 *   c5_1.2       series 5 uses a custom list
 *   s1           spoiler-free by default        p<ids> / q<ids>  series with it on / off
 *   o1           creator captions only default  r<ids> / u<ids>  series with it on / off
 *   t1           text-only lists
 *
 * Only unreserved URL characters are used, so the value survives `encodeURIComponent` as is.
 */
import { cleanIds, defaultPrefs, type PerSeriesFlag, type Prefs } from './schema.js';

export const MIRROR_COOKIE = 'viewing';
const MIRROR_VERSION = '1';
/** Browsers accept 4096 bytes per cookie including the name; stay well below. */
export const MIRROR_MAX_LENGTH = 3800;

export type ViewingMirror = {
	/** Null: everyone. */
	global: number[] | null;
	/** Custom lists per series id. */
	custom: Record<number, number[]>;
	spoilerDefault: boolean;
	spoilerOn: number[];
	spoilerOff: number[];
	captionsDefault: boolean;
	captionsOn: number[];
	captionsOff: number[];
	textOnly: boolean;
};

export function emptyMirror(): ViewingMirror {
	return {
		global: null,
		custom: {},
		spoilerDefault: false,
		spoilerOn: [],
		spoilerOff: [],
		captionsDefault: false,
		captionsOn: [],
		captionsOff: [],
		textOnly: false
	};
}

function flagLists(flag: PerSeriesFlag) {
	const on: number[] = [];
	const off: number[] = [];
	for (const [k, v] of Object.entries(flag.series)) (v ? on : off).push(Number(k));
	return { on, off };
}

export function toMirror(prefs: Prefs): ViewingMirror {
	const custom: Record<number, number[]> = {};
	for (const [k, choice] of Object.entries(prefs.series))
		if (choice.mode === 'custom') custom[Number(k)] = choice.ids;
	const sp = flagLists(prefs.spoilerFree);
	const cc = flagLists(prefs.creatorCaptionsOnly);
	return {
		global: prefs.creators.mode === 'all' ? null : prefs.creators.ids,
		custom,
		spoilerDefault: prefs.spoilerFree.default,
		spoilerOn: sp.on,
		spoilerOff: sp.off,
		captionsDefault: prefs.creatorCaptionsOnly.default,
		captionsOn: cc.on,
		captionsOff: cc.off,
		textOnly: prefs.display.textOnly
	};
}

/** The mirrored parts as prefs, used when localStorage is empty but the cookie is not. */
export function prefsFromMirror(mirror: ViewingMirror, base: Prefs = defaultPrefs()): Prefs {
	const flag = (def: boolean, on: number[], off: number[]): PerSeriesFlag => {
		const series: Record<string, boolean> = {};
		for (const id of on) series[String(id)] = true;
		for (const id of off) series[String(id)] = false;
		return { default: def, series };
	};
	const series: Prefs['series'] = {};
	for (const [k, ids] of Object.entries(mirror.custom)) series[k] = { mode: 'custom', ids };
	return {
		...base,
		creators: mirror.global === null ? { mode: 'all' } : { mode: 'list', ids: mirror.global },
		series,
		spoilerFree: flag(mirror.spoilerDefault, mirror.spoilerOn, mirror.spoilerOff),
		creatorCaptionsOnly: flag(mirror.captionsDefault, mirror.captionsOn, mirror.captionsOff),
		display: { ...base.display, textOnly: mirror.textOnly }
	};
}

const ids36 = (ids: readonly number[]) => ids.map((id) => id.toString(36)).join('.');

function parseIds36(value: string): number[] {
	if (value === '') return [];
	return cleanIds(value.split('.').map((s) => (/^[0-9a-z]{1,7}$/.test(s) ? parseInt(s, 36) : -1)));
}

/**
 * Serializes the mirror. When it would be too long for a cookie, custom series lists are
 * dropped (largest first) until it fits: those series then follow the global list on the
 * server. Everything else is tiny.
 */
export function serializeMirror(mirror: ViewingMirror): string {
	const head: string[] = [MIRROR_VERSION];
	if (mirror.global !== null) head.push(`g${ids36(mirror.global)}`);
	const tail: string[] = [];
	if (mirror.spoilerDefault) tail.push('s1');
	if (mirror.spoilerOn.length) tail.push(`p${ids36(mirror.spoilerOn)}`);
	if (mirror.spoilerOff.length) tail.push(`q${ids36(mirror.spoilerOff)}`);
	if (mirror.captionsDefault) tail.push('o1');
	if (mirror.captionsOn.length) tail.push(`r${ids36(mirror.captionsOn)}`);
	if (mirror.captionsOff.length) tail.push(`u${ids36(mirror.captionsOff)}`);
	if (mirror.textOnly) tail.push('t1');

	const custom = Object.entries(mirror.custom)
		.map(([sid, ids]) => `c${Number(sid).toString(36)}_${ids36(ids)}`)
		.sort((a, b) => a.length - b.length || a.localeCompare(b));
	let value = [...head, ...custom, ...tail].join('~');
	while (value.length > MIRROR_MAX_LENGTH && custom.length) {
		custom.pop();
		value = [...head, ...custom, ...tail].join('~');
	}
	return value;
}

/** Reads the cookie value; anything unknown or malformed is ignored. */
export function parseMirror(value: string | null | undefined): ViewingMirror {
	const mirror = emptyMirror();
	if (!value || value.length > 4096) return mirror;
	const [version, ...tokens] = value.split('~');
	if (version !== MIRROR_VERSION) return mirror;
	for (const token of tokens) {
		const key = token[0];
		const rest = token.slice(1);
		switch (key) {
			case 'g':
				mirror.global = rest === '*' ? null : parseIds36(rest);
				break;
			case 'c': {
				const m = /^([0-9a-z]{1,7})_(.*)$/.exec(rest);
				if (m) mirror.custom[parseInt(m[1], 36)] = parseIds36(m[2]);
				break;
			}
			case 's':
				mirror.spoilerDefault = rest === '1';
				break;
			case 'p':
				mirror.spoilerOn = parseIds36(rest);
				break;
			case 'q':
				mirror.spoilerOff = parseIds36(rest);
				break;
			case 'o':
				mirror.captionsDefault = rest === '1';
				break;
			case 'r':
				mirror.captionsOn = parseIds36(rest);
				break;
			case 'u':
				mirror.captionsOff = parseIds36(rest);
				break;
			case 't':
				mirror.textOnly = rest === '1';
				break;
		}
	}
	return mirror;
}
