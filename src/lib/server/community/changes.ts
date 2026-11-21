/**
 * Turns snapshots (the `before` and `after` of an audit entry, or the current and proposed state
 * of a suggestion) into readable field changes: ids become names, enums stay codes the browser
 * translates. See `src/lib/community/change.ts` for the shape.
 */
import { eq, inArray } from 'drizzle-orm';
import type { FieldChange, GroupRef, Val, ValCode } from '../../community/change.js';
import type { Executor } from '../audit.js';
import * as t from '../db/schema.js';

/** Keys that explain an entry but are not a change a reader needs to see. */
const HIDDEN = new Set(['placedBy', 'ruleId', 'reason', 'claimedByUserId', 'verifiedByUserId']);

/** Audit keys and the field names the UI knows (`fieldLabel` in `src/lib/community/labels.ts`). */
const FIELD: Record<string, string> = {
	seriesId: 'series',
	groupId: 'group',
	parentId: 'parent',
	creatorId: 'creator',
	channelId: 'channel',
	creatorIds: 'participants',
	hasCreatorCaptions: 'captions',
	isLiveVod: 'live_vod',
	startedAt: 'started_at',
	endedAt: 'ended_at',
	startsAt: 'starts_at',
	endsAt: 'ends_at',
	avatarUrl: 'avatar',
	optedOut: 'opted_out',
	syncEnabled: 'sync',
	youtubeChannelId: 'youtube_channel',
	youtubeVideoId: 'youtube_video',
	claimedAt: 'claimed_at',
	verifiedAt: 'verified_at'
};

const DATE_KEYS = new Set([
	'startedAt',
	'endedAt',
	'startsAt',
	'endsAt',
	'claimedAt',
	'verifiedAt',
	'publishedAt'
]);

function codeOf(entity: string, key: string): ValCode | null {
	if (key === 'status')
		return entity === 'video' ? 'video_status' : entity === 'series' ? 'series_status' : null;
	if (key === 'kind')
		return entity === 'series' ? 'series_kind' : entity === 'channel' ? 'channel_kind' : null;
	if (key === 'grouping') return 'grouping';
	if (key === 'match') return 'match';
	if (key === 'target') return 'target';
	if (key === 'role') return 'role';
	return null;
}

/** Looks names up once per id. */
export class Resolver {
	private series = new Map<number, string | null>();
	private groups = new Map<number, GroupRef | null>();
	private creators = new Map<number, string | null>();
	private channels = new Map<number, string | null>();

	constructor(private readonly db: Executor) {}

	seriesTitle(id: number): string | null {
		if (!this.series.has(id))
			this.series.set(
				id,
				this.db.select({ v: t.series.title }).from(t.series).where(eq(t.series.id, id)).get()?.v ??
					null
			);
		return this.series.get(id)!;
	}

	group(id: number): GroupRef | null {
		if (!this.groups.has(id))
			this.groups.set(
				id,
				this.db
					.select({ kind: t.groups.kind, number: t.groups.number, title: t.groups.title })
					.from(t.groups)
					.where(eq(t.groups.id, id))
					.get() ?? null
			);
		return this.groups.get(id)!;
	}

	creatorName(id: number): string | null {
		if (!this.creators.has(id))
			this.creators.set(
				id,
				this.db.select({ v: t.creators.name }).from(t.creators).where(eq(t.creators.id, id)).get()
					?.v ?? null
			);
		return this.creators.get(id)!;
	}

	creatorNames(ids: number[]): string[] {
		const missing = ids.filter((id) => !this.creators.has(id));
		if (missing.length)
			for (const r of this.db
				.select({ id: t.creators.id, name: t.creators.name })
				.from(t.creators)
				.where(inArray(t.creators.id, missing))
				.all())
				this.creators.set(r.id, r.name);
		return ids.map((id) => this.creators.get(id) ?? `#${id}`).sort((a, b) => a.localeCompare(b));
	}

	channelTitle(id: number): string | null {
		if (!this.channels.has(id))
			this.channels.set(
				id,
				this.db.select({ v: t.channels.title }).from(t.channels).where(eq(t.channels.id, id)).get()
					?.v ?? null
			);
		return this.channels.get(id)!;
	}
}

const ref = (name: string | null, id: number): Val => ({ text: name ?? `#${id}` });

