import { describe, expect, it } from 'vitest';
import {
	MIRROR_MAX_LENGTH,
	emptyMirror,
	parseMirror,
	prefsFromMirror,
	serializeMirror,
	toMirror
} from '#lib/prefs/mirror.js';
import {
	continueWatchingIds,
	mergeProgress,
	parseProgress,
	percentWatched,
	prune,
	recordPosition,
	setWatched
} from '#lib/prefs/progress.js';
import {
	DEFAULT_SHORTCUT_KEYS,
	defaultPrefs,
	migratePrefs,
	parsePrefs,
	serializePrefs,
	type Prefs
} from '#lib/prefs/schema.js';

describe('prefs serialization and migration', () => {
	it('defaults to watching everyone', () => {
		const p = defaultPrefs();
		expect(p.creators).toEqual({ mode: 'all' });
		expect(p.version).toBe(1);
	});

	it('round-trips through JSON', () => {
		const p: Prefs = {
			...defaultPrefs(),
			updatedAt: 1234,
			creators: { mode: 'list', ids: [3, 1] },
			series: { '7': { mode: 'custom', ids: [2] } },
			spoilerFree: { default: true, series: { '7': false } },
			display: { textSize: 'larger', motion: 'reduce', underlineLinks: true, textOnly: true },
			playback: { autoplay: false, countdown: 'wait', captionsOn: true, captionLanguage: 'nl' },
			shortcuts: { enabled: false, keys: { next: 'j', title: 't', watched: 'w' } }
		};
		expect(parsePrefs(serializePrefs(p))).toEqual(p);
	});

	it('gives defaults for missing, broken or foreign values', () => {
		expect(parsePrefs(null)).toEqual(defaultPrefs());
		expect(parsePrefs('{not json')).toEqual(defaultPrefs());
		expect(parsePrefs('[1,2]')).toEqual(defaultPrefs());
		expect(parsePrefs('"text"')).toEqual(defaultPrefs());
	});

	it('repairs invalid fields one by one', () => {
		const p = migratePrefs({
			version: 1,
			creators: { mode: 'list', ids: [1, 1, -2, 'x', 2.5, 4] },
			series: {
				abc: { mode: 'custom', ids: [1] },
				'5': { mode: 'global' },
				'6': { mode: 'custom' }
			},
			display: { textSize: 'huge', motion: 'allow', underlineLinks: 'yes' },
			playback: { countdown: 20, captionLanguage: '<script>' },
			shortcuts: { enabled: true, keys: { next: 'NN', title: 'x', watched: 'X' } }
		});
		expect(p.creators).toEqual({ mode: 'list', ids: [1, 4] });
		expect(p.series).toEqual({ '6': { mode: 'custom', ids: [] } });
		expect(p.display).toEqual({
			textSize: 'default',
			motion: 'allow',
			underlineLinks: false,
			textOnly: false
		});
		expect(p.playback.countdown).toBe(15);
		expect(p.playback.captionLanguage).toBe('en');
		// An invalid key keeps its default; a key already taken is ignored.
		expect(p.shortcuts.keys).toEqual({ ...DEFAULT_SHORTCUT_KEYS, title: 'x' });
	});

	it('never puts two actions on one key', () => {
		// "m" for next would clash with the default key of "mark watched".
		const p = migratePrefs({ version: 1, shortcuts: { keys: { next: 'm' } } });
		expect(p.shortcuts.keys).toEqual(DEFAULT_SHORTCUT_KEYS);
		const q = migratePrefs({
			version: 1,
			shortcuts: { keys: { next: 's', title: 'n', watched: 'n' } }
		});
		expect(q.shortcuts.keys).toEqual({ next: 's', title: 'n', watched: 'm' });
	});

	it('accepts changed shortcut keys and lower-cases them', () => {
		const p = migratePrefs({
			version: 1,
			shortcuts: { keys: { next: 'J', title: 's', watched: 'm' } }
		});
		expect(p.shortcuts).toEqual({ enabled: true, keys: { next: 'j', title: 's', watched: 'm' } });
	});

	it('migrates the unversioned draft format', () => {
		const p = migratePrefs({ creators: [4, 2], spoilers: [9] });
		expect(p.version).toBe(1);
		expect(p.creators).toEqual({ mode: 'list', ids: [4, 2] });
		expect(p.spoilerFree).toEqual({ default: false, series: { '9': true } });
		expect(migratePrefs({ creators: null }).creators).toEqual({ mode: 'all' });
	});
});

