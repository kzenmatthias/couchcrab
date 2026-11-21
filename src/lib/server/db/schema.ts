/**
 * Couchcrab database schema (SQLite, Drizzle ORM).
 *
 * This file is the source of truth for the data model described in docs/ARCHITECTURE.md.
 * Timestamps are stored as integer Unix seconds (`mode: 'timestamp'`).
 */
import { sql } from 'drizzle-orm';
import {
	type AnySQLiteColumn,
	check,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';

const createdAt = () =>
	integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`);

const bool = (name: string) => integer(name, { mode: 'boolean' });

/* ---------- content ---------- */

export const creators = sqliteTable('creators', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	slug: text('slug').notNull().unique(),
	name: text('name').notNull(),
	/** Hex colour used for the avatar and accents, e.g. `#e05d5d`. */
	color: text('color').notNull(),
	avatarUrl: text('avatar_url'),
	bio: text('bio'),
	/** Set when a user proved they own one of this creator's channels. */
	claimedAt: integer('claimed_at', { mode: 'timestamp' }),
	/** The creator asked to hide all their videos from Couchcrab. */
	optedOut: bool('opted_out').notNull().default(false),
	createdAt: createdAt()
});

export const channels = sqliteTable(
	'channels',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		creatorId: integer('creator_id')
			.notNull()
			.references(() => creators.id, { onDelete: 'cascade' }),
		youtubeChannelId: text('youtube_channel_id').notNull().unique(),
		title: text('title').notNull(),
		kind: text('kind', { enum: ['main', 'secondary'] })
			.notNull()
			.default('main'),
		syncEnabled: bool('sync_enabled').notNull().default(true),
		lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
		/** Set when the owner proved ownership through Google sign-in. */
		verifiedAt: integer('verified_at', { mode: 'timestamp' }),
		verifiedByUserId: integer('verified_by_user_id').references((): AnySQLiteColumn => users.id, {
			onDelete: 'set null'
		})
	},
	(t) => [index('channels_creator_idx').on(t.creatorId)]
);

/** Settings for the generated poster art, or an uploaded image. */
export type PosterSettings =
	{ type: 'art'; palette: string; seed: number } | { type: 'image'; url: string };

export const series = sqliteTable(
	'series',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		slug: text('slug').notNull().unique(),
		title: text('title').notNull(),
		kind: text('kind', { enum: ['season', 'live_series', 'event', 'other'] }).notNull(),
		status: text('status', { enum: ['upcoming', 'ongoing', 'ended'] })
			.notNull()
			.default('ongoing'),
		grouping: text('grouping', { enum: ['week', 'session', 'none'] })
			.notNull()
			.default('week'),
		startedAt: integer('started_at', { mode: 'timestamp' }),
		endedAt: integer('ended_at', { mode: 'timestamp' }),
		poster: text('poster', { mode: 'json' }).$type<PosterSettings>(),
		/** Set for an Extras series: points at the main series. */
		parentId: integer('parent_id').references((): AnySQLiteColumn => series.id, {
			onDelete: 'cascade'
		}),
		createdAt: createdAt()
	},
	(t) => [index('series_parent_idx').on(t.parentId)]
);

export const seriesTranslations = sqliteTable(
	'series_translations',
	{
		seriesId: integer('series_id')
			.notNull()
			.references(() => series.id, { onDelete: 'cascade' }),
		locale: text('locale').notNull(),
		description: text('description').notNull()
	},
	(t) => [primaryKey({ columns: [t.seriesId, t.locale] })]
);

export const seriesCreators = sqliteTable(
	'series_creators',
	{
		seriesId: integer('series_id')
			.notNull()
			.references(() => series.id, { onDelete: 'cascade' }),
		creatorId: integer('creator_id')
			.notNull()
			.references(() => creators.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.seriesId, t.creatorId] })]
);

/** A session (live series) or a manual week inside a series. */
export const groups = sqliteTable(
	'groups',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		seriesId: integer('series_id')
			.notNull()
			.references(() => series.id, { onDelete: 'cascade' }),
		kind: text('kind', { enum: ['session', 'week'] }).notNull(),
		number: integer('number').notNull(),
		title: text('title'),
		startsAt: integer('starts_at', { mode: 'timestamp' }),
		endsAt: integer('ends_at', { mode: 'timestamp' })
	},
	(t) => [uniqueIndex('groups_series_kind_number_idx').on(t.seriesId, t.kind, t.number)]
);

