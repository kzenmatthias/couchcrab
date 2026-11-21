/**
 * The title rule engine: decides where a new upload goes. Pure, no database access.
 */

export interface RuleVideo {
	title: string;
	/** Couchcrab channel id (not the YouTube id). */
	channelId: number;
	publishedAt: Date;
	isLiveVod: boolean;
}

export interface CandidateRule {
	id: number;
	seriesId: number;
	/** Null: applies to every channel of the series' creators. */
	channelId: number | null;
	pattern: string;
	match: 'contains' | 'regex';
	target: 'main' | 'extras';
	priority: number;
	enabled: boolean;
}

export interface RuleGroup {
	id: number;
	startsAt: Date | null;
	/** Null: open-ended (the current session or week). */
	endsAt: Date | null;
}

export interface RuleSeries {
	id: number;
	grouping: 'week' | 'session' | 'none';
	/** Id of the Extras child series (`parent_id` = this series), if it has one. */
	extrasId: number | null;
	groups: RuleGroup[];
}

export interface Placement {
	/** The series the video goes into: the rule's series, or its Extras child. */
	seriesId: number;
	target: 'main' | 'extras';
	ruleId: number;
	groupId: number | null;
}

/** Longer regex patterns are ignored. Titles are at most 100 characters on YouTube. */
export const MAX_PATTERN_LENGTH = 200;
const MAX_TITLE_LENGTH = 200;

const regexCache = new Map<string, RegExp | null>();

/** Compiles a rule pattern with the `i` flag. Returns `null` for an invalid or overlong pattern. */
export function compileRulePattern(pattern: string): RegExp | null {
	if (regexCache.has(pattern)) return regexCache.get(pattern) ?? null;
	let re: RegExp | null = null;
	if (pattern.length > 0 && pattern.length <= MAX_PATTERN_LENGTH) {
		try {
			re = new RegExp(pattern, 'i');
		} catch {
			re = null;
		}
	}
	if (regexCache.size > 1000) regexCache.clear();
	regexCache.set(pattern, re);
	return re;
}

export function ruleMatches(rule: Pick<CandidateRule, 'pattern' | 'match'>, title: string) {
	const text = title.slice(0, MAX_TITLE_LENGTH);
	if (rule.match === 'contains') {
		return rule.pattern.length > 0 && text.toLowerCase().includes(rule.pattern.toLowerCase());
	}
	return compileRulePattern(rule.pattern)?.test(text) ?? false;
}

/** Sort order for candidate rules: highest priority first, then lowest id. */
export function compareRules(a: CandidateRule, b: CandidateRule) {
	return b.priority - a.priority || a.id - b.id;
}

/** The group whose time window contains `at`, for a series grouped by week or session. */
export function findGroup(series: RuleSeries | undefined, at: Date): number | null {
	if (!series || series.grouping === 'none') return null;
	const t = at.getTime();
	let best: RuleGroup | null = null;
	for (const g of series.groups) {
		if (!g.startsAt || g.startsAt.getTime() > t) continue;
		if (g.endsAt && g.endsAt.getTime() <= t) continue;
		if (!best || g.startsAt.getTime() > (best.startsAt?.getTime() ?? 0)) best = g;
	}
	return best?.id ?? null;
}

/**
 * Returns where a video goes, or `null` (Unsorted).
 *
 * - Rules are tried by priority (high first), then id. Disabled rules and rules bound to another
 *   channel are skipped. The first match wins.
 * - `target: extras` places the video in the series' Extras child. A rule that targets Extras in
 *   a series without an Extras child is skipped, so the next rule gets a chance.
 * - A livestream VOD always goes to Extras when the series has an Extras child, even when the
 *   rule targets the main series (livestreams are not episodes). Without an Extras child it
 *   stays in the main series.
 * - The group (week or session) is the one of the destination series whose window contains
 *   `publishedAt`.
 */
export function placeVideo(
	video: RuleVideo,
	rules: readonly CandidateRule[],
	series: ReadonlyMap<number, RuleSeries>
): Placement | null {
	const ordered = rules
		.filter((r) => r.enabled && (r.channelId === null || r.channelId === video.channelId))
		.sort(compareRules);

	for (const rule of ordered) {
		if (!ruleMatches(rule, video.title)) continue;
		const info = series.get(rule.seriesId);
		const extrasId = info?.extrasId ?? null;
		const wantsExtras = rule.target === 'extras' || video.isLiveVod;
		if (rule.target === 'extras' && extrasId === null) continue;
		const target = wantsExtras && extrasId !== null ? 'extras' : 'main';
		const seriesId = target === 'extras' ? (extrasId as number) : rule.seriesId;
		const destination = target === 'extras' ? series.get(seriesId) : info;
		return {
			seriesId,
			target,
			ruleId: rule.id,
			groupId: findGroup(destination, video.publishedAt)
		};
	}
	return null;
}
