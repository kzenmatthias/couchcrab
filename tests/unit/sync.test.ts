import { describe, expect, it } from 'vitest';
import { changedItems, defaultPrefs, migratePrefs, type Prefs } from '#lib/prefs/schema.js';
import { mergePrefs, mergeSnapshots, prefsDiffer, progressToPush } from '#lib/prefs/sync.js';

/** Prefs with the given items set and stamped at `at`. */
function prefs(at: number, change: (p: Prefs) => void): Prefs {
	const before = defaultPrefs();
	const p = defaultPrefs();
	change(p);
	for (const k of changedItems(before, p)) p.stamps[k] = at;
	p.updatedAt = at;
	return p;
}

describe('item stamps', () => {
	it('lists the changed items', () => {
		const p = defaultPrefs();
		p.series['5'] = { mode: 'custom', ids: [1] };
		p.spoilerFree.series['7'] = true;
		p.display.textSize = 'large';
		expect(changedItems(defaultPrefs(), p).sort()).toEqual([
			'display',
			'series.5',
			'spoilerFree.7'
		]);
	});

	it('stamps the changed items of prefs saved before stamps existed', () => {
		const p = migratePrefs({
			version: 1,
			updatedAt: 500,
			creators: { mode: 'list', ids: [2] },
			display: { textSize: 'larger' }
		});
		expect(p.stamps).toEqual({ creators: 500, display: 500 });
	});

	it('drops unknown or invalid stamps', () => {
		const p = migratePrefs({ version: 1, stamps: { creators: 3, nope: 4, display: -1 } });
		expect(p.stamps).toEqual({ creators: 3 });
	});
});

describe('mergePrefs', () => {
	it('takes the newest item, per item', () => {
		const local = prefs(10, (p) => {
			p.display.textSize = 'large';
			p.creators = { mode: 'list', ids: [1] };
		});
		const remote = prefs(20, (p) => {
			p.playback.autoplay = false;
			p.creators = { mode: 'list', ids: [2] };
		});
		remote.stamps.display = 5; // older than the local display change
		remote.display.textSize = 'larger';
		const merged = mergePrefs(local, remote);
		expect(merged.display.textSize).toBe('large');
		expect(merged.playback.autoplay).toBe(false);
		expect(merged.creators).toEqual({ mode: 'list', ids: [2] });
		expect(merged.stamps.creators).toBe(20);
		expect(merged.updatedAt).toBe(20);
	});

	it('an item never changed loses to one that was', () => {
		const local = defaultPrefs();
		const remote = prefs(20, (p) => (p.spoilerFree.default = true));
		expect(mergePrefs(local, remote).spoilerFree.default).toBe(true);
		const merged = mergePrefs(remote, local);
		expect(merged.spoilerFree.default).toBe(true);
	});

	it('keeps the local copy on a tie', () => {
		const local = prefs(10, (p) => (p.display.textOnly = true));
		const remote = prefs(10, (p) => (p.display.underlineLinks = true));
		expect(mergePrefs(local, remote).display).toEqual(local.display);
	});

	it('a removed custom list (newer) removes the list on the other side', () => {
		const remote = prefs(10, (p) => (p.series['3'] = { mode: 'custom', ids: [1] }));
		const local = defaultPrefs();
		local.stamps['series.3'] = 20; // switched back to the global list later
		expect(mergePrefs(local, remote).series).toEqual({});
		expect(mergePrefs(remote, local).series).toEqual({});
	});

	it('combines creator lists on the first merge only', () => {
		const local = prefs(30, (p) => {
			p.creators = { mode: 'list', ids: [1, 2] };
			p.series['4'] = { mode: 'custom', ids: [5] };
		});
		const remote = prefs(10, (p) => {
			p.creators = { mode: 'list', ids: [2, 3] };
			p.series['4'] = { mode: 'custom', ids: [6] };
		});
		const first = mergePrefs(local, remote, { first: true });
		expect(first.creators).toEqual({ mode: 'list', ids: [1, 2, 3] });
		expect(first.series['4']).toEqual({ mode: 'custom', ids: [5, 6] });
		expect(first.stamps.creators).toBe(30);

		const later = mergePrefs(local, remote);
		expect(later.creators).toEqual({ mode: 'list', ids: [1, 2] });
		expect(later.series['4']).toEqual({ mode: 'custom', ids: [5] });
	});

	it('everyone wins a first-merge union; an unset side is not combined', () => {
		const local = prefs(30, (p) => (p.creators = { mode: 'list', ids: [1] }));
		const all = prefs(10, (p) => (p.creators = { mode: 'all' }));
		all.stamps.creators = 10;
		expect(mergePrefs(local, all, { first: true }).creators).toEqual({ mode: 'all' });
		// The account never chose: the browser's list stays as it is.
		expect(mergePrefs(local, defaultPrefs(), { first: true }).creators).toEqual({
			mode: 'list',
			ids: [1]
		});
	});

	it('does not change its inputs', () => {
		const local = prefs(1, (p) => (p.creators = { mode: 'list', ids: [1] }));
		const remote = prefs(2, (p) => (p.creators = { mode: 'list', ids: [2] }));
		const copy = structuredClone(local);
		mergePrefs(local, remote, { first: true });
		expect(local).toEqual(copy);
	});
});

describe('mergeSnapshots', () => {
	it('keeps local data without a remote copy', () => {
		const local = { prefs: defaultPrefs(), progress: {} };
		expect(mergeSnapshots(local, null)).toBe(local);
	});

	it('merges prefs per item and progress per video', () => {
		const merged = mergeSnapshots(
			{
				prefs: prefs(1, (p) => (p.creators = { mode: 'list', ids: [1] })),
				progress: { demo0000001: { seconds: 1, watched: false, updatedAt: 1 } }
			},
			{
				prefs: prefs(2, (p) => (p.display.textOnly = true)),
				progress: { demo0000002: { seconds: 2, watched: true, updatedAt: 1 } }
			}
		);
		expect(merged.prefs.creators).toEqual({ mode: 'list', ids: [1] });
		expect(merged.prefs.display.textOnly).toBe(true);
		expect(Object.keys(merged.progress).sort()).toEqual(['demo0000001', 'demo0000002']);
	});
});

describe('what to push', () => {
	it('pushes progress the account lacks or has older, at whole seconds', () => {
		const local = {
			demo0000001: { seconds: 10, watched: false, updatedAt: 5_000 },
			demo0000002: { seconds: 20, watched: false, updatedAt: 5_400 },
			demo0000003: { seconds: 30, watched: true, updatedAt: 9_000 }
		};
		const remote = {
			demo0000002: { seconds: 20, watched: false, updatedAt: 5_000 },
			demo0000003: { seconds: 25, watched: false, updatedAt: 4_000 }
		};
		expect(progressToPush(local, remote).sort()).toEqual(['demo0000001', 'demo0000003']);
		expect(progressToPush(local, remote, 6_000)).toEqual(['demo0000003']);
	});

	it('compares prefs by content, not key order', () => {
		const a = prefs(1, (p) => {
			p.spoilerFree.series['1'] = true;
			p.spoilerFree.series['2'] = false;
		});
		const b = structuredClone(a);
		b.spoilerFree.series = { '2': false, '1': true };
		expect(prefsDiffer(a, b)).toBe(false);
		b.display.textOnly = true;
		expect(prefsDiffer(a, b)).toBe(true);
	});
});
