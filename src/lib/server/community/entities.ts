/**
 * The content entities a reviewer or a revert can change, each with its current state in the
 * same shape as the audit snapshots of the management service layer, and how to write a state
 * back through that layer (so every change is validated, role-checked and audit-logged).
 */
import { asc, eq } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import * as t from '../db/schema.js';
import { type Actor, hasRole, type Input, iso } from '../manage/core.js';
import { deleteChannel, deleteCreator, updateChannel, updateCreator } from '../manage/creators.js';
import { deleteRule, updateRule } from '../manage/rules.js';
import { deleteGroup, updateGroup, updateSeries } from '../manage/series.js';
import { setUserRole } from '../manage/users.js';
import { placeVideoByHand, setVideoCaptions, setVideoStatus } from '../manage/videos.js';

export type Snapshot = Record<string, unknown>;

/** Per entity: the keys a revert can write back. Entries with other keys are not revertible. */
export const REVERTIBLE_KEYS: Record<string, readonly string[]> = {
	video: ['seriesId', 'groupId', 'status', 'placedBy', 'hasCreatorCaptions'],
	series: [
		'slug',
		'title',
		'kind',
		'status',
		'grouping',
		'startedAt',
		'endedAt',
		'poster',
		'parentId',
		'descriptions',
		'creatorIds'
	],
	creator: ['slug', 'name', 'color', 'avatarUrl', 'bio', 'optedOut'],
	group: ['seriesId', 'kind', 'number', 'title', 'startsAt', 'endsAt'],
	rule: ['seriesId', 'channelId', 'pattern', 'match', 'target', 'priority', 'enabled'],
	channel: ['creatorId', 'youtubeChannelId', 'title', 'kind', 'syncEnabled'],
	user: ['role']
};

/** Keys that only explain an entry; they never block or take part in a revert. */
export const NOTE_KEYS = new Set(['ruleId', 'reason', 'placedBy']);

/** Entities about content (editors may revert these); the rest is admin only. */
export const CONTENT_ENTITIES = new Set(['video', 'series', 'creator', 'group', 'rule', 'channel']);

export function currentSnapshot(db: DB, entity: string, entityId: number): Snapshot | null {
	switch (entity) {
		case 'video': {
			const v = db.select().from(t.videos).where(eq(t.videos.id, entityId)).get();
			return v
				? {
						seriesId: v.seriesId,
						groupId: v.groupId,
						status: v.status,
						placedBy: v.placedBy,
						hasCreatorCaptions: v.hasCreatorCaptions,
						isLiveVod: v.isLiveVod,
						title: v.title
					}
				: null;
		}
		case 'series': {
			const s = db.select().from(t.series).where(eq(t.series.id, entityId)).get();
			if (!s) return null;
			const descriptions = db
				.select()
				.from(t.seriesTranslations)
				.where(eq(t.seriesTranslations.seriesId, entityId))
				.all();
			const creatorIds = db
				.select({ id: t.seriesCreators.creatorId })
				.from(t.seriesCreators)
				.where(eq(t.seriesCreators.seriesId, entityId))
				.all()
				.map((r) => r.id)
				.sort((a, b) => a - b);
			return {
				slug: s.slug,
				title: s.title,
				kind: s.kind,
				status: s.status,
				grouping: s.grouping,
				startedAt: iso(s.startedAt),
				endedAt: iso(s.endedAt),
				poster: s.poster,
				parentId: s.parentId,
				descriptions: Object.fromEntries(descriptions.map((d) => [d.locale, d.description])),
				creatorIds
			};
		}
		case 'creator': {
			const c = db.select().from(t.creators).where(eq(t.creators.id, entityId)).get();
			return c
				? {
						slug: c.slug,
						name: c.name,
						color: c.color,
						avatarUrl: c.avatarUrl,
						bio: c.bio,
						optedOut: c.optedOut
					}
				: null;
		}
		case 'group': {
			const g = db.select().from(t.groups).where(eq(t.groups.id, entityId)).get();
			return g
				? {
						seriesId: g.seriesId,
						kind: g.kind,
						number: g.number,
						title: g.title,
						startsAt: iso(g.startsAt),
						endsAt: iso(g.endsAt)
					}
				: null;
		}
		case 'rule': {
			const r = db.select().from(t.titleRules).where(eq(t.titleRules.id, entityId)).get();
			return r
				? {
						seriesId: r.seriesId,
						channelId: r.channelId,
						pattern: r.pattern,
						match: r.match,
						target: r.target,
						priority: r.priority,
						enabled: r.enabled
					}
				: null;
		}
		case 'channel': {
			const c = db.select().from(t.channels).where(eq(t.channels.id, entityId)).get();
			return c
				? {
						creatorId: c.creatorId,
						youtubeChannelId: c.youtubeChannelId,
						title: c.title,
						kind: c.kind,
						syncEnabled: c.syncEnabled
					}
				: null;
		}
		case 'user': {
			const u = db.select().from(t.users).where(eq(t.users.id, entityId)).get();
			return u ? { role: u.role, creatorId: u.creatorId } : null;
		}
		default:
			return null;
	}
}

