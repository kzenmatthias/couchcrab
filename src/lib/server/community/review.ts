/**
 * The review queue (editors and admins): open suggestions with a written-out diff, approve
 * (applies the change through the management service layer), reject and ask a question. Also
 * the trust formula.
 */
import { and, asc, count, desc, eq, gte, inArray, not, sql } from 'drizzle-orm';
import type { FieldChange } from '../../community/change.js';
import type { DB } from '../db/client.js';
import * as t from '../db/schema.js';
import {
	type Actor,
	assertRole,
	Checker,
	type Input,
	NotFoundError,
	optionalText,
	requiredText,
	ValidationError
} from '../manage/core.js';
import { createRule } from '../manage/rules.js';
import { updateSeries } from '../manage/series.js';
import { updateCreator } from '../manage/creators.js';
import { placeVideoByHand, setVideoCaptions, setVideoStatus } from '../manage/videos.js';
import { describeChanges, Resolver } from './changes.js';
import { creatorInput, currentSnapshot, type Snapshot, seriesInput } from './entities.js';
import { fail, readPayload, type SuggestionPayload } from './suggestions.js';
import { runTagged } from './tx.js';

export const REVIEW_MESSAGE_MAX = 500;
export const QUEUE_LIMIT = 100;
const PENDING = ['open', 'question'] as const;

/**
 * Suggestions about a video that is hidden now (its channel was unlinked by the creator, or the
 * creator opted out) stay out of the queue and its counts until the video is public again.
 */
const hiddenVideoTarget = sql`(${t.suggestions.targetType} = 'video' AND EXISTS (
	SELECT 1 FROM ${t.videos}
	JOIN ${t.channels} ON ${t.channels.id} = ${t.videos.channelId}
	JOIN ${t.creators} ON ${t.creators.id} = ${t.channels.creatorId}
	WHERE ${t.videos.id} = ${t.suggestions.targetId}
	AND (${t.channels.unlinkedAt} IS NOT NULL OR ${t.creators.optedOut} = 1)))`;
const inQueue = and(inArray(t.suggestions.status, PENDING), not(hiddenVideoTarget));

/* ---------- trust ---------- */

/**
 * Trust is the number of approved suggestions minus the number of rejected ones. Withdrawn and
 * open suggestions do not count. It is kept in `users.trust` and updated on every review.
 */
export function trustScore(approved: number, rejected: number): number {
	return approved - rejected;
}

export type TrustCounts = { approved: number; rejected: number; trust: number };

export function trustCounts(db: DB, userIds: number[]): Map<number, TrustCounts> {
	const out = new Map<number, TrustCounts>();
	for (const userId of userIds) out.set(userId, { approved: 0, rejected: 0, trust: 0 });
	if (userIds.length === 0) return out;
	const rows = db
		.select({ userId: t.suggestions.userId, status: t.suggestions.status, n: count() })
		.from(t.suggestions)
		.where(
			and(
				inArray(t.suggestions.userId, userIds),
				inArray(t.suggestions.status, ['approved', 'rejected'])
			)
		)
		.groupBy(t.suggestions.userId, t.suggestions.status)
		.all();
	for (const r of rows) {
		const entry = out.get(r.userId!)!;
		if (r.status === 'approved') entry.approved = r.n;
		else entry.rejected = r.n;
	}
	for (const entry of out.values()) entry.trust = trustScore(entry.approved, entry.rejected);
	return out;
}

export function refreshTrust(db: DB, userId: number): number {
	const { trust } = trustCounts(db, [userId]).get(userId)!;
	db.update(t.users).set({ trust }).where(eq(t.users.id, userId)).run();
	return trust;
}

/* ---------- the queue ---------- */

type SuggestionRow = typeof t.suggestions.$inferSelect;

export type TargetLink =
	| { kind: 'video'; key: string }
	| { kind: 'series'; key: string }
	| { kind: 'creator'; key: string }
	| null;