export const videos = sqliteTable(
	'videos',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		youtubeVideoId: text('youtube_video_id').notNull().unique(),
		channelId: integer('channel_id')
			.notNull()
			.references(() => channels.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		publishedAt: integer('published_at', { mode: 'timestamp' }).notNull(),
		durationS: integer('duration_s').notNull().default(0),
		/** Captions made by the creator, not only YouTube's automatic ones. */
		hasCreatorCaptions: bool('has_creator_captions').notNull().default(false),
		isLiveVod: bool('is_live_vod').notNull().default(false),
		isShort: bool('is_short').notNull().default(false),
		seriesId: integer('series_id').references(() => series.id, { onDelete: 'set null' }),
		groupId: integer('group_id').references(() => groups.id, { onDelete: 'set null' }),
		episodeNumber: integer('episode_number'),
		status: text('status', { enum: ['placed', 'unsorted', 'ignored'] })
			.notNull()
			.default('unsorted'),
		placedBy: text('placed_by', { enum: ['rule', 'user', 'sync'] }),
		fetchedAt: integer('fetched_at', { mode: 'timestamp' }).notNull()
	},
	(t) => [
		index('videos_series_published_idx').on(t.seriesId, t.publishedAt),
		index('videos_channel_published_idx').on(t.channelId, t.publishedAt),
		index('videos_group_idx').on(t.groupId),
		index('videos_status_idx').on(t.status)
	]
);

export const titleRules = sqliteTable(
	'title_rules',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		seriesId: integer('series_id')
			.notNull()
			.references(() => series.id, { onDelete: 'cascade' }),
		/** Null means: every channel of the creators in this series. */
		channelId: integer('channel_id').references(() => channels.id, { onDelete: 'cascade' }),
		pattern: text('pattern').notNull(),
		match: text('match', { enum: ['contains', 'regex'] })
			.notNull()
			.default('contains'),
		target: text('target', { enum: ['main', 'extras'] })
			.notNull()
			.default('main'),
		priority: integer('priority').notNull().default(0),
		enabled: bool('enabled').notNull().default(true)
	},
	(t) => [index('title_rules_series_idx').on(t.seriesId)]
);

/** Site pages managed in the app: About, Disclaimer, Accessibility statement, ... */
export const pages = sqliteTable('pages', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	slug: text('slug').notNull().unique(),
	createdAt: createdAt()
});

export const pageTranslations = sqliteTable(
	'page_translations',
	{
		pageId: integer('page_id')
			.notNull()
			.references(() => pages.id, { onDelete: 'cascade' }),
		locale: text('locale').notNull(),
		title: text('title').notNull(),
		/** Markdown. Rendered and sanitised on the server. */
		body: text('body').notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [primaryKey({ columns: [t.pageId, t.locale] })]
);

/* ---------- people ---------- */

/** A user signs in with Discord, Google or both, so at least one of the two ids is set. */
export const users = sqliteTable(
	'users',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		discordId: text('discord_id').unique(),
		/** Google account id (`sub`), used by creators who claim their profile. */
		googleSub: text('google_sub').unique(),
		name: text('name').notNull(),
		avatarUrl: text('avatar_url'),
		role: text('role', { enum: ['viewer', 'editor', 'admin'] })
			.notNull()
			.default('viewer'),
		trust: integer('trust').notNull().default(0),
		/** The creator profile this user has claimed. */
		creatorId: integer('creator_id').references(() => creators.id, { onDelete: 'set null' }),
		createdAt: createdAt()
	},
	(t) => [
		index('users_creator_idx').on(t.creatorId),
		check('users_login_check', sql`${t.discordId} IS NOT NULL OR ${t.googleSub} IS NOT NULL`)
	]
);

/**
 * A creator's claim on a YouTube channel. A channel that is already on Couchcrab is verified
 * automatically; a channel that is not becomes a creator request for review.
 */
export const claims = sqliteTable(
	'claims',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		/** Null when the channel is not on Couchcrab yet. */
		creatorId: integer('creator_id').references(() => creators.id, { onDelete: 'set null' }),
		youtubeChannelId: text('youtube_channel_id').notNull(),
		status: text('status', { enum: ['verified', 'pending_review', 'rejected'] }).notNull(),
		createdAt: createdAt(),
		reviewedBy: integer('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
		reviewedAt: integer('reviewed_at', { mode: 'timestamp' })
	},
	(t) => [
		index('claims_user_idx').on(t.userId),
		index('claims_status_idx').on(t.status, t.createdAt)
	]
);

