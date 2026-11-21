import { describe, expect, it } from 'vitest';
import {
	clampNudge,
	clockSpan,
	needsSeek,
	parseTogetherQuery,
	povPosition,
	TOGETHER_MAX,
	TogetherClock,
	togetherIds,
	togetherQuery
} from '#lib/together.js';

const T0 = Date.UTC(2026, 6, 18, 15);
const A = 'aaaaaaaaaaa';
const B = 'bbbbbbbbbbb';
const C = 'ccccccccccc';

describe('clockSpan', () => {
	it('places every POV by its actual livestream start', () => {
		const span = clockSpan([
			{ youtubeVideoId: A, startedAt: T0 + 90_000, durationS: 3600 },
			{ youtubeVideoId: B, startedAt: T0, durationS: 1800 }
		]);
		expect(span).toEqual({ originMs: T0, offsets: { [A]: 90, [B]: 0 }, start: 0, end: 3690 });
	});

	it('adds the nudge, also before the earliest start', () => {
		const span = clockSpan([
			{ youtubeVideoId: A, startedAt: T0, durationS: 100, nudgeS: -5 },
			{ youtubeVideoId: B, startedAt: T0, durationS: 100, nudgeS: 2.5 }
		]);
		expect(span.offsets).toEqual({ [A]: -5, [B]: 2.5 });
		expect(span).toMatchObject({ start: -5, end: 102.5 });
	});

	it('is empty without POVs', () => {
		expect(clockSpan([])).toEqual({ originMs: 0, offsets: {}, start: 0, end: 0 });
	});
});

describe('povPosition', () => {
	it('is before, playing or after the video', () => {
		expect(povPosition(10, 90, 3600)).toEqual({ state: 'before', startsIn: 80 });
		expect(povPosition(100, 90, 3600)).toEqual({ state: 'playing', at: 10 });
		expect(povPosition(3690, 90, 3600)).toEqual({ state: 'after' });
	});

	it('never ends a video of unknown length', () => {
		expect(povPosition(99_999, 0, 0)).toEqual({ state: 'playing', at: 99_999 });
	});
});

describe('needsSeek', () => {
	it('seeks only past the threshold', () => {
		expect(needsSeek(100, 100.9)).toBe(false);
		expect(needsSeek(100, 101.2)).toBe(true);
		expect(needsSeek(100, 98.5)).toBe(true);
		expect(needsSeek(100, 100.6, 0.5)).toBe(true);
	});
});

describe('TogetherClock', () => {
	const fake = () => {
		let now = 0;
		return { now: () => now, advance: (ms: number) => (now += ms) };
	};

	it('runs while playing and stops on pause', () => {
		const time = fake();
		const clock = new TogetherClock(10, time.now);
		time.advance(5000);
		expect(clock.position).toBe(10);
		clock.play();
		time.advance(2500);
		expect(clock.position).toBe(12.5);
		clock.pause();
		time.advance(5000);
		expect(clock.position).toBe(12.5);
	});

	it('seeks while playing and keeps running', () => {
		const time = fake();
		const clock = new TogetherClock(0, time.now);
		clock.play();
		time.advance(1000);
		clock.seek(100);
		time.advance(1000);
		expect(clock.position).toBe(101);
	});

	it('waits for every buffering POV', () => {
		const time = fake();
		const clock = new TogetherClock(0, time.now);
		clock.play();
		time.advance(1000);
		clock.hold(A, true);
		clock.hold(B, true);
		time.advance(3000);
		expect(clock.position).toBe(1);
		expect(clock).toMatchObject({ playing: true, waiting: true });
		clock.hold(A, false);
		time.advance(1000);
		expect(clock.position).toBe(1);
		clock.hold(B, false);
		time.advance(1000);
		expect(clock.position).toBe(2);
		expect(clock.waiting).toBe(false);
	});

	it('is not waiting while paused', () => {
		const clock = new TogetherClock(0, () => 0);
		clock.hold(A, true);
		expect(clock.waiting).toBe(false);
	});
});

describe('the link', () => {
	it('reads ids, time, nudges and sound', () => {
		const q = parseTogetherQuery(
			new URLSearchParams(`v=${A},${B},${A},nope&t=125.7&n=${A}:-2.34,${C}:4,${B}:x&a=${B}`)
		);
		expect(q).toEqual({ ids: [A, B], t: 125, nudges: { [A]: -2.3 }, audio: B });
	});

	it('keeps at most the maximum number of POVs', () => {
		const ids = Array.from({ length: 9 }, (_, i) => `video${i}`.padEnd(11, 'x'));
		expect(parseTogetherQuery(new URLSearchParams(`v=${ids.join(',')}`)).ids).toHaveLength(
			TOGETHER_MAX
		);
	});

	it('ignores a bad time and an unknown sound POV', () => {
		expect(parseTogetherQuery(new URLSearchParams(`v=${A}&t=-4&a=${B}`))).toMatchObject({
			t: 0,
			audio: null
		});
	});

	it('writes a readable link that reads back the same', () => {
		const query = togetherQuery({ ids: [A, B], t: 61.9, nudges: { [B]: 1.5, [C]: 3 }, audio: B });
		expect(query).toBe(`v=${A},${B}&t=61&n=${B}:1.5&a=${B}`);
		expect(parseTogetherQuery(new URLSearchParams(query))).toEqual({
			ids: [A, B],
			t: 61,
			nudges: { [B]: 1.5 },
			audio: B
		});
	});
});

describe('helpers', () => {
	it('clamps and rounds nudges', () => {
		expect(clampNudge(1.26)).toBe(1.3);
		expect(clampNudge(9999)).toBe(600);
		expect(clampNudge(Number.NaN)).toBe(0);
	});

	it('only lets live VODs with a known start join', () => {
		expect(
			togetherIds([
				{ youtubeVideoId: A, liveStartedAt: new Date(T0) },
				{ youtubeVideoId: B, liveStartedAt: null },
				{ youtubeVideoId: C, liveStartedAt: new Date(T0) }
			])
		).toEqual([A, C]);
	});
});