export interface Described {
	/** A heading for the item, e.g. `Creator · "Title"` or a series title. */
	title: string;
	link: TargetLink;
	changes: FieldChange[];
	/** Approving applies the change; otherwise the reviewer does it by hand (or in Claims). */
	applies: boolean;
	/** A channel claim from Google sign-in: handled on the Claims page. */
	claim: boolean;
	/** The target no longer exists (or is no longer public). */
	missing: boolean;
}

const dayIso = (value: string | null) => (value ? `${value}T00:00:00.000Z` : null);
const SERIES_KEY: Record<string, string> = {
	title: 'title',
	kind: 'kind',
	status: 'status',
	started_at: 'startedAt',
	ended_at: 'endedAt'
};

function videoInfo(db: DB, videoId: number | null) {
	if (videoId === null) return null;
	return (
		db
			.select({
				title: t.videos.title,
				youtubeVideoId: t.videos.youtubeVideoId,
				creatorName: t.creators.name
			})
			.from(t.videos)
			.innerJoin(t.channels, eq(t.channels.id, t.videos.channelId))
			.innerJoin(t.creators, eq(t.creators.id, t.channels.creatorId))
			.where(eq(t.videos.id, videoId))
			.get() ?? null
	);
}

/** The heading, link and Before/After of one suggestion, against the current state. */
export function describeSuggestion(db: DB, r: Resolver, s: SuggestionRow): Described {
	const p = readPayload(s.payload);
	const base = { applies: false, claim: false, missing: false };
	if (!p) {
		const raw = s.payload as { title?: string; youtubeChannelId?: string };
		return {
			...base,
			claim: true,
			title: raw.title ?? raw.youtubeChannelId ?? '',
			link: null,
			changes: [{ field: 'channel', before: null, after: { text: raw.youtubeChannelId ?? '' } }]
		};
	}
	if (p.type === 'creator_request') {
		const name = p.creatorId ? (r.creatorName(p.creatorId) ?? p.name) : p.name;
		const slug = p.creatorId
			? db
					.select({ slug: t.creators.slug })
					.from(t.creators)
					.where(eq(t.creators.id, p.creatorId))
					.get()?.slug
			: undefined;
		return {
			...base,
			title: name,
			link: slug ? { kind: 'creator', key: slug } : null,
			changes: [
				{
					field: 'request',
					before: { text: [name, p.channel].filter(Boolean).join(' · ') },
					after: p.request === 'removal' ? { removed: true } : { byHand: true }
				}
			]
		};
	}

	const missing = (title: string): Described => ({
		...base,
		missing: true,
		title,
		link: null,
		changes: []
	});

	if (s.targetType === 'video') {
		const info = videoInfo(db, s.targetId);
		const cur = s.targetId ? currentSnapshot(db, 'video', s.targetId) : null;
		if (!info || !cur) return missing(`#${s.targetId}`);
		const title = `${info.creatorName} · “${info.title}”`;
		const link: TargetLink = { kind: 'video', key: info.youtubeVideoId };
		const d = (before: Snapshot, after: Snapshot, applies = true): Described => ({
			...base,
			applies,
			title,
			link,
			changes: describeChanges(r, 'video', before, after)
		});
		const place = { seriesId: cur.seriesId, groupId: cur.groupId };
		switch (p.type) {
			case 'video_series':
			case 'video_group':
				return d(place, { seriesId: p.seriesId, groupId: p.groupId });
			case 'video_live_vod':
				return d(place, { seriesId: p.seriesId, groupId: null });
			case 'video_captions':
				return d(
					{ hasCreatorCaptions: cur.hasCreatorCaptions },
					{ hasCreatorCaptions: p.hasCreatorCaptions }
				);
			case 'video_ignore':
				return d({ status: cur.status }, { status: 'ignored' });
			default:
				return {
					...base,
					title,
					link,
					changes: [{ field: 'note', before: null, after: { byHand: true } }]
				};
		}
	}

	if (s.targetType === 'series' || s.targetType === 'creator') {
		const isSeries = s.targetType === 'series';
		const cur = s.targetId ? currentSnapshot(db, s.targetType, s.targetId) : null;
		if (!cur) return missing(`#${s.targetId}`);
		const title = String(isSeries ? cur.title : cur.name);
		const link: TargetLink = { kind: s.targetType, key: String(cur.slug) };
		const d = (entity: string, before: Snapshot | null, after: Snapshot, applies = true) => ({
			...base,
			applies,
			title,
			link,
			changes: describeChanges(r, entity, before, after)
		});
		switch (p.type) {
			case 'series_field': {
				if (p.field === 'description') {
					const desc = (cur.descriptions ?? {}) as Record<string, string>;
					return d(
						'series',
						{ descriptions: { en: desc.en ?? null } },
						{ descriptions: { en: p.value } }
					);
				}
				const key = SERIES_KEY[p.field];
				const value = key === 'startedAt' || key === 'endedAt' ? dayIso(p.value) : p.value;
				return d('series', { [key]: cur[key] }, { [key]: value });
			}
			case 'creator_field':
				return d('creator', { [p.field]: cur[p.field] }, { [p.field]: p.value });
			case 'participant': {
				const series = currentSnapshot(db, 'series', p.seriesId);
				if (!series) return missing(title);
				const ids = (series.creatorIds ?? []) as number[];
				if (p.creatorId === null) {
					return {
						...base,
						title,
						link,
						changes: [
							{
								field: 'participants',
								before: { list: r.creatorNames(ids) },
								after: { list: [...r.creatorNames(ids), p.name ?? ''] }
							}
						]
					};
				}
				const changes = describeChanges(
					r,
					'series',
					{ creatorIds: ids },
					{ creatorIds: [...new Set([...ids, p.creatorId])] }
				);
				if (!isSeries)
					changes.unshift({
						field: 'series',
						before: null,
						after: { text: String(series.title) }
					});
				return { ...base, applies: true, title, link, changes };
			}
			case 'rule':
				return d('rule', null, {
					seriesId: p.seriesId,
					pattern: p.pattern,
					match: p.match,
					target: p.target,
					channelId: p.channelId
				});
			default:
				return {
					...base,
					title,
					link,
					changes: [{ field: 'note', before: null, after: { byHand: true } }]
				};
		}
	}
	return missing(`#${s.targetId ?? s.id}`);
}