const dateInput = (value: unknown) =>
	typeof value === 'string' && value ? value.slice(0, 19) : '';
const str = (value: unknown) =>
	typeof value === 'string'
		? value
		: typeof value === 'number' || typeof value === 'boolean'
			? String(value)
			: '';
const on = (value: unknown) => (value ? 'on' : '');

/** A series snapshot as the input of `updateSeries`. */
export function seriesInput(s: Snapshot): Input {
	const descriptions = (s.descriptions ?? {}) as Record<string, string>;
	const poster = (s.poster ?? { type: 'art', palette: 'meadow', seed: 1 }) as t.PosterSettings;
	return {
		title: str(s.title),
		slug: str(s.slug),
		kind: str(s.kind),
		status: str(s.status),
		grouping: str(s.grouping),
		started_at: dateInput(s.startedAt),
		ended_at: dateInput(s.endedAt),
		...Object.fromEntries(Object.entries(descriptions).map(([l, d]) => [`description_${l}`, d])),
		creators: ((s.creatorIds ?? []) as number[]).map(String),
		...(poster.type === 'image'
			? { poster_type: 'image', poster_url: poster.url }
			: {
					poster_type: 'art',
					palette: poster.palette,
					seed: String(poster.seed),
					motif: poster.motif ?? ''
				})
	};
}

/** A creator snapshot as the input of `updateCreator`. Only admins change `opted_out`. */
export function creatorInput(s: Snapshot, actor: Actor, current: Snapshot): Input {
	const input: Record<string, unknown> = {
		name: str(s.name),
		slug: str(s.slug),
		color: str(s.color),
		avatar_url: str(s.avatarUrl),
		bio: str(s.bio)
	};
	if (hasRole(actor, 'admin')) input.opted_out = on(s.optedOut);
	else if (s.optedOut !== current.optedOut) input.opted_out = s.optedOut ? 'on' : 'off';
	return input;
}

/** Writes `state` (a full snapshot) back through the service layer. */
export function applySnapshot(
	db: DB,
	actor: Actor,
	entity: string,
	entityId: number,
	state: Snapshot,
	current: Snapshot,
	locales: readonly string[]
): void {
	switch (entity) {
		case 'video': {
			const moved =
				state.seriesId !== current.seriesId ||
				state.groupId !== current.groupId ||
				state.status !== current.status;
			if (moved) {
				if (state.status === 'placed')
					placeVideoByHand(db, actor, entityId, {
						series_id: str(state.seriesId),
						group_id: str(state.groupId)
					});
				else
					setVideoStatus(db, actor, entityId, state.status === 'ignored' ? 'ignored' : 'unsorted');
			}
			if (state.hasCreatorCaptions !== current.hasCreatorCaptions)
				setVideoCaptions(db, actor, entityId, Boolean(state.hasCreatorCaptions));
			return;
		}
		case 'series':
			updateSeries(db, actor, entityId, seriesInput(state), locales);
			return;
		case 'creator':
			updateCreator(db, actor, entityId, creatorInput(state, actor, current));
			return;
		case 'group':
			updateGroup(db, actor, Number(current.seriesId), entityId, {
				kind: str(state.kind),
				number: str(state.number),
				title: str(state.title),
				starts_at: dateInput(state.startsAt),
				ends_at: dateInput(state.endsAt)
			});
			return;
		case 'rule':
			updateRule(db, actor, Number(current.seriesId), entityId, {
				pattern: str(state.pattern),
				match: str(state.match),
				target: str(state.target),
				channel_id: str(state.channelId),
				priority: str(state.priority),
				enabled: on(state.enabled)
			});
			return;
		case 'channel':
			updateChannel(db, actor, entityId, {
				kind: str(state.kind),
				title: str(state.title),
				sync_enabled: on(state.syncEnabled)
			});
			return;
		case 'user':
			setUserRole(db, actor, entityId, { role: str(state.role) });
			return;
	}
	throw new Error(`Cannot write ${entity}`);
}

/** Entities whose creation a revert can undo (by deleting them through the service layer). */
export const DELETABLE = new Set(['group', 'rule', 'channel', 'creator']);

export function deleteEntity(
	db: DB,
	actor: Actor,
	entity: string,
	entityId: number,
	current: Snapshot
) {
	if (entity === 'group') deleteGroup(db, actor, Number(current.seriesId), entityId);
	else if (entity === 'rule') deleteRule(db, actor, Number(current.seriesId), entityId);
	else if (entity === 'channel') deleteChannel(db, actor, entityId);
	else if (entity === 'creator') deleteCreator(db, actor, entityId);
	else throw new Error(`Cannot delete ${entity}`);
}

/** Every series' participants, for building `updateSeries` input from the current state. */
export function participantsOf(db: DB, seriesId: number): number[] {
	return db
		.select({ id: t.seriesCreators.creatorId })
		.from(t.seriesCreators)
		.where(eq(t.seriesCreators.seriesId, seriesId))
		.orderBy(asc(t.seriesCreators.creatorId))
		.all()
		.map((r) => r.id);
}
