/** Creators and their channels in the management tool. */
import { and, asc, count, desc, eq, like, ne, or } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import * as t from '../db/schema.js';
import type { YouTubeClient } from '../youtube/client.js';
import {
	type Actor,
	assertRole,
	auditUser,
	Checker,
	colorField,
	flag,
	ForbiddenError,
	hasRole,
	type Input,
	iso,
	NotFoundError,
	oneOf,
	optionalText,
	optionalUrl,
	requiredText,
	text,
	ValidationError
} from './core.js';
import { slugField } from './slug.js';

export const NAME_MAX = 80;
export const BIO_MAX = 500;

type CreatorRow = typeof t.creators.$inferSelect;

/** What `audit_log` keeps of a creator. */
export const creatorSnapshot = (c: CreatorRow) => ({
	slug: c.slug,
	name: c.name,
	color: c.color,
	avatarUrl: c.avatarUrl,
	bio: c.bio,
	links: c.links,
	optedOut: c.optedOut
});
const snapshot = creatorSnapshot;

export function listCreators(db: DB, actor: Actor, search = '') {
	assertRole(actor, 'editor');
	const q = search.trim();
	const pattern = `%${q.replace(/[%_\\]/g, (ch) => `\\${ch}`)}%`;
	const rows = db
		.select({
			id: t.creators.id,
			slug: t.creators.slug,
			name: t.creators.name,
			color: t.creators.color,
			avatarUrl: t.creators.avatarUrl,
			claimedAt: t.creators.claimedAt,
			optedOut: t.creators.optedOut
		})
		.from(t.creators)
		.where(q ? or(like(t.creators.name, pattern), like(t.creators.slug, pattern)) : undefined)
		.orderBy(asc(t.creators.name))
		.all();
	const channelCounts = new Map(
		db
			.select({ creatorId: t.channels.creatorId, n: count() })
			.from(t.channels)
			.groupBy(t.channels.creatorId)
			.all()
			.map((r) => [r.creatorId, r.n])
	);
	return rows.map((r) => ({ ...r, channels: channelCounts.get(r.id) ?? 0 }));
}

export function getCreator(db: DB, actor: Actor, creatorId: number) {
	assertRole(actor, 'editor');
	const creator = db.select().from(t.creators).where(eq(t.creators.id, creatorId)).get();
	if (!creator) throw new NotFoundError();
	const channels = db
		.select()
		.from(t.channels)
		.where(eq(t.channels.creatorId, creatorId))
		.orderBy(asc(t.channels.id))
		.all();
	const claimedBy =
		db
			.select({ id: t.users.id, name: t.users.name })
			.from(t.users)
			.where(eq(t.users.creatorId, creatorId))
			.get() ?? null;
	return {
		creator,
		channels,
		claimedBy,
		videos: countVideos(db, creatorId),
		lastCreatorEdit: lastCreatorEdit(db, creatorId)
	};
}

/** When the claimed creator last changed their own profile on the creator dashboard, or null. */
export function lastCreatorEdit(db: DB, creatorId: number): Date | null {
	return (
		db
			.select({ at: t.auditLog.createdAt })
			.from(t.auditLog)
			.where(
				and(
					eq(t.auditLog.entity, 'creator'),
					eq(t.auditLog.entityId, creatorId),
					eq(t.auditLog.actor, 'creator')
				)
			)
			.orderBy(desc(t.auditLog.id))
			.get()?.at ?? null
	);
}

function countVideos(db: DB | Parameters<Parameters<DB['transaction']>[0]>[0], creatorId: number) {
	return (
		db
			.select({ n: count() })
			.from(t.videos)
			.innerJoin(t.channels, eq(t.channels.id, t.videos.channelId))
			.where(eq(t.channels.creatorId, creatorId))
			.get()?.n ?? 0
	);
}

function slugTaken(db: DB, slug: string, exceptId?: number) {
	return Boolean(
		db
			.select({ id: t.creators.id })
			.from(t.creators)
			.where(and(eq(t.creators.slug, slug), exceptId ? ne(t.creators.id, exceptId) : undefined))
			.get()
	);
}

function parseCreator(db: DB, input: Input, exceptId?: number) {
	const c = new Checker();
	const name = requiredText(c, input, 'name', NAME_MAX);
	const slug = slugField(c, input, name, (s) => slugTaken(db, s, exceptId));
	const color = colorField(c, input, 'color');
	const avatarUrl = optionalUrl(c, input, 'avatar_url');
	const bio = optionalText(c, input, 'bio', BIO_MAX);
	return { c, values: { name, slug, color, avatarUrl, bio } };
}

