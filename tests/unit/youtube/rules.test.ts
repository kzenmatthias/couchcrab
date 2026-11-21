import { describe, expect, it } from 'vitest';
import {
	type CandidateRule,
	compileRulePattern,
	inSeriesWindow,
	MAX_PATTERN_LENGTH,
	placeVideo,
	type RuleSeries
} from '#lib/server/youtube/rules.js';

const MAIN = 1;
const EXTRAS = 2;
const OTHER = 3;

let nextId = 1;
const rule = (over: Partial<CandidateRule>): CandidateRule => ({
	id: nextId++,
	seriesId: MAIN,
	channelId: null,
	pattern: 'episode',
	match: 'contains',
	target: 'main',
	priority: 0,
	enabled: true,
	...over
});

const series = new Map<number, RuleSeries>([
	[
		MAIN,
		{
			id: MAIN,
			grouping: 'week',
			extrasId: EXTRAS,
			groups: [
				{ id: 11, startsAt: new Date('2026-10-01'), endsAt: new Date('2026-10-08') },
				{ id: 12, startsAt: new Date('2026-10-08'), endsAt: null }
			]
		}
	],
	[EXTRAS, { id: EXTRAS, grouping: 'none', extrasId: null, groups: [] }],
	[OTHER, { id: OTHER, grouping: 'none', extrasId: null, groups: [] }]
]);

const video = (title: string, over: Partial<Parameters<typeof placeVideo>[0]> = {}) => ({
	title,
	channelId: 100,
	publishedAt: new Date('2026-10-03T12:00:00Z'),
	isLiveVod: false,
	...over
});

describe('placeVideo', () => {
	it('returns null when no rule matches', () => {
		expect(placeVideo(video('Cooking'), [rule({})], series)).toBeNull();
	});

	it('matches contains case-insensitively and assigns the group of that week', () => {
		expect(placeVideo(video('EPISODE 4'), [rule({ id: 7 })], series)).toEqual({
			seriesId: MAIN,
			target: 'main',
			ruleId: 7,
			groupId: 11
		});
		const later = video('Episode 5', { publishedAt: new Date('2026-10-20') });
		expect(placeVideo(later, [rule({})], series)?.groupId).toBe(12);
	});

	it('uses the highest priority first, then the lowest id', () => {
		const rules = [
			rule({ id: 30, seriesId: OTHER, priority: 1 }),
			rule({ id: 20, seriesId: MAIN, priority: 5 }),
			rule({ id: 10, seriesId: OTHER, priority: 5 })
		];
		expect(placeVideo(video('Episode 1'), rules, series)?.ruleId).toBe(10);
	});

	it('skips disabled rules', () => {
		const rules = [rule({ priority: 9, seriesId: OTHER, enabled: false }), rule({ id: 99 })];
		expect(placeVideo(video('Episode 1'), rules, series)?.ruleId).toBe(99);
	});

	it('applies a channel-specific rule only to that channel', () => {
		const rules = [rule({ id: 1, channelId: 200, priority: 10, seriesId: OTHER }), rule({ id: 2 })];
		expect(placeVideo(video('Episode 1', { channelId: 200 }), rules, series)?.seriesId).toBe(OTHER);
		expect(placeVideo(video('Episode 1', { channelId: 100 }), rules, series)?.seriesId).toBe(MAIN);
	});

	it('treats regex patterns as case-insensitive regular expressions', () => {
		const r = rule({ match: 'regex', pattern: String.raw`^s1\s*e\d+` });
		expect(placeVideo(video('S1 E04 - The farm'), [r], series)).not.toBeNull();
		expect(placeVideo(video('Recap of S1 E04'), [r], series)).toBeNull();
		// The same text as a plain substring is not a regex.
		const contains = rule({ match: 'contains', pattern: '^s1' });
		expect(placeVideo(video('S1 E04'), [contains], series)).toBeNull();
	});

	it('ignores invalid and overlong regex patterns instead of throwing', () => {
		const bad = rule({ id: 1, match: 'regex', pattern: '(unclosed', priority: 10 });
		const long = rule({ id: 2, match: 'regex', pattern: 'a'.repeat(MAX_PATTERN_LENGTH + 1) });
		const ok = rule({ id: 3 });
		expect(compileRulePattern('(unclosed')).toBeNull();
		expect(placeVideo(video('Episode (unclosed'), [bad, long, ok], series)?.ruleId).toBe(3);
	});

	it('routes target extras to the Extras child', () => {
		const r = rule({ target: 'extras', pattern: 'bonus' });
		expect(placeVideo(video('Bonus clip'), [r], series)).toMatchObject({
			seriesId: EXTRAS,
			target: 'extras',
			groupId: null
		});
	});

	it('skips an extras rule when the series has no Extras child', () => {
		const rules = [
			rule({ id: 1, seriesId: OTHER, target: 'extras', pattern: 'bonus', priority: 5 }),
			rule({ id: 2, pattern: 'bonus' })
		];
		expect(placeVideo(video('Bonus clip'), rules, series)).toMatchObject({
			seriesId: MAIN,
			ruleId: 2
		});
	});

	it('sends a live VOD to Extras even when the rule targets main', () => {
		const live = video('Episode stream', { isLiveVod: true });
		expect(placeVideo(live, [rule({})], series)).toMatchObject({
			seriesId: EXTRAS,
			target: 'extras'
		});
		// Without an Extras child it stays in the main series.
		expect(placeVideo(live, [rule({ seriesId: OTHER })], series)).toMatchObject({
			seriesId: OTHER,
			target: 'main'
		});
	});
});

