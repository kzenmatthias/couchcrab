/**
 * Mixed timeline: ordering and grouping of episodes.
 *
 * Everything here works in UTC and uses ISO 8601 weeks (Monday to Sunday, week 1 holds the
 * first Thursday of the year), so the result never depends on the server time zone or on the
 * visitor's locale (which may start the week on Sunday).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** The minimum an episode needs to be placed on the timeline. */
export type Timed = { id: number; publishedAt: Date };

/** Upload order; equal upload times fall back to the id, so the order is always stable. */
export function compareTimeline(a: Timed, b: Timed): number {
	return a.publishedAt.getTime() - b.publishedAt.getTime() || a.id - b.id;
}

export function sortTimeline<T extends Timed>(items: readonly T[]): T[] {
	return [...items].sort(compareTimeline);
}

/** Midnight UTC of the Monday that starts the ISO week of `date`. */
export function isoWeekStart(date: Date): Date {
	const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
	const weekday = (new Date(midnight).getUTCDay() + 6) % 7; // Monday = 0
	return new Date(midnight - weekday * DAY_MS);
}

/** ISO week-numbering year and week number of `date` (UTC). */
export function isoWeek(date: Date): { year: number; week: number } {
	const monday = isoWeekStart(date);
	// The Thursday of this week decides which year the week belongs to.
	const thursday = new Date(monday.getTime() + 3 * DAY_MS);
	const year = thursday.getUTCFullYear();
	const firstMonday = isoWeekStart(new Date(Date.UTC(year, 0, 4)));
	const week = Math.round((monday.getTime() - firstMonday.getTime()) / WEEK_MS) + 1;
	return { year, week };
}

/** A stable key like `2026-W37`. */
export function isoWeekKey(date: Date): string {
	const { year, week } = isoWeek(date);
	return `${year}-W${String(week).padStart(2, '0')}`;
}

export type WeekGroup<T> = {
	/** ISO week key, e.g. `2026-W37`. */
	key: string;
	/** Week number inside the series: the anchor week is week 1. */
	number: number;
	/** Monday 00:00 UTC. */
	start: Date;
	/** Sunday 00:00 UTC (the last day of the week, for display). */
	end: Date;
	items: T[];
};

/**
 * Groups episodes per ISO week, in timeline order. Week numbers count from the week of
 * `anchor` (usually the series start), or from the first episode when that is earlier.
 */
export function groupByWeek<T extends Timed>(
	items: readonly T[],
	anchor?: Date | null
): WeekGroup<T>[] {
	const sorted = sortTimeline(items);
	if (sorted.length === 0) return [];
	const firstWeek = isoWeekStart(sorted[0].publishedAt).getTime();
	const anchorWeek = anchor ? Math.min(isoWeekStart(anchor).getTime(), firstWeek) : firstWeek;

	const groups: WeekGroup<T>[] = [];
	for (const item of sorted) {
		const start = isoWeekStart(item.publishedAt);
		const last = groups.at(-1);
		if (last && last.start.getTime() === start.getTime()) {
			last.items.push(item);
			continue;
		}
		groups.push({
			key: isoWeekKey(start),
			number: Math.round((start.getTime() - anchorWeek) / WEEK_MS) + 1,
			start,
			end: new Date(start.getTime() + 6 * DAY_MS),
			items: [item]
		});
	}
	return groups;
}

export type SessionInfo = {
	id: number;
	number: number;
	title: string | null;
	startsAt: Date | null;
};

export type SessionGroup<T> = {
	/** Null for the episodes that are not in a session yet. */
	session: SessionInfo | null;
	items: T[];
};

/**
 * One group per session (by session number), each in timeline order. Sessions without
 * episodes are left out. Episodes without a session come last, in their own group.
 */
export function groupBySession<T extends Timed & { groupId: number | null }>(
	items: readonly T[],
	sessions: readonly SessionInfo[]
): SessionGroup<T>[] {
	const sorted = sortTimeline(items);
	const byId = new Map(sessions.map((s) => [s.id, s]));
	const result: SessionGroup<T>[] = [...sessions]
		.sort((a, b) => a.number - b.number)
		.map((session) => ({ session, items: [] as T[] }));
	const index = new Map(result.map((g, i) => [g.session!.id, i]));
	const loose: T[] = [];
	for (const item of sorted) {
		const i = item.groupId !== null && byId.has(item.groupId) ? index.get(item.groupId) : undefined;
		if (i === undefined) loose.push(item);
		else result[i].items.push(item);
	}
	const filled = result.filter((g) => g.items.length > 0);
	if (loose.length) filled.push({ session: null, items: loose });
	return filled;
}