export function listReviewQueue(db: DB, actor: Actor) {
	assertRole(actor, 'editor');
	const rows = db
		.select({ s: t.suggestions, userName: t.users.name, userRole: t.users.role })
		.from(t.suggestions)
		.leftJoin(t.users, eq(t.users.id, t.suggestions.userId))
		.where(inQueue)
		.orderBy(
			desc(t.suggestions.isCreatorRequest),
			asc(t.suggestions.createdAt),
			asc(t.suggestions.id)
		)
		.limit(QUEUE_LIMIT)
		.all();
	const trust = trustCounts(db, [
		...new Set(rows.map((r) => r.s.userId).filter((n): n is number => n !== null))
	]);
	const r = new Resolver(db);
	return rows.map(({ s, userName }) => ({
		id: s.id,
		status: s.status,
		isCreatorRequest: s.isCreatorRequest,
		createdAt: s.createdAt,
		note: s.note,
		reviewMessage: s.reviewMessage,
		sender: s.userId
			? { name: userName ?? '', ...trust.get(s.userId)! }
			: { name: null, contactEmail: s.contactEmail },
		...describeSuggestion(db, r, s)
	}));
}

/** Counts for the dashboard and the sub-navigation. */
export function pendingCounts(db: DB, actor: Actor) {
	assertRole(actor, 'editor');
	const n = (where: ReturnType<typeof and>) =>
		db.select({ n: count() }).from(t.suggestions).where(where).get()?.n ?? 0;
	return {
		suggestions: n(inQueue),
		creatorRequests: n(and(inQueue, eq(t.suggestions.isCreatorRequest, true)))
	};
}

