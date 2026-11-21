/**
 * Suggested edits and creator requests: what each kind of suggestion stores in its `payload`,
 * validation, the rate limit and the sender's own list.
 *
 * A suggestion never changes anything by itself. A reviewer approves it in the review queue,
 * which applies the payload through the management service layer (`review.ts`).
 */
import { and, count, desc, eq, gte, isNull } from 'drizzle-orm';
import type { RevertBlock } from '../../community/change.js';
import type { DB } from '../db/client.js';
import * as t from '../db/schema.js';
import { compileRulePattern, MAX_PATTERN_LENGTH } from '../youtube/rules.js';
import {
	Checker,
	type ErrorCode,
	id,
	type Input,
	oneOf,
	optionalDate,
	optionalText,
	requiredText,
	text,
	ValidationError
} from '../manage/core.js';
import { SERIES_KINDS, SERIES_STATUSES, TITLE_MAX, DESCRIPTION_MAX } from '../manage/series.js';
import { BIO_MAX, NAME_MAX } from '../manage/creators.js';
import { loadTarget, type Target, type TargetType, TARGET_TYPES } from './targets.js';

/** At most this many suggestions (creator requests included) per user per 24 hours. */
export const DAILY_LIMIT = 30;
/** Creator requests without an account: per contact email, and for everyone together. */
export const ANON_DAILY_LIMIT_PER_EMAIL = 3;
export const ANON_DAILY_LIMIT_TOTAL = 50;
export const NOTE_MAX = 1000;
export const REQUEST_DETAILS_MAX = 2000;
export const EMAIL_MAX = 200;
const DAY_S = 86_400;

/** Error codes of the community forms (on top of the management codes). */
export type CommunityErrorCode =
	| ErrorCode
	| 'no_change'
	| 'rate_limited'
	| 'invalid_email'
	| 'target_missing'
	| 'use_claims'
	| 'apply_failed'
	| RevertBlock;

/** `Checker.fail` only knows the management codes; this one is ours. */
const NO_CHANGE = 'no_change' as ErrorCode;

export function fail(errors: Record<string, CommunityErrorCode>): never {
	throw new ValidationError(errors as Record<string, ErrorCode>);
}

export const VIDEO_TYPES = [
	'video_series',
	'video_group',
	'video_live_vod',
	'video_captions',
	'video_ignore',
	'other'
] as const;
export const SERIES_TYPES = ['series_field', 'participant', 'rule', 'other'] as const;
export const CREATOR_TYPES = ['creator_field', 'participant', 'rule', 'other'] as const;
export const SERIES_FIELDS = [
	'title',
	'kind',
	'status',
	'started_at',
	'ended_at',
	'description'
] as const;
export const CREATOR_FIELDS = ['name', 'bio'] as const;
export const REQUEST_KINDS = ['correction', 'removal'] as const;

export type SeriesField = (typeof SERIES_FIELDS)[number];
export type CreatorField = (typeof CREATOR_FIELDS)[number];

/** What a suggestion wants to change. Stored as JSON in `suggestions.payload`. */
export type SuggestionPayload =
	| { type: 'video_series'; seriesId: number; groupId: number | null }
	| { type: 'video_group'; seriesId: number; groupId: number }
	| { type: 'video_live_vod'; seriesId: number }
	| { type: 'video_captions'; hasCreatorCaptions: boolean }
	| { type: 'video_ignore' }
	| { type: 'series_field'; field: SeriesField; value: string | null }
	| { type: 'creator_field'; field: CreatorField; value: string | null }
	/** A creator missing from a series. `creatorId` null: not on Couchcrab yet, see `name`. */
	| { type: 'participant'; seriesId: number; creatorId: number | null; name: string | null }
	| {
			type: 'rule';
			seriesId: number;
			pattern: string;
			match: 'contains' | 'regex';
			target: 'main' | 'extras';
			channelId: number | null;
	  }
	| { type: 'other' }
	| {
			type: 'creator_request';
			request: (typeof REQUEST_KINDS)[number];
			creatorId: number | null;
			name: string;
			channel: string | null;
	  };

export type SuggestionType = SuggestionPayload['type'];

export function typesFor(target: TargetType): readonly string[] {
	return target === 'video' ? VIDEO_TYPES : target === 'series' ? SERIES_TYPES : CREATOR_TYPES;
}

/** Reads a payload back from the database; anything unknown is null (an old or foreign row). */
export function readPayload(value: unknown): SuggestionPayload | null {
	if (!value || typeof value !== 'object') return null;
	const type = (value as { type?: unknown }).type;
	return typeof type === 'string' ? (value as SuggestionPayload) : null;
}

