/** Title rules: editing, a dry test against recent uploads, and re-running the engine over Unsorted. */
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { writeAudit } from '../audit.js';
import type { DB } from '../db/client.js';
import * as t from '../db/schema.js';
import {
	type CandidateRule,
	compareRules,
	compileRulePattern,
	MAX_PATTERN_LENGTH,
	placeVideo
} from '../youtube/rules.js';
import { loadRuleContext, loadRuleSeries, type RuleContext } from '../youtube/sync.js';
import {
	type Actor,
	assertRole,
	auditUser,
	Checker,
	flag,
	id,
	type Input,
	integerField,
	NotFoundError,
	oneOf,
	text
} from './core.js';

type RuleRow = typeof t.titleRules.$inferSelect;
export type RuleDraft = Omit<RuleRow, 'id'>;

const snapshot = (r: RuleDraft) => ({
	seriesId: r.seriesId,
	channelId: r.channelId,
	pattern: r.pattern,
	match: r.match,
	target: r.target,
	priority: r.priority,
	enabled: r.enabled,
	withinSeriesDates: r.withinSeriesDates
});

/** Rules of a series, highest priority first (the order the engine tries them). */
export function listRules(db: DB, actor: Actor, seriesId: number) {
	assertRole(actor, 'editor');
	const rows = db.select().from(t.titleRules).where(eq(t.titleRules.seriesId, seriesId)).all();
	return rows.sort(compareRules);
}

export function getRule(db: DB, actor: Actor, seriesId: number, ruleId: number): RuleRow {
	assertRole(actor, 'editor');
	const rule = db
		.select()
		.from(t.titleRules)
		.where(and(eq(t.titleRules.id, ruleId), eq(t.titleRules.seriesId, seriesId)))
		.get();
	if (!rule) throw new NotFoundError();
	return rule;
}

/** Channels of the creators taking part in a series: the channels a rule can be bound to. */
export function seriesChannels(db: DB, seriesId: number) {
	return db
		.select({
			id: t.channels.id,
			title: t.channels.title,
			youtubeChannelId: t.channels.youtubeChannelId,
			creatorName: t.creators.name
		})
		.from(t.seriesCreators)
		.innerJoin(t.channels, eq(t.channels.creatorId, t.seriesCreators.creatorId))
		.innerJoin(t.creators, eq(t.creators.id, t.channels.creatorId))
		.where(eq(t.seriesCreators.seriesId, seriesId))
		.orderBy(asc(t.creators.name), asc(t.channels.id))
		.all();
}

function hasExtras(db: DB, seriesId: number) {
	return Boolean(
		db.select({ id: t.series.id }).from(t.series).where(eq(t.series.parentId, seriesId)).get()
	);
}

/**
 * Validates a rule. A regex must compile with the engine's own guard (`compileRulePattern`:
 * at most 400 characters, valid JavaScript syntax); otherwise the engine would never match it.
 */
export function parseRule(
	db: DB,
	seriesId: number,
	input: Input
): { c: Checker; draft: RuleDraft } {
	const c = new Checker();
	const pattern = text(input, 'pattern');
	const match = oneOf(c, input, 'match', ['contains', 'regex'] as const, 'contains');
	if (!pattern) c.fail('pattern', 'required');
	else if (pattern.length > MAX_PATTERN_LENGTH) c.fail('pattern', 'pattern_too_long');
	else if (match === 'regex' && compileRulePattern(pattern) === null)
		c.fail('pattern', 'invalid_regex');
	const target = oneOf(c, input, 'target', ['main', 'extras'] as const, 'main');
	if (target === 'extras' && !hasExtras(db, seriesId)) c.fail('target', 'no_extras');
	const channelValue = text(input, 'channel_id');
	let channelId: number | null = null;
	if (channelValue) {
		channelId = id(channelValue);
		if (channelId === null || !seriesChannels(db, seriesId).some((ch) => ch.id === channelId))
			c.fail('channel_id', 'invalid_choice');
	}
	const priority = integerField(c, input, 'priority', { min: -1000, max: 1000, fallback: 0 });
	const enabled = flag(input, 'enabled');
	const withinSeriesDates = flag(input, 'within_series_dates');
	return {
		c,
		draft: { seriesId, channelId, pattern, match, target, priority, enabled, withinSeriesDates }
	};
}

function assertSeries(db: DB, seriesId: number) {
	if (!db.select({ id: t.series.id }).from(t.series).where(eq(t.series.id, seriesId)).get())
		throw new NotFoundError();
}

export function createRule(db: DB, actor: Actor, seriesId: number, input: Input): RuleRow {
	assertRole(actor, 'editor');
	assertSeries(db, seriesId);
	const { c, draft } = parseRule(db, seriesId, input);
	c.done();
	return db.transaction((tx) => {
		const row = tx.insert(t.titleRules).values(draft).returning().get();
		auditUser(tx, actor, 'rule', row.id, null, snapshot(row));
		return row;
	});
}

export function updateRule(
	db: DB,
	actor: Actor,
	seriesId: number,
	ruleId: number,
	input: Input
): RuleRow {
	const before = getRule(db, actor, seriesId, ruleId);
	const { c, draft } = parseRule(db, seriesId, input);
	c.done();
	return db.transaction((tx) => {
		const row = tx
			.update(t.titleRules)
			.set(draft)
			.where(eq(t.titleRules.id, ruleId))
			.returning()
			.get();
		auditUser(tx, actor, 'rule', ruleId, snapshot(before), snapshot(row));
		return row;
	});
}