function pendingSuggestion(db: DB, suggestionId: number): SuggestionRow {
	const s = db.select().from(t.suggestions).where(eq(t.suggestions.id, suggestionId)).get();
	if (!s) throw new NotFoundError();
	if (s.status !== 'open' && s.status !== 'question') fail({ suggestion: 'not_pending' });
	if (
		!db
			.select({ id: t.suggestions.id })
			.from(t.suggestions)
			.where(and(eq(t.suggestions.id, s.id), inQueue))
			.get()
	)
		fail({ suggestion: 'target_missing' });
	return s;
}

const second = (now: Date) => new Date(Math.floor(now.getTime() / 1000) * 1000);

/** Applies a payload through the service layer. Nothing happens for changes made by hand. */
function applyPayload(
	db: DB,
	actor: Actor,
	s: SuggestionRow,
	p: SuggestionPayload,
	locales: readonly string[]
): void {
	const targetId = s.targetId ?? 0;
	switch (p.type) {
		case 'video_series':
		case 'video_group':
			placeVideoByHand(db, actor, targetId, {
				series_id: String(p.seriesId),
				group_id: p.groupId === null ? '' : String(p.groupId)
			});
			return;
		case 'video_live_vod':
			placeVideoByHand(db, actor, targetId, { series_id: String(p.seriesId), group_id: '' });
			return;
		case 'video_captions':
			setVideoCaptions(db, actor, targetId, p.hasCreatorCaptions);
			return;
		case 'video_ignore':
			setVideoStatus(db, actor, targetId, 'ignored');
			return;
		case 'series_field': {
			const cur = currentSnapshot(db, 'series', targetId);
			if (!cur) throw new NotFoundError();
			const state: Snapshot = { ...cur };
			if (p.field === 'description')
				state.descriptions = { ...(cur.descriptions as object), en: p.value };
			else {
				const key = SERIES_KEY[p.field];
				state[key] = key === 'startedAt' || key === 'endedAt' ? dayIso(p.value) : p.value;
			}
			updateSeries(db, actor, targetId, seriesInput(state), locales);
			return;
		}
		case 'creator_field': {
			const cur = currentSnapshot(db, 'creator', targetId);
			if (!cur) throw new NotFoundError();
			updateCreator(db, actor, targetId, creatorInput({ ...cur, [p.field]: p.value }, actor, cur));
			return;
		}
		case 'participant': {
			if (p.creatorId === null) return;
			const cur = currentSnapshot(db, 'series', p.seriesId);
			if (!cur) throw new NotFoundError();
			const ids = [...new Set([...(cur.creatorIds as number[]), p.creatorId])];
			updateSeries(db, actor, p.seriesId, seriesInput({ ...cur, creatorIds: ids }), locales);
			return;
		}
		case 'rule':
			createRule(db, actor, p.seriesId, {
				pattern: p.pattern,
				match: p.match,
				target: p.target,
				channel_id: p.channelId === null ? '' : String(p.channelId),
				priority: '0',
				enabled: 'on'
			});
			return;
		default:
			return;
	}
}

/**
 * Approves a suggestion: applies its change through the service layer (validated, with audit
 * entries by the reviewer that point at the suggestion), marks it approved and updates the
 * sender's trust. A change that no longer validates (or a target that is gone) is refused with
 * `suggestion: <code>` and nothing is written.
 */
