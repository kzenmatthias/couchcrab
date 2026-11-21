import { describe, expect, it } from 'vitest';
import { emptyMirror, type ViewingMirror } from '#lib/prefs/mirror.js';
import {
	effectiveCreators,
	filterForViewer,
	forViewer,
	isCreatorCaptionsOnly,
	isCustomSeries,
	isShown,
	isSpoilerFree,
	nextEpisode,
	redactForViewer
} from '#lib/viewing.js';

type TestVideo = {
	id: number;
	title: string;
	titleHidden?: boolean;
	creator: { id: number };
	povSeriesId: number;
	hasCreatorCaptions: boolean;
};
const video = (id: number, creator: number, series = 1, captions = true): TestVideo => ({
	id,
	title: `Video ${id}`,
	creator: { id: creator },
	povSeriesId: series,
	hasCreatorCaptions: captions
});
const mirror = (over: Partial<ViewingMirror> = {}): ViewingMirror => ({
	...emptyMirror(),
	...over
});

describe('who I watch', () => {
	it('shows everyone by default', () => {
		expect(effectiveCreators(mirror(), 1)).toBeNull();
		expect(filterForViewer([video(1, 1), video(2, 2)], mirror())).toHaveLength(2);
	});

	it('filters by the global list', () => {
		const m = mirror({ global: [2] });
		expect(filterForViewer([video(1, 1), video(2, 2)], m).map((v) => v.id)).toEqual([2]);
	});

	it('uses a custom list per series instead of the global one', () => {
		const m = mirror({ global: [2], custom: { 5: [1] } });
		expect(isCustomSeries(m, 5)).toBe(true);
		expect(isCustomSeries(m, 1)).toBe(false);
		const list = [video(1, 1, 5), video(2, 2, 5), video(3, 1, 1), video(4, 2, 1)];
		expect(filterForViewer(list, m).map((v) => v.id)).toEqual([1, 4]);
	});

	it('an empty list shows nobody', () => {
		expect(filterForViewer([video(1, 1)], mirror({ global: [] }))).toEqual([]);
	});

	it('hides episodes without creator captions when asked, per series', () => {
		const m = mirror({ captionsDefault: true, captionsOff: [2] });
		expect(isCreatorCaptionsOnly(m, 1)).toBe(true);
		expect(isCreatorCaptionsOnly(m, 2)).toBe(false);
		expect(isShown(m, video(1, 1, 1, false))).toBe(false);
		expect(isShown(m, video(1, 1, 1, true))).toBe(true);
		expect(isShown(m, video(1, 1, 2, false))).toBe(true);
	});
});

describe('spoiler-free', () => {
	it('follows the default with per-series overrides', () => {
		const m = mirror({ spoilerDefault: true, spoilerOff: [3], spoilerOn: [] });
		expect(isSpoilerFree(m, 1)).toBe(true);
		expect(isSpoilerFree(m, 3)).toBe(false);
		expect(isSpoilerFree(mirror({ spoilerOn: [4] }), 4)).toBe(true);
	});

	it('removes the real title in spoiler-free series only', () => {
		const m = mirror({ spoilerOn: [1] });
		const [a, b] = redactForViewer([video(1, 1, 1), video(2, 1, 2)], m);
		expect(a.title).toBe('');
		expect(a.titleHidden).toBe(true);
		expect(JSON.stringify(a)).not.toContain('Video 1');
		expect(b.title).toBe('Video 2');
		expect(b.titleHidden).toBeUndefined();
	});

	it('filters and redacts together', () => {
		const out = forViewer(
			[video(1, 1, 1), video(2, 2, 1)],
			mirror({ global: [1], spoilerOn: [1] })
		);
		expect(out).toHaveLength(1);
		expect(out[0].title).toBe('');
	});
});

describe('next episode', () => {
	const ep = (id: number) => ({ id });
	const groups = [[ep(1), ep(2), ep(3)], [], [ep(4), ep(5)], [ep(6)]];

	it('is the next item of the same group', () => {
		expect(nextEpisode(groups, 1)?.id).toBe(2);
	});

	it('moves on to the first item of the next group with items', () => {
		expect(nextEpisode(groups, 3)?.id).toBe(4);
		expect(nextEpisode(groups, 5)?.id).toBe(6);
	});

	it('is null at the end of the timeline or for an unknown episode', () => {
		expect(nextEpisode(groups, 6)).toBeNull();
		expect(nextEpisode(groups, 99)).toBeNull();
		expect(nextEpisode([], 1)).toBeNull();
	});

	it('skips episodes the viewer does not watch, also across groups', () => {
		const watched = (v: { id: number }) => v.id !== 2 && v.id !== 3 && v.id !== 4;
		expect(nextEpisode(groups, 1, watched)?.id).toBe(5);
		expect(nextEpisode(groups, 5, (v) => v.id !== 6)).toBeNull();
	});

	it('works when the current episode itself is filtered out', () => {
		expect(nextEpisode(groups, 2, (v) => v.id !== 2)?.id).toBe(3);
	});
});
