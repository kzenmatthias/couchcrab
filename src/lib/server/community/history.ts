/**
 * The history (`audit_log`): the filterable list for the management tool, reverting an entry
 * through the service layer, and the public history of one series.
 */
import {
	aliasedTable,
	and,
	desc,
	eq,
	gte,
	inArray,
	isNotNull,
	isNull,
	lt,
	or,
	sql
} from 'drizzle-orm';
import type { ActorType, FieldChange, RevertBlock } from '../../community/change.js';
import type { DB } from '../db/client.js';
import * as t from '../db/schema.js';
import {
	type Actor,
	assertRole,
	auditUser,
	hasRole,
	NotFoundError,
	ValidationError
} from '../manage/core.js';
import { describeChanges, entityLabel, type EntityLabel, Resolver } from './changes.js';
import {
	applySnapshot,
	CONTENT_ENTITIES,
	currentSnapshot,
	DELETABLE,
	deleteEntity,
	NOTE_KEYS,
	REVERTIBLE_KEYS,
	type Snapshot
} from './entities.js';
import { fail } from './suggestions.js';
import { runTagged } from './tx.js';

export const HISTORY_PAGE = 50;

type EntryRow = typeof t.auditLog.$inferSelect;

export interface HistoryFilter {
	entity?: string | null;
	actorType?: ActorType | null;
	/** Inclusive, UTC. */
	from?: Date | null;
	/** Exclusive, UTC. */
	to?: Date | null;
	page?: number;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const meaningful = (snap: Snapshot | null) =>
	Object.keys(snap ?? {}).filter((k) => !NOTE_KEYS.has(k));

/**
 * Why this entry cannot be reverted by this actor right now, or null when it can. Checks, in
 * order: already reverted, an entity or kind of change a revert cannot write, roles, the entity
 * still existing, and a conflict (the fields this entry changed have changed again since).
 */
export function revertBlock(db: DB, actor: Actor, entry: EntryRow): RevertBlock | null {
	if (entry.revertedBy !== null) return 'already_reverted';
	const keys = REVERTIBLE_KEYS[entry.entity];
	if (!keys) return 'not_revertible';
	if (!CONTENT_ENTITIES.has(entry.entity) && !hasRole(actor, 'admin')) return 'admin_only';
	// Linking or unlinking a creator's channel is the creator's or an admin's call.
	if (
		entry.entity === 'channel' &&
		!same(entry.before?.unlinkedAt, entry.after?.unlinkedAt) &&
		!hasRole(actor, 'admin')
	)
		return 'admin_only';
	if (entry.after === null) return 'not_revertible';
	if (entry.before === null) {
		if (entry.entity === 'video') return 'from_youtube';
		if (!DELETABLE.has(entry.entity)) return 'not_revertible';
	} else {
		const changed = meaningful(entry.before);
		if (changed.length === 0) return 'not_revertible';
		if (entry.entity === 'video' && changed.includes('title')) return 'from_youtube';
		if (!changed.every((k) => keys.includes(k))) return 'not_revertible';
	}
	const current = currentSnapshot(db, entry.entity, entry.entityId);
	if (!current) return 'missing';
	for (const key of meaningful(entry.after)) {
		if (keys.includes(key) && !same(current[key], entry.after[key])) return 'conflict';
	}
	return null;
}

/**
 * Reverts an entry: writes its `before` state back through the service layer (or deletes what it
 * created), in one transaction. The new audit entries point at the reverted one (`revert_of`)
 * and the reverted entry points at the first of them (`reverted_by`). Refuses with
 * `revert: <reason>` (see `revertBlock`), or with the service layer's error code.
 */
export function revertEntry(db: DB, actor: Actor, entryId: number, locales: readonly string[]) {
	assertRole(actor, 'editor');
	const entry = db.select().from(t.auditLog).where(eq(t.auditLog.id, entryId)).get();
	if (!entry) throw new NotFoundError();
	const block = revertBlock(db, actor, entry);
	if (block) fail({ revert: block });
	const current = currentSnapshot(db, entry.entity, entry.entityId)!;
	try {
		return runTagged(
			db,
			(tx) => {
				if (entry.before === null) {
					deleteEntity(tx, actor, entry.entity, entry.entityId, current);
					return;
				}
				const keys = REVERTIBLE_KEYS[entry.entity];
				const state: Snapshot = { ...current };
				for (const key of meaningful(entry.before))
					if (keys.includes(key)) state[key] = entry.before[key];
				applySnapshot(tx, actor, entry.entity, entry.entityId, state, current, locales);
			},
			(tx, ids) => {
				// A revert that had nothing to write still gets an entry, so the history says so.
				if (ids.length === 0)
					ids.push(auditUser(tx, actor, entry.entity, entry.entityId, entry.after, entry.before));
				tx.update(t.auditLog).set({ revertOf: entry.id }).where(inArray(t.auditLog.id, ids)).run();
				tx.update(t.auditLog).set({ revertedBy: ids[0] }).where(eq(t.auditLog.id, entry.id)).run();
			}
		);
	} catch (err) {
		if (err instanceof NotFoundError) fail({ revert: 'missing' });
		if (err instanceof ValidationError) {
			throw new ValidationError({ revert: Object.values(err.errors)[0] ?? 'invalid_choice' });
		}
		throw err;
	}
}

const actorUser = aliasedTable(t.users, 'actor_user');

function actorTypeOf(
	actor: EntryRow['actor'],
	role: string | null,
	creatorId: number | null
): ActorType {
	if (actor === 'rule') return 'rule';
	if (actor === 'sync') return 'sync';
	// The creator dashboard writes its own actor value; older entries are users with a profile.
	if (actor === 'creator') return 'creator';
	return creatorId !== null && role === 'viewer' ? 'creator' : 'person';
}

export interface HistoryItem {
	id: number;
	actorType: ActorType;
	actorName: string | null;
	entity: string;
	entityId: number;
	createdAt: Date;
	label: EntityLabel;
	changes: FieldChange[];
	kind: 'create' | 'update' | 'delete';
	revertedBy: number | null;
	revertOf: number | null;
	suggestionId: number | null;
	block: RevertBlock | null;
}

/** The history for the management tool, newest first, `HISTORY_PAGE` per page. */
export function listHistory(db: DB, actor: Actor, filter: HistoryFilter = {}) {
	assertRole(actor, 'editor');
	const conditions = [
		filter.entity ? eq(t.auditLog.entity, filter.entity) : undefined,
		filter.from ? gte(t.auditLog.createdAt, filter.from) : undefined,
		filter.to ? lt(t.auditLog.createdAt, filter.to) : undefined
	];
	switch (filter.actorType) {
		case 'rule':
		case 'sync':
			conditions.push(eq(t.auditLog.actor, filter.actorType));
			break;
		case 'creator':
			conditions.push(
				or(
					eq(t.auditLog.actor, 'creator'),
					and(
						eq(t.auditLog.actor, 'user'),
						isNotNull(actorUser.creatorId),
						eq(actorUser.role, 'viewer')
					)
				)
			);
			break;
		case 'person':
			conditions.push(
				and(
					eq(t.auditLog.actor, 'user'),
					or(isNull(actorUser.creatorId), sql`${actorUser.role} <> 'viewer'`)
				)
			);
			break;
	}
	const page = Math.max(0, filter.page ?? 0);
	const rows = db
		.select({
			e: t.auditLog,
			name: actorUser.name,
			role: actorUser.role,
			creatorId: actorUser.creatorId
		})
		.from(t.auditLog)
		.leftJoin(actorUser, eq(actorUser.id, t.auditLog.actorUserId))
		.where(and(...conditions))
		.orderBy(desc(t.auditLog.id))
		.limit(HISTORY_PAGE + 1)
		.offset(page * HISTORY_PAGE)
		.all();
	const r = new Resolver(db);
	const items: HistoryItem[] = rows.slice(0, HISTORY_PAGE).map(({ e, name, role, creatorId }) => ({
		id: e.id,
		actorType: actorTypeOf(e.actor, role, creatorId),
		actorName: name,
		entity: e.entity,
		entityId: e.entityId,
		createdAt: e.createdAt,
		label: entityLabel(r, db, e.entity, e.entityId, e.after ?? e.before),
		changes: describeChanges(r, e.entity, e.before, e.after),
		kind: e.before === null ? 'create' : e.after === null ? 'delete' : 'update',
		revertedBy: e.revertedBy,
		revertOf: e.revertOf,
		suggestionId: e.suggestionId,
		block: revertBlock(db, actor, e)
	}));
	return { items, page, hasMore: rows.length > HISTORY_PAGE };
}

/** One entry with its label and changes, for the revert confirmation. */
export function getHistoryItem(db: DB, actor: Actor, entryId: number): HistoryItem {
	assertRole(actor, 'editor');
	const row = db
		.select({
			e: t.auditLog,
			name: actorUser.name,
			role: actorUser.role,
			creatorId: actorUser.creatorId
		})
		.from(t.auditLog)
		.leftJoin(actorUser, eq(actorUser.id, t.auditLog.actorUserId))
		.where(eq(t.auditLog.id, entryId))
		.get();
	if (!row) throw new NotFoundError();
	const { e } = row;
	const r = new Resolver(db);
	return {
		id: e.id,
		actorType: actorTypeOf(e.actor, row.role, row.creatorId),
		actorName: row.name,
		entity: e.entity,
		entityId: e.entityId,
		createdAt: e.createdAt,
		label: entityLabel(r, db, e.entity, e.entityId, e.after ?? e.before),
		changes: describeChanges(r, e.entity, e.before, e.after),
		kind: e.before === null ? 'create' : e.after === null ? 'delete' : 'update',
		revertedBy: e.revertedBy,
		revertOf: e.revertOf,
		suggestionId: e.suggestionId,
		block: revertBlock(db, actor, e)
	};
}

/* ---------- public history of a series ---------- */

export const PUBLIC_HISTORY_LIMIT = 30;

export interface PublicHistoryItem {
	id: number;
	actorType: ActorType;
	/** Only editors, admins and verified creators are named; everyone else is null. */
	actorName: string | null;
	/** The change came from an approved community suggestion. */
	suggested: boolean;
	entity: string;
	createdAt: Date;
	/** Null for an episode whose title is hidden (spoiler-free). */
	label: EntityLabel | null;
	changes: FieldChange[];
	kind: 'create' | 'update' | 'delete';
	isRevert: boolean;
}

/**
 * Recent public history of a series and its Extras: the series itself, its sessions and weeks,
 * its title rules and placements of videos that are public now. Viewers' names are never shown.
 * With `spoilerFree`, video titles are left out.
 */
export function publicSeriesHistory(
	db: DB,
	seriesId: number,
	{ spoilerFree = false, limit = PUBLIC_HISTORY_LIMIT } = {}
): PublicHistoryItem[] {
	const ids = [
		seriesId,
		...db
			.select({ id: t.series.id })
			.from(t.series)
			.where(eq(t.series.parentId, seriesId))
			.all()
			.map((s) => s.id)
	];
	const list = sql.join(
		ids.map((n) => sql`${n}`),
		sql`, `
	);
	const inSeries = sql`(json_extract(${t.auditLog.before}, '$.seriesId') IN (${list}) OR json_extract(${t.auditLog.after}, '$.seriesId') IN (${list}))`;
	const rows = db
		.select({
			e: t.auditLog,
			name: actorUser.name,
			role: actorUser.role,
			creatorId: actorUser.creatorId
		})
		.from(t.auditLog)
		.leftJoin(actorUser, eq(actorUser.id, t.auditLog.actorUserId))
		.where(
			or(
				and(eq(t.auditLog.entity, 'series'), inArray(t.auditLog.entityId, ids)),
				and(inArray(t.auditLog.entity, ['group', 'rule', 'video']), inSeries)
			)
		)
		.orderBy(desc(t.auditLog.id))
		.limit(limit * 3)
		.all();

	// Videos must be public right now: placed, not a Short, of a creator who did not opt out.
	const videoIds = [
		...new Set(rows.filter((r) => r.e.entity === 'video').map((r) => r.e.entityId))
	];
	const visible = new Set(
		videoIds.length
			? db
					.select({ id: t.videos.id })
					.from(t.videos)
					.innerJoin(t.channels, eq(t.channels.id, t.videos.channelId))
					.innerJoin(t.creators, eq(t.creators.id, t.channels.creatorId))
					.where(
						and(
							inArray(t.videos.id, videoIds),
							eq(t.videos.status, 'placed'),
							eq(t.videos.isShort, false),
							eq(t.creators.optedOut, false),
							isNull(t.channels.unlinkedAt)
						)
					)
					.all()
					.map((v) => v.id)
			: []
	);
	const r = new Resolver(db);
	const out: PublicHistoryItem[] = [];
	for (const { e, name, role, creatorId } of rows) {
		if (out.length >= limit) break;
		if (e.entity === 'video' && !visible.has(e.entityId)) continue;
		const actorType = actorTypeOf(e.actor, role, creatorId);
		const named =
			actorType === 'creator' || (e.actor === 'user' && (role === 'editor' || role === 'admin'));
		out.push({
			id: e.id,
			actorType,
			actorName: named ? name : null,
			suggested: e.suggestionId !== null,
			entity: e.entity,
			createdAt: e.createdAt,
			label:
				e.entity === 'video' && spoilerFree
					? null
					: entityLabel(r, db, e.entity, e.entityId, e.after ?? e.before),
			changes: describeChanges(r, e.entity, e.before, e.after).filter(
				(ch) => !(spoilerFree && e.entity === 'video' && ch.field === 'title')
			),
			kind: e.before === null ? 'create' : e.after === null ? 'delete' : 'update',
			isRevert: e.revertOf !== null
		});
	}
	return out;
}