/** One value of a snapshot as a `Val`. */
export function toVal(r: Resolver, entity: string, key: string, value: unknown): Val {
	if (value === null || value === undefined || value === '') return null;
	if (typeof value === 'number') {
		if (key === 'seriesId' || key === 'parentId') return ref(r.seriesTitle(value), value);
		if (key === 'groupId') {
			const g = r.group(value);
			return g ? { group: g } : { text: `#${value}` };
		}
		if (key === 'creatorId') return ref(r.creatorName(value), value);
		if (key === 'channelId') return ref(r.channelTitle(value), value);
	}
	if (key === 'creatorIds' && Array.isArray(value))
		return { list: r.creatorNames(value.filter((n): n is number => typeof n === 'number')) };
	if (typeof value === 'boolean') return { bool: value };
	if (DATE_KEYS.has(key) && typeof value === 'string') return { date: value };
	if (typeof value === 'string') {
		const code = codeOf(entity, key);
		return code ? { code: value, of: code } : { text: value };
	}
	if (key === 'poster' && typeof value === 'object') {
		const p = value as { type?: string; palette?: string; seed?: number; url?: string };
		return {
			text: p.type === 'image' ? (p.url ?? '') : `${p.palette ?? ''} ${p.seed ?? ''}`.trim()
		};
	}
	return { text: typeof value === 'object' ? JSON.stringify(value) : String(value) };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * The changed fields between two snapshots. With `before` null (something was created) every
 * field of `after` is listed, with `after` null (deleted) every field of `before`.
 */
export function describeChanges(
	db: Executor | Resolver,
	entity: string,
	before: Record<string, unknown> | null,
	after: Record<string, unknown> | null
): FieldChange[] {
	const r = db instanceof Resolver ? db : new Resolver(db);
	const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].filter(
		(k) => !HIDDEN.has(k)
	);
	const out: FieldChange[] = [];
	for (const key of keys) {
		const b = before?.[key];
		const a = after?.[key];
		if (before && after && same(b, a)) continue;
		if (key === 'descriptions') {
			const bd = (b ?? {}) as Record<string, string>;
			const ad = (a ?? {}) as Record<string, string>;
			for (const locale of [...new Set([...Object.keys(bd), ...Object.keys(ad)])].sort()) {
				if (before && after && bd[locale] === ad[locale]) continue;
				out.push({
					field: 'description',
					locale,
					before: bd[locale] ? { text: bd[locale] } : null,
					after: ad[locale] ? { text: ad[locale] } : null
				});
			}
			continue;
		}
		out.push({
			field: FIELD[key] ?? key,
			before: before ? toVal(r, entity, key, b) : null,
			after: after ? toVal(r, entity, key, a) : null
		});
	}
	return out;
}

/** What a history entry is about, for its heading. */
export interface EntityLabel {
	name: Val;
	/** The series a group, rule or video belongs to. */
	context: string | null;
	/** False when the entity no longer exists. */
	exists: boolean;
}

export function entityLabel(
	r: Resolver,
	db: Executor,
	entity: string,
	entityId: number,
	snapshot: Record<string, unknown> | null
): EntityLabel {
	const fromSnap = (key: string) => {
		const v = snapshot?.[key];
		return typeof v === 'string' && v ? v : null;
	};
	const fallback: Val = {
		text: fromSnap('title') ?? fromSnap('name') ?? fromSnap('pattern') ?? `#${entityId}`
	};
	switch (entity) {
		case 'video': {
			const v = db
				.select({ title: t.videos.title, seriesId: t.videos.seriesId })
				.from(t.videos)
				.where(eq(t.videos.id, entityId))
				.get();
			if (!v) return { name: fallback, context: null, exists: false };
			return {
				name: { text: v.title || `#${entityId}` },
				context: v.seriesId ? r.seriesTitle(v.seriesId) : null,
				exists: true
			};
		}
		case 'series': {
			const name = r.seriesTitle(entityId);
			return { name: name ? { text: name } : fallback, context: null, exists: name !== null };
		}
		case 'group': {
			const g = db.select().from(t.groups).where(eq(t.groups.id, entityId)).get();
			if (!g) {
				const s = snapshot?.seriesId;
				return {
					name:
						typeof snapshot?.number === 'number' &&
						(snapshot.kind === 'session' || snapshot.kind === 'week')
							? {
									group: { kind: snapshot.kind, number: snapshot.number, title: fromSnap('title') }
								}
							: fallback,
					context: typeof s === 'number' ? r.seriesTitle(s) : null,
					exists: false
				};
			}
			return {
				name: { group: { kind: g.kind, number: g.number, title: g.title } },
				context: r.seriesTitle(g.seriesId),
				exists: true
			};
		}
		case 'creator': {
			const name = r.creatorName(entityId);
			return { name: name ? { text: name } : fallback, context: null, exists: name !== null };
		}
		case 'channel': {
			const name = r.channelTitle(entityId);
			return { name: name ? { text: name } : fallback, context: null, exists: name !== null };
		}
		case 'rule': {
			const rule = db.select().from(t.titleRules).where(eq(t.titleRules.id, entityId)).get();
			if (!rule) {
				const s = snapshot?.seriesId;
				return {
					name: fallback,
					context: typeof s === 'number' ? r.seriesTitle(s) : null,
					exists: false
				};
			}
			return { name: { text: rule.pattern }, context: r.seriesTitle(rule.seriesId), exists: true };
		}
		case 'user': {
			const u = db
				.select({ name: t.users.name })
				.from(t.users)
				.where(eq(t.users.id, entityId))
				.get();
			return { name: u ? { text: u.name } : fallback, context: null, exists: !!u };
		}
		default:
			return {
				name: { text: entity.includes(':') ? entity.split(':')[1] : `#${entityId}` },
				context: null,
				exists: true
			};
	}
}