export function deleteRule(db: DB, actor: Actor, seriesId: number, ruleId: number): void {
	const before = getRule(db, actor, seriesId, ruleId);
	db.transaction((tx) => {
		tx.delete(t.titleRules).where(eq(t.titleRules.id, ruleId)).run();
		auditUser(tx, actor, 'rule', ruleId, snapshot(before), null);
	});
}

/** How many recent uploads "Test this rule" looks at. */
export const TEST_SAMPLE = 200;

export interface RuleTestMatch {
	videoId: number;
	youtubeVideoId: string;
	title: string;
	channelTitle: string;
	publishedAt: Date;
	status: 'placed' | 'unsorted' | 'ignored';
	/** Where the rule alone would put it. */
	seriesId: number;
	target: 'main' | 'extras';
	groupId: number | null;
}

/**
 * "Test this rule": which of the latest uploads of the series' channels this rule would match
 * and where it would put them. Reads only; nothing is written.
 */
export function testRule(db: DB, actor: Actor, seriesId: number, input: Input) {
	assertRole(actor, 'editor');
	assertSeries(db, seriesId);
	const { c, draft } = parseRule(db, seriesId, input);
	c.done();
	const channelIds = seriesChannels(db, seriesId)
		.map((ch) => ch.id)
		.filter((chId) => draft.channelId === null || chId === draft.channelId);
	if (channelIds.length === 0) return { checked: 0, matches: [] as RuleTestMatch[] };
	const videos = db
		.select({
			id: t.videos.id,
			youtubeVideoId: t.videos.youtubeVideoId,
			title: t.videos.title,
			channelId: t.videos.channelId,
			channelTitle: t.channels.title,
			publishedAt: t.videos.publishedAt,
			isLiveVod: t.videos.isLiveVod,
			status: t.videos.status
		})
		.from(t.videos)
		.innerJoin(t.channels, eq(t.channels.id, t.videos.channelId))
		.where(and(inArray(t.videos.channelId, channelIds), eq(t.videos.isShort, false)))
		.orderBy(desc(t.videos.publishedAt), desc(t.videos.id))
		.limit(TEST_SAMPLE)
		.all();
	const rule: CandidateRule = { ...draft, id: 0, enabled: true };
	const series = loadRuleSeries(db, [seriesId]);
	const matches: RuleTestMatch[] = [];
	for (const v of videos) {
		const placement = placeVideo(v, [rule], series);
		if (!placement) continue;
		matches.push({
			videoId: v.id,
			youtubeVideoId: v.youtubeVideoId,
			title: v.title,
			channelTitle: v.channelTitle,
			publishedAt: v.publishedAt,
			status: v.status,
			seriesId: placement.seriesId,
			target: placement.target,
			groupId: placement.groupId
		});
	}
	return { checked: videos.length, matches };
}

export interface ApplyPlacement {
	videoId: number;
	youtubeVideoId: string;
	title: string;
	channelTitle: string;
	seriesId: number;
	target: 'main' | 'extras';
	groupId: number | null;
	ruleId: number;
}

/**
 * Runs the rule engine over every Unsorted video (Shorts excluded, as in the sync). A dry run
 * only reports; otherwise each placement is written with an audit entry by actor `rule`
 * (`actor_user_id` is the person who started the run).
 */
export function applyRulesToUnsorted(db: DB, actor: Actor, { dryRun }: { dryRun: boolean }) {
	assertRole(actor, 'editor');
	const run = (tx: Parameters<Parameters<DB['transaction']>[0]>[0] | DB) => {
		const unsorted = tx
			.select({
				id: t.videos.id,
				youtubeVideoId: t.videos.youtubeVideoId,
				title: t.videos.title,
				channelId: t.videos.channelId,
				channelTitle: t.channels.title,
				creatorId: t.channels.creatorId,
				publishedAt: t.videos.publishedAt,
				isLiveVod: t.videos.isLiveVod
			})
			.from(t.videos)
			.innerJoin(t.channels, eq(t.channels.id, t.videos.channelId))
			.where(and(eq(t.videos.status, 'unsorted'), eq(t.videos.isShort, false)))
			.orderBy(asc(t.videos.publishedAt), asc(t.videos.id))
			.all();
		const contexts = new Map<number, RuleContext>();
		const placed: ApplyPlacement[] = [];
		for (const v of unsorted) {
			let context = contexts.get(v.creatorId);
			if (!context) {
				context = loadRuleContext(tx, v.creatorId);
				contexts.set(v.creatorId, context);
			}
			const placement = placeVideo(v, context.rules, context.series);
			if (!placement) continue;
			placed.push({
				videoId: v.id,
				youtubeVideoId: v.youtubeVideoId,
				title: v.title,
				channelTitle: v.channelTitle,
				...placement
			});
			if (dryRun) continue;
			const changed = tx
				.update(t.videos)
				.set({
					seriesId: placement.seriesId,
					groupId: placement.groupId,
					status: 'placed',
					placedBy: 'rule'
				})
				.where(and(eq(t.videos.id, v.id), eq(t.videos.status, 'unsorted')))
				.run();
			if (changed.changes !== 1) continue;
			writeAudit(tx, {
				actor: 'rule',
				actorUserId: actor.id,
				entity: 'video',
				entityId: v.id,
				before: { seriesId: null, groupId: null, status: 'unsorted', placedBy: null },
				after: {
					seriesId: placement.seriesId,
					groupId: placement.groupId,
					status: 'placed',
					placedBy: 'rule',
					ruleId: placement.ruleId
				}
			});
		}
		return { checked: unsorted.length, placed };
	};
	return dryRun ? run(db) : db.transaction((tx) => run(tx));
}