describe('cookie mirror', () => {
	it('is tiny by default', () => {
		expect(serializeMirror(toMirror(defaultPrefs()))).toBe('1');
		expect(parseMirror('1')).toEqual(emptyMirror());
	});

	it('round-trips every mirrored field', () => {
		const mirror = {
			global: [1, 35, 36, 1000],
			custom: { 7: [2, 3], 12: [] },
			spoilerDefault: true,
			spoilerOn: [3],
			spoilerOff: [7],
			captionsDefault: false,
			captionsOn: [12],
			captionsOff: [],
			textOnly: true
		};
		const value = serializeMirror(mirror);
		expect(value).toBe('1~g1.z.10.rs~cc_~c7_2.3~s1~p3~q7~rc~t1');
		expect(parseMirror(value)).toEqual(mirror);
		// Only unreserved characters: the cookie value is the same encoded.
		expect(encodeURIComponent(value)).toBe(value);
	});

	it('tells "nobody" from "everyone"', () => {
		expect(parseMirror('1~g').global).toEqual([]);
		expect(parseMirror('1~g*').global).toBeNull();
		expect(parseMirror('1').global).toBeNull();
	});

	it('ignores unknown versions, tokens and junk', () => {
		expect(parseMirror('2~g1')).toEqual(emptyMirror());
		expect(parseMirror('')).toEqual(emptyMirror());
		expect(parseMirror(undefined)).toEqual(emptyMirror());
		expect(parseMirror('1~x9~g1.!!.2~cq~c5_1')).toEqual({
			...emptyMirror(),
			global: [1, 2],
			custom: { 5: [1] }
		});
		expect(parseMirror(`1~g${'1.'.repeat(3000)}`)).toEqual(emptyMirror());
	});

	it('mirrors prefs and back', () => {
		const p: Prefs = {
			...defaultPrefs(),
			creators: { mode: 'list', ids: [5, 6] },
			series: { '2': { mode: 'custom', ids: [5] } },
			spoilerFree: { default: false, series: { '2': true } },
			creatorCaptionsOnly: { default: true, series: { '3': false } },
			display: { ...defaultPrefs().display, textOnly: true }
		};
		const back = prefsFromMirror(parseMirror(serializeMirror(toMirror(p))));
		expect(back.creators).toEqual(p.creators);
		expect(back.series).toEqual(p.series);
		expect(back.spoilerFree).toEqual(p.spoilerFree);
		expect(back.creatorCaptionsOnly).toEqual(p.creatorCaptionsOnly);
		expect(back.display.textOnly).toBe(true);
	});

	it('stays under the cookie limit with a large realistic setup', () => {
		const ids = (n: number, from = 1) => Array.from({ length: n }, (_, i) => from + i);
		const custom: Record<number, number[]> = {};
		for (let s = 1; s <= 40; s++) custom[s * 3] = ids(20, s * 10);
		const value = serializeMirror({
			...emptyMirror(),
			global: ids(300),
			custom,
			spoilerOn: ids(40),
			captionsOn: ids(20)
		});
		expect(value.length).toBeLessThanOrEqual(MIRROR_MAX_LENGTH);
		const parsed = parseMirror(value);
		expect(parsed.global).toHaveLength(300);
		expect(parsed.spoilerOn).toHaveLength(40);
		// Custom lists that do not fit are dropped; the ones kept are intact.
		for (const [sid, list] of Object.entries(parsed.custom))
			expect(list).toEqual(custom[Number(sid)]);
	});

	it('drops custom lists rather than going over the limit', () => {
		const custom: Record<number, number[]> = {};
		for (let s = 1; s <= 200; s++) custom[s] = Array.from({ length: 30 }, (_, i) => 1000 + i);
		const value = serializeMirror({ ...emptyMirror(), custom, textOnly: true });
		expect(value.length).toBeLessThanOrEqual(MIRROR_MAX_LENGTH);
		const parsed = parseMirror(value);
		expect(Object.keys(parsed.custom).length).toBeGreaterThan(0);
		expect(Object.keys(parsed.custom).length).toBeLessThan(200);
		expect(parsed.textOnly).toBe(true);
	});
});