export function approveSuggestion(
	db: DB,
	actor: Actor,
	suggestionId: number,
	locales: readonly string[],
	now = new Date()
) {
	assertRole(actor, 'editor');
	const s = pendingSuggestion(db, suggestionId);
	const p = readPayload(s.payload);
	if (!p) fail({ suggestion: 'use_claims' });
	try {
		return runTagged(
			db,
			(tx) => applyPayload(tx, actor, s, p, locales),
			(tx, ids) => {
				if (ids.length)
					tx.update(t.auditLog)
						.set({ suggestionId: s.id })
						.where(inArray(t.auditLog.id, ids))
						.run();
				tx.update(t.suggestions)
					.set({ status: 'approved', reviewedBy: actor.id, reviewedAt: second(now) })
					.where(eq(t.suggestions.id, s.id))
					.run();
				if (s.userId !== null) refreshTrust(tx, s.userId);
			}
		);
	} catch (err) {
		if (err instanceof NotFoundError) fail({ suggestion: 'target_missing' });
		if (err instanceof ValidationError) {
			const code = Object.values(err.errors)[0] ?? 'invalid_choice';
			throw new ValidationError({ suggestion: code });
		}
		throw err;
	}
}

/** Rejects a suggestion with an optional reason the sender sees. */
export function rejectSuggestion(
	db: DB,
	actor: Actor,
	suggestionId: number,
	input: Input,
	now = new Date()
) {
	assertRole(actor, 'editor');
	const c = new Checker();
	const reason = optionalText(c, input, 'reason', REVIEW_MESSAGE_MAX);
	c.done();
	const s = pendingSuggestion(db, suggestionId);
	db.transaction((outer) => {
		const tx = outer as unknown as DB;
		tx.update(t.suggestions)
			.set({
				status: 'rejected',
				reviewMessage: reason,
				reviewedBy: actor.id,
				reviewedAt: second(now)
			})
			.where(eq(t.suggestions.id, s.id))
			.run();
		if (s.userId !== null) refreshTrust(tx, s.userId);
	});
}

/** Asks the sender a question: the suggestion stays in the queue with status `question`. */
export function askQuestion(
	db: DB,
	actor: Actor,
	suggestionId: number,
	input: Input,
	now = new Date()
) {
	assertRole(actor, 'editor');
	const c = new Checker();
	const message = requiredText(c, input, 'message', REVIEW_MESSAGE_MAX);
	c.done();
	const s = pendingSuggestion(db, suggestionId);
	db.update(t.suggestions)
		.set({
			status: 'question',
			reviewMessage: message,
			reviewedBy: actor.id,
			reviewedAt: second(now)
		})
		.where(eq(t.suggestions.id, s.id))
		.run();
}

/** Viewers whose trust reached the threshold: an admin may want to promote them. */
export function promotionCandidates(db: DB, actor: Actor, threshold: number): Set<number> {
	assertRole(actor, 'admin');
	return new Set(
		db
			.select({ id: t.users.id })
			.from(t.users)
			.where(and(eq(t.users.role, 'viewer'), gte(t.users.trust, threshold)))
			.all()
			.map((u) => u.id)
	);
}

/** The sender's own suggestions with heading and diff, for "My suggestions". */
export function describeMySuggestions(db: DB, userId: number, limit = 100) {
	const rows = db
		.select()
		.from(t.suggestions)
		.where(eq(t.suggestions.userId, userId))
		.orderBy(desc(t.suggestions.createdAt), desc(t.suggestions.id))
		.limit(limit)
		.all();
	const r = new Resolver(db);
	return rows.map((s) => {
		const d = describeSuggestion(db, r, s);
		const p = readPayload(s.payload);
		return {
			id: s.id,
			type: p?.type ?? 'creator_request',
			targetType: s.targetType,
			isCreatorRequest: s.isCreatorRequest,
			status: s.status,
			note: s.note,
			reviewMessage: s.reviewMessage,
			createdAt: s.createdAt,
			reviewedAt: s.reviewedAt,
			title: d.title,
			link: d.link,
			// After a review the "before" is the new state, so the diff only helps while open.
			changes: s.status === 'open' || s.status === 'question' ? d.changes : []
		};
	});
}