describe('rules within the series dates', () => {
	const DATED = 20;
	const DATED_EXTRAS = 21;
	const dated = (startedAt: Date | null, endedAt: Date | null) =>
		new Map<number, RuleSeries>([
			[
				DATED,
				{ id: DATED, grouping: 'none', extrasId: DATED_EXTRAS, groups: [], startedAt, endedAt }
			],
			[DATED_EXTRAS, { id: DATED_EXTRAS, grouping: 'none', extrasId: null, groups: [] }]
		]);
	const start = new Date('2026-03-10T00:00:00Z');
	const end = new Date('2026-06-01T00:00:00Z');
	const at = (iso: string) => video('hermitcraft', { publishedAt: new Date(iso) });
	const bound = rule({ seriesId: DATED, pattern: 'hermitcraft', withinSeriesDates: true });

	it('matches from 2 days before the start up to 7 days after the end, edges included', () => {
		const s = dated(start, end);
		expect(placeVideo(at('2026-03-08T00:00:00Z'), [bound], s)?.seriesId).toBe(DATED);
		expect(placeVideo(at('2026-03-07T23:59:59Z'), [bound], s)).toBeNull();
		expect(placeVideo(at('2026-06-08T00:00:00Z'), [bound], s)?.seriesId).toBe(DATED);
		expect(placeVideo(at('2026-06-08T00:00:01Z'), [bound], s)).toBeNull();
	});

	it('is open-ended while the series has no end date', () => {
		expect(placeVideo(at('2030-01-01T00:00:00Z'), [bound], dated(start, null))?.seriesId).toBe(
			DATED
		);
	});

	it('never matches when the series has no start date', () => {
		expect(placeVideo(at('2026-04-01T00:00:00Z'), [bound], dated(null, end))).toBeNull();
		expect(inSeriesWindow(undefined, start)).toBe(false);
	});

	it('uses the rule series dates also when the video goes to Extras', () => {
		const extras = rule({ ...bound, id: 99, target: 'extras' });
		expect(placeVideo(at('2026-04-01T00:00:00Z'), [extras], dated(start, end))?.seriesId).toBe(
			DATED_EXTRAS
		);
		expect(placeVideo(at('2027-04-01T00:00:00Z'), [extras], dated(start, end))).toBeNull();
	});

	it('lets the next rule try when the date window rules a rule out', () => {
		const fallback = rule({ seriesId: OTHER, pattern: 'hermitcraft', priority: -1 });
		const s = new Map([...dated(start, end), ...series]);
		expect(placeVideo(at('2025-01-01T00:00:00Z'), [bound, fallback], s)?.seriesId).toBe(OTHER);
	});

	it('ignores the dates for a rule without the option', () => {
		const free = rule({ seriesId: DATED, pattern: 'hermitcraft' });
		expect(placeVideo(at('2020-01-01T00:00:00Z'), [free], dated(null, null))?.seriesId).toBe(DATED);
	});
});