describe('progress', () => {
	const T = 1_000_000;

	it('marks watched from 90 percent on', () => {
		expect(recordPosition(undefined, 899, 1000, T).watched).toBe(false);
		expect(recordPosition(undefined, 900, 1000, T)).toEqual({
			seconds: 900,
			watched: true,
			updatedAt: T
		});
	});

	it('keeps watched once watched, also when rewinding', () => {
		const done = recordPosition(undefined, 950, 1000, T);
		expect(recordPosition(done, 10, 1000, T + 1)).toEqual({
			seconds: 10,
			watched: true,
			updatedAt: T + 1
		});
	});

	it('never marks watched without a duration', () => {
		expect(recordPosition(undefined, 5000, 0, T).watched).toBe(false);
	});

	it('cleans odd positions', () => {
		expect(recordPosition(undefined, -4, 100, T).seconds).toBe(0);
		expect(recordPosition(undefined, Number.NaN, 100, T).seconds).toBe(0);
		expect(recordPosition(undefined, 12.9, 100, T).seconds).toBe(12);
	});

	it('toggles watched by hand and keeps the position', () => {
		const e = recordPosition(undefined, 120, 1000, T);
		expect(setWatched(e, true, T + 1)).toEqual({ seconds: 120, watched: true, updatedAt: T + 1 });
		expect(setWatched(undefined, false, T)).toEqual({ seconds: 0, watched: false, updatedAt: T });
	});

	it('computes the percentage', () => {
		expect(percentWatched({ seconds: 620, watched: false, updatedAt: 0 }, 1000)).toBe(62);
		expect(percentWatched({ seconds: 2000, watched: false, updatedAt: 0 }, 1000)).toBe(100);
		expect(percentWatched(undefined, 1000)).toBe(0);
		expect(percentWatched({ seconds: 10, watched: false, updatedAt: 0 }, 0)).toBe(0);
	});

	it('lists continue watching: started, not watched, newest first', () => {
		const map = {
			demo0000001: { seconds: 300, watched: false, updatedAt: 2 },
			demo0000002: { seconds: 300, watched: true, updatedAt: 9 },
			demo0000003: { seconds: 5, watched: false, updatedAt: 8 },
			demo0000004: { seconds: 60, watched: false, updatedAt: 5 }
		};
		expect(continueWatchingIds(map)).toEqual(['demo0000004', 'demo0000001']);
		expect(continueWatchingIds(map, 1)).toEqual(['demo0000004']);
	});

	it('parses stored progress and drops junk', () => {
		expect(parseProgress('nope')).toEqual({});
		expect(
			parseProgress(
				JSON.stringify({
					demo0000001: { seconds: 10.6, watched: true, updatedAt: 3 },
					'bad id!': { seconds: 1 },
					demo0000002: { seconds: -1 },
					demo0000003: 'x'
				})
			)
		).toEqual({ demo0000001: { seconds: 10, watched: true, updatedAt: 3 } });
	});

	it('prunes the oldest entries', () => {
		const map = Object.fromEntries(
			Array.from({ length: 5 }, (_, i) => [
				`demo000000${i}`,
				{ seconds: 1, watched: false, updatedAt: i }
			])
		);
		expect(Object.keys(prune(map, 2)).sort()).toEqual(['demo0000003', 'demo0000004']);
	});

	it('merges per video, newest wins', () => {
		const a = { demo0000001: { seconds: 10, watched: false, updatedAt: 5 } };
		const b = {
			demo0000001: { seconds: 900, watched: true, updatedAt: 9 },
			demo0000002: { seconds: 3, watched: false, updatedAt: 1 }
		};
		expect(mergeProgress(a, b)).toEqual(b);
		expect(mergeProgress(b, a).demo0000001.updatedAt).toBe(9);
	});
});