export function createCreator(db: DB, actor: Actor, input: Input): CreatorRow {
	assertRole(actor, 'editor');
	const { c, values } = parseCreator(db, input);
	const optedOut = flag(input, 'opted_out');
	if (optedOut && !hasRole(actor, 'admin')) c.fail('opted_out', 'admin_only');
	c.done();
	return db.transaction((tx) => {
		const row = tx
			.insert(t.creators)
			.values({ ...values, optedOut })
			.returning()
			.get();
		auditUser(tx, actor, 'creator', row.id, null, snapshot(row));
		return row;
	});
}

/** The fields that belong to a creator who claimed their profile. Only admins may change them. */
const CLAIMED_FIELDS = ['color', 'avatarUrl', 'bio'] as const;
const FIELD_NAMES: Record<(typeof CLAIMED_FIELDS)[number], string> = {
	color: 'color',
	avatarUrl: 'avatar_url',
	bio: 'bio'
};

export function updateCreator(db: DB, actor: Actor, creatorId: number, input: Input): CreatorRow {
	assertRole(actor, 'editor');
	const before = db.select().from(t.creators).where(eq(t.creators.id, creatorId)).get();
	if (!before) throw new NotFoundError();
	const { c, values } = parseCreator(db, input, creatorId);
	const isAdmin = hasRole(actor, 'admin');

	// A claimed profile's bio, avatar and colour are the creator's. Editors keep the old values.
	if (before.claimedAt && !isAdmin) {
		for (const field of CLAIMED_FIELDS) {
			const name = FIELD_NAMES[field];
			const given = input instanceof FormData ? input.has(name) : name in input;
			if (!given) delete c.errors[name];
			else if ((values[field] ?? null) !== (before[field] ?? null)) {
				c.fail(name, 'claimed_locked');
			}
			values[field] = before[field] as never;
		}
	}
	const optedOut = isAdmin
		? flag(input, 'opted_out')
		: (() => {
				if (text(input, 'opted_out') && flag(input, 'opted_out') !== before.optedOut)
					c.fail('opted_out', 'admin_only');
				return before.optedOut;
			})();
	c.done();

	return db.transaction((tx) => {
		const row = tx
			.update(t.creators)
			.set({ ...values, optedOut })
			.where(eq(t.creators.id, creatorId))
			.returning()
			.get();
		auditUser(tx, actor, 'creator', creatorId, snapshot(before), snapshot(row));
		return row;
	});
}

/** Deletes a creator without videos. With videos it explains instead (`has_videos`). */
export function deleteCreator(db: DB, actor: Actor, creatorId: number): void {
	assertRole(actor, 'editor');
	db.transaction((tx) => {
		const before = tx.select().from(t.creators).where(eq(t.creators.id, creatorId)).get();
		if (!before) throw new NotFoundError();
		if (countVideos(tx, creatorId) > 0) throw new ValidationError({ creator: 'has_videos' });
		if (before.claimedAt && !hasRole(actor, 'admin')) throw new ForbiddenError();
		tx.delete(t.creators).where(eq(t.creators.id, creatorId)).run();
		auditUser(tx, actor, 'creator', creatorId, snapshot(before), null);
	});
}

/* ---------- channels ---------- */

export const CHANNEL_ID_RE = /^UC[\w-]{22}$/;
const HANDLE_RE = /^@[\w.-]{3,30}$/;

export type ChannelQuery = { type: 'id'; id: string } | { type: 'handle'; handle: string };

/**
 * Reads what someone typed to add a channel: a channel id (`UC…`), a handle (`@name`) or a
 * channel URL (`youtube.com/channel/UC…`, `youtube.com/@name`). Returns null when it is none.
 */
export function parseChannelInput(raw: string): ChannelQuery | null {
	const value = raw.trim();
	if (CHANNEL_ID_RE.test(value)) return { type: 'id', id: value };
	if (HANDLE_RE.test(value)) return { type: 'handle', handle: value };
	let url: URL;
	try {
		url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
	} catch {
		return null;
	}
	const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '');
	if (host !== 'youtube.com') return null;
	const [first, second] = url.pathname.split('/').filter(Boolean);
	if (first === 'channel' && second && CHANNEL_ID_RE.test(second))
		return { type: 'id', id: second };
	if (first && HANDLE_RE.test(decodeURIComponent(first)))
		return { type: 'handle', handle: decodeURIComponent(first) };
	return null;
}

export interface ResolvedChannel {
	youtubeChannelId: string;
	title: string;
	/** False when there was no API key and the id was taken as typed. */
	checked: boolean;
}

/**
 * Turns the typed channel into a YouTube channel id and title. With a client (API key) it asks
 * `channels.list`; without one only a raw `UC…` id is accepted, unchecked.
 */