/** Server-side auth sessions. `id` is a hash of the session token, never the token itself. */
export const sessions = sqliteTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
		createdAt: createdAt()
	},
	(t) => [index('sessions_user_idx').on(t.userId)]
);

/** A YouTube channel the signed-in Google account owns, kept for the claim step. */
export type OwnedChannel = { id: string; title: string };

/**
 * The channels a Google account owns, saved for at most 15 minutes after Google sign-in so the
 * claim step survives the redirect. Bound to one session: signing out deletes it. Only channel
 * ids and titles are kept, never the Google token.
 */
export const claimChecks = sqliteTable('claim_checks', {
	sessionId: text('session_id')
		.primaryKey()
		.references(() => sessions.id, { onDelete: 'cascade' }),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	channels: text('channels', { mode: 'json' }).$type<OwnedChannel[]>().notNull(),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
	createdAt: createdAt()
});

export const suggestions = sqliteTable(
	'suggestions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		targetType: text('target_type', {
			enum: ['video', 'series', 'group', 'creator', 'channel', 'rule', 'page']
		}).notNull(),
		/** Null for a suggestion that creates something new. */
		targetId: integer('target_id'),
		kind: text('kind', { enum: ['create', 'update', 'delete'] }).notNull(),
		payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
		note: text('note'),
		isCreatorRequest: bool('is_creator_request').notNull().default(false),
		status: text('status', { enum: ['open', 'approved', 'rejected', 'withdrawn'] })
			.notNull()
			.default('open'),
		reviewedBy: integer('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
		reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
		createdAt: createdAt()
	},
	(t) => [index('suggestions_queue_idx').on(t.status, t.isCreatorRequest, t.createdAt)]
);

export const auditLog = sqliteTable(
	'audit_log',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		/** Who made the change: a person, a title rule or the sync. */
		actor: text('actor', { enum: ['user', 'rule', 'sync'] }).notNull(),
		actorUserId: integer('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
		entity: text('entity').notNull(),
		entityId: integer('entity_id').notNull(),
		before: text('before', { mode: 'json' }).$type<Record<string, unknown> | null>(),
		after: text('after', { mode: 'json' }).$type<Record<string, unknown> | null>(),
		createdAt: createdAt(),
		/** Set when this entry was reverted; points at the audit entry of the revert. */
		revertedBy: integer('reverted_by').references((): AnySQLiteColumn => auditLog.id, {
			onDelete: 'set null'
		})
	},
	(t) => [index('audit_log_entity_idx').on(t.entity, t.entityId)]
);

/* ---------- preferences and progress ---------- */

/** Global who-I-watch list. */
export const userCreators = sqliteTable(
	'user_creators',
	{
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		creatorId: integer('creator_id')
			.notNull()
			.references(() => creators.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.userId, t.creatorId] })]
);

/** Custom who-I-watch list for one series. */
export const userSeriesCreators = sqliteTable(
	'user_series_creators',
	{
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		seriesId: integer('series_id')
			.notNull()
			.references(() => series.id, { onDelete: 'cascade' }),
		creatorId: integer('creator_id')
			.notNull()
			.references(() => creators.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.userId, t.seriesId, t.creatorId] })]
);

export const progress = sqliteTable(
	'progress',
	{
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		videoId: integer('video_id')
			.notNull()
			.references(() => videos.id, { onDelete: 'cascade' }),
		seconds: integer('seconds').notNull().default(0),
		watchedAt: integer('watched_at', { mode: 'timestamp' }),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [primaryKey({ columns: [t.userId, t.videoId] })]
);

export type UserSettings = {
	theme?: 'system' | 'dark' | 'light' | 'contrast';
	textSize?: 'default' | 'large' | 'larger';
	motion?: 'system' | 'reduce';
	underlineLinks?: boolean;
	autoplay?: 'off' | 'countdown' | 'wait';
	captionsByDefault?: boolean;
	spoilerDefault?: boolean;
	shortcuts?: boolean;
	locale?: string;
};

export const userSettings = sqliteTable('user_settings', {
	userId: integer('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	settings: text('settings', { mode: 'json' }).$type<UserSettings>().notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`)
});
