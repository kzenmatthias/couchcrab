import { describe, expect, it } from 'vitest';
import {
	compareTimeline,
	groupBySession,
	groupByWeek,
	isoWeek,
	isoWeekKey,
	isoWeekStart,
	sortTimeline
} from '#lib/timeline.js';

const utc = (y: number, mo: number, d: number, h = 12) => new Date(Date.UTC(y, mo - 1, d, h));
const item = (id: number, date: Date, groupId: number | null = null) => ({
	id,
	publishedAt: date,
	groupId
});

describe('ISO weeks', () => {
	it.each([
		// [date, ISO year, ISO week]
		[utc(2026, 9, 7), 2026, 37], // a Monday
		[utc(2026, 9, 13), 2026, 37], // the Sunday of the same week
		[utc(2026, 9, 14), 2026, 38],
		[utc(2021, 1, 3), 2020, 53], // early January in the last week of the previous year
		[utc(2021, 1, 4), 2021, 1],
		[utc(2024, 12, 30), 2025, 1], // late December in week 1 of the next year
		[utc(2026, 12, 31), 2026, 53], // 2026 has 53 weeks
		[utc(2027, 1, 1), 2026, 53],
		[utc(2027, 1, 4), 2027, 1]
	])('%s is in %i-W%i', (date, year, week) => {
		expect(isoWeek(date)).toEqual({ year, week });
	});

	it('starts the week on Monday at midnight UTC, whatever the time of day', () => {
		expect(isoWeekStart(new Date(Date.UTC(2026, 8, 13, 23, 59)))).toEqual(
			new Date(Date.UTC(2026, 8, 7))
		);
		expect(isoWeekStart(new Date(Date.UTC(2026, 8, 7, 0, 0)))).toEqual(
			new Date(Date.UTC(2026, 8, 7))
		);
	});

	it('pads the week number in the key', () => {
		expect(isoWeekKey(utc(2027, 1, 4))).toBe('2027-W01');
	});

	it('does not depend on the locale (a Sunday stays in the week that started on Monday)', () => {
		// In en-US the week starts on Sunday; ISO weeks must ignore that.
		const sunday = utc(2026, 9, 20);
		expect(
			new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(sunday)
		).toBe('Sunday');
		expect(isoWeekKey(sunday)).toBe(isoWeekKey(utc(2026, 9, 14)));
		expect(isoWeekKey(sunday)).not.toBe(isoWeekKey(utc(2026, 9, 21)));
	});
});

describe('timeline order', () => {
	it('sorts by upload time, then by id', () => {
		const t = utc(2026, 9, 8);
		const items = [item(3, utc(2026, 9, 9)), item(2, t), item(1, t), item(4, utc(2026, 9, 7))];
		expect(sortTimeline(items).map((i) => i.id)).toEqual([4, 1, 2, 3]);
	});

	it('does not change the input', () => {
		const items = [item(2, utc(2026, 9, 9)), item(1, utc(2026, 9, 8))];
		sortTimeline(items);
		expect(items.map((i) => i.id)).toEqual([2, 1]);
	});

	it('compares equal only for the same id and time', () => {
		expect(compareTimeline(item(1, utc(2026, 1, 1)), item(1, utc(2026, 1, 1)))).toBe(0);
	});
});

describe('groupByWeek', () => {
	it('returns nothing for no episodes', () => {
		expect(groupByWeek([])).toEqual([]);
	});

	it('groups per ISO week in timeline order and numbers weeks from the anchor', () => {
		const groups = groupByWeek(
			[
				item(1, utc(2026, 9, 15)),
				item(2, utc(2026, 9, 8)),
				item(3, utc(2026, 9, 13, 23)),
				item(4, utc(2026, 9, 29))
			],
			utc(2026, 9, 7, 16)
		);
		expect(groups.map((g) => [g.key, g.number, g.items.map((i) => i.id)])).toEqual([
			['2026-W37', 1, [2, 3]],
			['2026-W38', 2, [1]],
			// An empty week in between keeps its number: week 3 had no uploads.
			['2026-W40', 4, [4]]
		]);
		expect(groups[0].start).toEqual(new Date(Date.UTC(2026, 8, 7)));
		expect(groups[0].end).toEqual(new Date(Date.UTC(2026, 8, 13)));
	});

	it('keeps counting across a year boundary', () => {
		const groups = groupByWeek(
			[item(1, utc(2026, 12, 30)), item(2, utc(2027, 1, 2)), item(3, utc(2027, 1, 5))],
			utc(2026, 12, 21)
		);
		expect(groups.map((g) => [g.key, g.number, g.items.length])).toEqual([
			['2026-W53', 2, 2],
			['2027-W01', 3, 1]
		]);
	});

	it('starts at week 1 when an episode is older than the anchor', () => {
		const groups = groupByWeek(
			[item(1, utc(2026, 9, 1)), item(2, utc(2026, 9, 8))],
			utc(2026, 9, 7)
		);
		expect(groups.map((g) => g.number)).toEqual([1, 2]);
	});
});

describe('groupBySession', () => {
	const sessions = [
		{ id: 20, number: 2, title: null, startsAt: utc(2026, 10, 8) },
		{ id: 10, number: 1, title: 'Opening night', startsAt: utc(2026, 10, 1) },
		{ id: 30, number: 3, title: null, startsAt: null }
	];

	it('groups by session number, in timeline order, with loose episodes last', () => {
		const groups = groupBySession(
			[
				item(1, utc(2026, 10, 9), 20),
				item(2, utc(2026, 10, 2, 14), 10),
				item(3, utc(2026, 10, 2, 9), 10),
				item(4, utc(2026, 10, 3), null),
				item(5, utc(2026, 10, 4), 99) // unknown group
			],
			sessions
		);
		expect(groups.map((g) => [g.session?.number ?? null, g.items.map((i) => i.id)])).toEqual([
			[1, [3, 2]],
			[2, [1]],
			[null, [4, 5]]
		]);
	});

	it('leaves out sessions without episodes', () => {
		expect(groupBySession([item(1, utc(2026, 10, 2), 10)], sessions)).toHaveLength(1);
	});
});