const dateValue = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Validates the form of "Suggest an edit" for one target. Field names: `type` (the kind of
 * problem), then per kind `series_id` and `group_id` (wrong series; `series_id` is also the
 * series a creator is missing from), `new_group_id` (wrong session), `captions` (`yes`/`no`), `field` plus the
 * field's own input (`title`, `kind`, `status`, `started_at`, `ended_at`, `description`, `name`,
 * `bio`), `creator_id` (or `new` with `creator_name`), `rule_series_id`, `pattern`, `match`, `rule_target`,
 * `channel_id`, and the optional `note`.
 */
export function parseSuggestion(
	target: Target,
	input: Input
): { payload: SuggestionPayload; note: string | null } {
	const c = new Checker();
	const type = oneOf(c, input, 'type', typesFor(target.type) as readonly SuggestionType[]);
	const note = optionalText(c, input, 'note', NOTE_MAX);
	if (!c.ok) c.done();

	let payload: SuggestionPayload = { type: 'other' };
	switch (type) {
		case 'video_series': {
			if (target.type !== 'video') break;
			const seriesId = id(text(input, 'series_id'));
			if (!text(input, 'series_id')) c.fail('series_id', 'required');
			else if (seriesId === null || !target.series.some((s) => s.id === seriesId))
				c.fail('series_id', 'invalid_choice');
			let groupId: number | null = null;
			if (text(input, 'group_id')) {
				groupId = id(text(input, 'group_id'));
				const group = target.groups.find((g) => g.id === groupId);
				if (!group) c.fail('group_id', 'invalid_choice');
				else if (group.seriesId !== seriesId) c.fail('group_id', 'group_mismatch');
			}
			if (c.ok && seriesId === target.seriesId && groupId === target.groupId)
				c.fail('series_id', NO_CHANGE);
			payload = { type, seriesId: seriesId ?? 0, groupId };
			break;
		}
		case 'video_group': {
			if (target.type !== 'video') break;
			const groupId = id(text(input, 'new_group_id'));
			if (!text(input, 'new_group_id')) c.fail('new_group_id', 'required');
			else if (
				groupId === null ||
				!target.groups.some((g) => g.id === groupId && g.seriesId === target.seriesId)
			)
				c.fail('new_group_id', 'invalid_choice');
			else if (groupId === target.groupId) c.fail('new_group_id', NO_CHANGE);
			payload = { type, seriesId: target.seriesId, groupId: groupId ?? 0 };
			break;
		}
		case 'video_live_vod': {
			if (target.type !== 'video') break;
			if (!target.extras) c.fail('type', 'no_extras');
			payload = { type, seriesId: target.extras?.id ?? 0 };
			break;
		}
		case 'video_captions': {
			if (target.type !== 'video') break;
			const value = oneOf(c, input, 'captions', ['yes', 'no'] as const);
			const has = value === 'yes';
			if (c.ok && has === target.hasCreatorCaptions) c.fail('captions', NO_CHANGE);
			payload = { type, hasCreatorCaptions: has };
			break;
		}
		case 'video_ignore':
			payload = { type };
			break;
		case 'series_field': {
			if (target.type !== 'series') break;
			const field = oneOf(c, input, 'field', SERIES_FIELDS);
			let value: string | null = null;
			let current: string | null = null;
			if (field === 'title') {
				value = requiredText(c, input, 'title', TITLE_MAX);
				current = target.title;
			} else if (field === 'kind') {
				value = oneOf(c, input, 'kind', SERIES_KINDS);
				current = target.kind;
			} else if (field === 'status') {
				value = oneOf(c, input, 'status', SERIES_STATUSES);
				current = target.status;
			} else if (field === 'started_at' || field === 'ended_at') {
				value = dateValue(optionalDate(c, input, field));
				current = dateValue(field === 'started_at' ? target.startedAt : target.endedAt);
				const other = field === 'started_at' ? target.endedAt : target.startedAt;
				if (value && other) {
					const [start, end] =
						field === 'started_at' ? [value, dateValue(other)!] : [dateValue(other)!, value];
					if (end < start) c.fail(field, 'date_order');
				}
			} else if (field === 'description') {
				value = requiredText(c, input, 'description', DESCRIPTION_MAX);
				current = null;
			}
			if (c.ok && value === current) c.fail(field, NO_CHANGE);
			payload = { type, field, value };
			break;
		}
		case 'creator_field': {
			if (target.type !== 'creator') break;
			const field = oneOf(c, input, 'field', CREATOR_FIELDS);
			const value =
				field === 'name'
					? requiredText(c, input, 'name', NAME_MAX)
					: optionalText(c, input, 'bio', BIO_MAX);
			const current = field === 'name' ? target.name : target.bio;
			if (c.ok && (value ?? null) === (current ?? null)) c.fail(field, NO_CHANGE);
			payload = { type, field, value };
			break;
		}
		case 'participant': {
			if (target.type === 'series') {
				const choice = text(input, 'creator_id');
				let creatorId: number | null = null;
				let name: string | null = null;
				if (!choice) c.fail('creator_id', 'required');
				else if (choice === 'new') name = requiredText(c, input, 'creator_name', NAME_MAX);
				else {
					creatorId = id(choice);
					if (creatorId === null || !target.otherCreators.some((o) => o.id === creatorId))
						c.fail('creator_id', 'invalid_choice');
				}
				payload = { type, seriesId: target.id, creatorId, name };
			} else if (target.type === 'creator') {
				const seriesId = id(text(input, 'series_id'));
				if (!text(input, 'series_id')) c.fail('series_id', 'required');
				else if (seriesId === null || !target.otherSeries.some((s) => s.id === seriesId))
					c.fail('series_id', 'invalid_choice');
				payload = { type, seriesId: seriesId ?? 0, creatorId: target.id, name: null };
			}
			break;
		}
		case 'rule': {
			if (target.type !== 'series' && target.type !== 'creator') break;
			let seriesId = target.type === 'series' ? target.id : null;
			let hasExtras = target.type === 'series' ? target.hasExtras : false;
			if (target.type === 'creator') {
				seriesId = id(text(input, 'rule_series_id'));
				if (!text(input, 'rule_series_id')) c.fail('rule_series_id', 'required');
				else if (seriesId === null || !target.inSeries.some((s) => s.id === seriesId))
					c.fail('rule_series_id', 'invalid_choice');
				hasExtras = seriesId !== null && target.withExtras.includes(seriesId);
			}
			const pattern = text(input, 'pattern');
			const match = oneOf(c, input, 'match', ['contains', 'regex'] as const, 'contains');
			if (!pattern) c.fail('pattern', 'required');
			else if (pattern.length > MAX_PATTERN_LENGTH) c.fail('pattern', 'pattern_too_long');
			else if (match === 'regex' && compileRulePattern(pattern) === null)
				c.fail('pattern', 'invalid_regex');
			const ruleTarget = oneOf(c, input, 'rule_target', ['main', 'extras'] as const, 'main');
			if (ruleTarget === 'extras' && !hasExtras) c.fail('rule_target', 'no_extras');
			let channelId: number | null = null;
			if (text(input, 'channel_id')) {
				channelId = id(text(input, 'channel_id'));
				if (channelId === null || !target.channels.some((ch) => ch.id === channelId))
					c.fail('channel_id', 'invalid_choice');
			}
			payload = {
				type,
				seriesId: seriesId ?? 0,
				pattern,
				match,
				target: ruleTarget,
				channelId
			};
			break;
		}
		case 'other':
			if (!note) c.fail('note', 'required');
			payload = { type };
			break;
	}
	c.done();
	return { payload, note };
}