export async function resolveChannel(
	client: YouTubeClient | null,
	raw: string
): Promise<ResolvedChannel> {
	const query = parseChannelInput(raw);
	if (!raw.trim()) throw new ValidationError({ channel: 'required' });
	if (!query) throw new ValidationError({ channel: 'invalid_channel' });
	if (!client) {
		if (query.type !== 'id') throw new ValidationError({ channel: 'needs_channel_id' });
		return { youtubeChannelId: query.id, title: '', checked: false };
	}
	let found;
	try {
		found = await client.findChannel(
			query.type === 'id' ? { id: query.id } : { handle: query.handle }
		);
	} catch {
		throw new ValidationError({ channel: 'youtube_error' });
	}
	if (!found) throw new ValidationError({ channel: 'channel_not_found' });
	return { ...found, checked: true };
}

type ChannelRow = typeof t.channels.$inferSelect;
/** What `audit_log` keeps of a channel (also used for unlinking by the creator). */
export const channelSnapshot = (c: ChannelRow) => ({
	creatorId: c.creatorId,
	youtubeChannelId: c.youtubeChannelId,
	title: c.title,
	kind: c.kind,
	syncEnabled: c.syncEnabled,
	unlinkedAt: iso(c.unlinkedAt),
	unlinkedByUserId: c.unlinkedByUserId
});

/** Adds a channel (after `resolveChannel`) to a creator. */
export function addChannel(db: DB, actor: Actor, creatorId: number, input: Input): ChannelRow {
	assertRole(actor, 'editor');
	const creator = db.select().from(t.creators).where(eq(t.creators.id, creatorId)).get();
	if (!creator) throw new NotFoundError();
	const c = new Checker();
	const youtubeChannelId = text(input, 'youtube_channel_id');
	if (!CHANNEL_ID_RE.test(youtubeChannelId)) c.fail('channel', 'invalid_channel');
	else if (
		db
			.select({ id: t.channels.id })
			.from(t.channels)
			.where(eq(t.channels.youtubeChannelId, youtubeChannelId))
			.get()
	)
		c.fail('channel', 'channel_taken');
	const title = optionalText(c, input, 'title', 120) ?? creator.name;
	const kind = oneOf(c, input, 'kind', ['main', 'secondary'] as const, 'main');
	const syncEnabled = text(input, 'sync_enabled') ? flag(input, 'sync_enabled') : true;
	c.done();
	return db.transaction((tx) => {
		const row = tx
			.insert(t.channels)
			.values({ creatorId, youtubeChannelId, title, kind, syncEnabled })
			.returning()
			.get();
		auditUser(tx, actor, 'channel', row.id, null, channelSnapshot(row));
		return row;
	});
}

export function updateChannel(db: DB, actor: Actor, channelId: number, input: Input): ChannelRow {
	assertRole(actor, 'editor');
	const before = db.select().from(t.channels).where(eq(t.channels.id, channelId)).get();
	if (!before) throw new NotFoundError();
	const c = new Checker();
	const kind = oneOf(c, input, 'kind', ['main', 'secondary'] as const, before.kind);
	const syncEnabled = flag(input, 'sync_enabled');
	const title = optionalText(c, input, 'title', 120) ?? before.title;
	c.done();
	return db.transaction((tx) => {
		const row = tx
			.update(t.channels)
			.set({ kind, syncEnabled, title })
			.where(eq(t.channels.id, channelId))
			.returning()
			.get();
		auditUser(tx, actor, 'channel', channelId, channelSnapshot(before), channelSnapshot(row));
		return row;
	});
}

/** Removes a channel without videos. */
export function deleteChannel(db: DB, actor: Actor, channelId: number): void {
	assertRole(actor, 'editor');
	db.transaction((tx) => {
		const before = tx.select().from(t.channels).where(eq(t.channels.id, channelId)).get();
		if (!before) throw new NotFoundError();
		const videos =
			tx.select({ n: count() }).from(t.videos).where(eq(t.videos.channelId, channelId)).get()?.n ??
			0;
		if (videos > 0) throw new ValidationError({ channel: 'has_videos' });
		tx.delete(t.channels).where(eq(t.channels.id, channelId)).run();
		auditUser(tx, actor, 'channel', channelId, channelSnapshot(before), null);
	});
}

/**
 * Links a channel the creator unlinked back to their profile (admins only): its videos show
 * again and the sync is on again.
 */
export function restoreChannel(db: DB, actor: Actor, channelId: number): ChannelRow {
	assertRole(actor, 'admin');
	const before = db.select().from(t.channels).where(eq(t.channels.id, channelId)).get();
	if (!before) throw new NotFoundError();
	if (!before.unlinkedAt) return before;
	return db.transaction((tx) => {
		const row = tx
			.update(t.channels)
			.set({ unlinkedAt: null, unlinkedByUserId: null, syncEnabled: true })
			.where(eq(t.channels.id, channelId))
			.returning()
			.get();
		auditUser(tx, actor, 'channel', channelId, channelSnapshot(before), channelSnapshot(row));
		return row;
	});
}