function since(now: Date) {
	return new Date((Math.floor(now.getTime() / 1000) - DAY_S) * 1000);
}

function countRecent(db: DB, userId: number, now: Date): number {
	return (
		db
			.select({ n: count() })
			.from(t.suggestions)
			.where(and(eq(t.suggestions.userId, userId), gte(t.suggestions.createdAt, since(now))))
			.get()?.n ?? 0
	);
}

/** Throws `rate_limited` when the user sent `DAILY_LIMIT` suggestions in the last 24 hours. */
export function assertWithinLimit(db: DB, userId: number, now = new Date()): void {
	if (countRecent(db, userId, now) >= DAILY_LIMIT) fail({ form: 'rate_limited' });
}

const KIND_OF: Record<SuggestionType, 'create' | 'update' | 'delete'> = {
	video_series: 'update',
	video_group: 'update',
	video_live_vod: 'update',
	video_captions: 'update',
	video_ignore: 'update',
	series_field: 'update',
	creator_field: 'update',
	participant: 'update',
	rule: 'create',
	other: 'update',
	creator_request: 'update'
};

/** Stores a suggested edit from a signed-in user. Returns the new suggestion's id. */
export function createSuggestion(
	db: DB,
	userId: number,
	targetType: string,
	targetKey: string,
	input: Input,
	now = new Date()
): number {
	if (!(TARGET_TYPES as readonly string[]).includes(targetType)) fail({ form: 'target_missing' });
	const target = loadTarget(db, targetType, targetKey);
	if (!target) fail({ form: 'target_missing' });
	assertWithinLimit(db, userId, now);
	const { payload, note } = parseSuggestion(target, input);
	const at = new Date(Math.floor(now.getTime() / 1000) * 1000);
	return db
		.insert(t.suggestions)
		.values({
			userId,
			targetType: target.type,
			targetId: target.id,
			kind: KIND_OF[payload.type],
			payload,
			note,
			createdAt: at
		})
		.returning({ id: t.suggestions.id })
		.get().id;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Stores a creator request (a correction or a removal). Signed in, it belongs to the user;
 * signed out, `contact_email` is required so a reviewer can answer.
 */
export function createCreatorRequest(
	db: DB,
	userId: number | null,
	input: Input,
	now = new Date()
): number {
	const c = new Checker();
	const request = oneOf(c, input, 'request', REQUEST_KINDS);
	const creatorValue = text(input, 'creator_id');
	let creatorId: number | null = null;
	if (creatorValue) {
		creatorId = id(creatorValue);
		const known =
			creatorId !== null &&
			db
				.select({ id: t.creators.id })
				.from(t.creators)
				.where(and(eq(t.creators.id, creatorId), eq(t.creators.optedOut, false)))
				.get();
		if (!known) c.fail('creator_id', 'invalid_choice');
	}
	const name = requiredText(c, input, 'name', NAME_MAX);
	const channel = optionalText(c, input, 'channel', 200);
	const details = requiredText(c, input, 'details', REQUEST_DETAILS_MAX);
	let contactEmail: string | null = null;
	if (userId === null) {
		contactEmail = text(input, 'contact_email');
		if (!contactEmail) c.fail('contact_email', 'required');
		else if (contactEmail.length > EMAIL_MAX) c.fail('contact_email', 'too_long');
		else if (!EMAIL_RE.test(contactEmail)) fail({ contact_email: 'invalid_email' });
	}
	c.done();

	const from = since(now);
	if (userId !== null) assertWithinLimit(db, userId, now);
	else {
		const perEmail =
			db
				.select({ n: count() })
				.from(t.suggestions)
				.where(
					and(
						isNull(t.suggestions.userId),
						eq(t.suggestions.contactEmail, contactEmail!),
						gte(t.suggestions.createdAt, from)
					)
				)
				.get()?.n ?? 0;
		const total =
			db
				.select({ n: count() })
				.from(t.suggestions)
				.where(and(isNull(t.suggestions.userId), gte(t.suggestions.createdAt, from)))
				.get()?.n ?? 0;
		if (perEmail >= ANON_DAILY_LIMIT_PER_EMAIL || total >= ANON_DAILY_LIMIT_TOTAL)
			fail({ form: 'rate_limited' });
	}

	const payload: SuggestionPayload = { type: 'creator_request', request, creatorId, name, channel };
	return db
		.insert(t.suggestions)
		.values({
			userId,
			targetType: creatorId !== null ? 'creator' : 'other',
			targetId: creatorId,
			kind: request === 'removal' ? 'delete' : 'update',
			payload,
			note: details,
			isCreatorRequest: true,
			contactEmail,
			createdAt: new Date(Math.floor(now.getTime() / 1000) * 1000)
		})
		.returning({ id: t.suggestions.id })
		.get().id;
}

/** A user's own suggestions, newest first, with the reviewer's message. */
export function listMySuggestions(db: DB, userId: number, limit = 100) {
	return db
		.select({
			id: t.suggestions.id,
			targetType: t.suggestions.targetType,
			targetId: t.suggestions.targetId,
			payload: t.suggestions.payload,
			note: t.suggestions.note,
			isCreatorRequest: t.suggestions.isCreatorRequest,
			status: t.suggestions.status,
			reviewMessage: t.suggestions.reviewMessage,
			reviewedAt: t.suggestions.reviewedAt,
			createdAt: t.suggestions.createdAt
		})
		.from(t.suggestions)
		.where(eq(t.suggestions.userId, userId))
		.orderBy(desc(t.suggestions.createdAt), desc(t.suggestions.id))
		.limit(limit)
		.all();
}

/** The sender withdraws an open suggestion (or one with a question). */
export function withdrawSuggestion(db: DB, userId: number, suggestionId: number): void {
	const row = db
		.select({ userId: t.suggestions.userId, status: t.suggestions.status })
		.from(t.suggestions)
		.where(eq(t.suggestions.id, suggestionId))
		.get();
	if (!row || row.userId !== userId) fail({ suggestion: 'target_missing' });
	if (row.status !== 'open' && row.status !== 'question') fail({ suggestion: 'not_pending' });
	db.update(t.suggestions)
		.set({ status: 'withdrawn' })
		.where(eq(t.suggestions.id, suggestionId))
		.run();
}
