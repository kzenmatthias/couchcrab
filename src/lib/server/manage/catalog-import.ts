/**
 * The catalog import: a one-off load of creators, channels, series, sessions and title rules from
 * a JSON file (`npm run catalog:import`). After the import the management tool is the source of
 * truth; running the import again only adds what is missing and updates the fields the file sets.
 *
 * - Creators match by slug, then by one of their channels; channels by YouTube channel id;
 *   series by slug; sessions by number; rules by pattern, match and channel.
 * - Nothing that is not in the file is deleted. Claimed creators keep their profile (only new
 *   channels are added); opted-out creators are not touched at all.
 * - Every write goes through the management service layer, so validation and the history work
 *   as for an edit in the app. History entries have the actor `sync`.
 * - `parseCatalog` checks the whole file first and returns every problem; `importCatalog` writes
 *   everything in one transaction and rolls it back when anything fails.
 */
import { and, asc, eq, isNull } from 'drizzle-orm';
import { TransactionRollbackError } from 'drizzle-orm/errors';
import { PROFILE_COLORS } from '../../creator-colors.js';
import { isMotif, isPaletteName, PALETTES } from '../../poster-art.js';
import { SLUG_MAX, SLUG_RE } from '../../slug.js';
import type { DB } from '../db/client.js';
import * as t from '../db/schema.js';
import { compileRulePattern, MAX_PATTERN_LENGTH } from '../youtube/rules.js';
import { type Actor, type Input, ValidationError } from './core.js';
import {
	addChannel,
	BIO_MAX,
	CHANNEL_ID_RE,
	createCreator,
	NAME_MAX,
	updateChannel,
	updateCreator
} from './creators.js';
import { createRule, updateRule } from './rules.js';
import {
	BASE_LOCALE,
	createExtras,
	createGroup,
	createSeries,
	DESCRIPTION_MAX,
	SERIES_GROUPINGS,
	SERIES_KINDS,
	SERIES_STATUSES,
	TITLE_MAX,
	updateGroup,
	updateSeries
} from './series.js';

/** The import acts as an editor, so it never changes what only admins may (opt-out, claimed fields). */
export const IMPORT_ACTOR: Actor = { id: 0, role: 'editor', system: 'sync' };

/* ---------- file format ---------- */

export interface CatalogChannel {
	youtubeChannelId: string;
	/** Null: the creator's name for a new channel, unchanged for a known one. */
	title: string | null;
	kind: 'main' | 'secondary';
}

export interface CatalogCreator {
	slug: string;
	name: string;
	/** Null: a colour derived from the slug for a new creator, unchanged for a known one. */
	color: string | null;
	channels: CatalogChannel[];
}

export interface CatalogSession {
	number: number;
	startsAt: string;
	title: string | null;
}

export interface CatalogRule {
	pattern: string;
	match: 'contains' | 'regex';
	target: 'main' | 'extras';
	/** A creator slug: the rule only applies to that creator's main channel. Null: all channels. */
	channel: string | null;
	priority: number;
	/** Null: on for a new rule, unchanged for a known one. */
	enabled: boolean | null;
}

export type CatalogPoster =
	| { type: 'art'; palette: string; seed: number; motif?: string }
	| {
			type: 'image';
			url: string;
	  };

export interface CatalogSeries {
	slug: string;
	title: string;
	kind: (typeof SERIES_KINDS)[number];
	status: (typeof SERIES_STATUSES)[number];
	grouping: (typeof SERIES_GROUPINGS)[number];
	startedAt: string | null;
	endedAt: string | null;
	creators: string[];
	/** Locale to description. A locale missing here keeps its stored description. */
	descriptions: Record<string, string>;
	extras: boolean;
	sessions: CatalogSession[];
	rules: CatalogRule[];
	/** Null: generated art chosen from the slug for a new series, unchanged for a known one. */
	poster: CatalogPoster | null;
}

export interface Catalog {
	creators: CatalogCreator[];
	series: CatalogSeries[];
}

/* ---------- stable choices from a slug ---------- */

/** FNV-1a, 32 bit: a small stable hash for picking colours and palettes. */
function hash(value: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < value.length; i++) {
		h ^= value.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h;
}

/** A profile colour (readable initials, see `creator-colors.ts`) chosen stably from the slug. */
export function colorForSlug(slug: string): string {
	return PROFILE_COLORS[hash(slug) % PROFILE_COLORS.length].hex;
}

/** Generated poster art with a palette and seed chosen stably from the slug. */
export function posterForSlug(slug: string): { type: 'art'; palette: string; seed: number } {
	const names = Object.keys(PALETTES);
	return {
		type: 'art',
		palette: names[hash(slug) % names.length],
		seed: 1 + (hash(`${slug}:seed`) % 9999)
	};
}

/* ---------- validation of the file ---------- */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;

const isObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const validDate = (v: string) =>
	DATE_RE.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());

const toDate = (v: string | null) => (v ? new Date(`${v}T00:00:00Z`) : null);

export type ParseResult = { ok: true; catalog: Catalog } | { ok: false; problems: string[] };

/**
 * Checks the whole file and returns either the catalog or every problem found, each with its
 * place in the file (`series[2] hermitcraft-10: rules[0].pattern: ...`).
 */
export function parseCatalog(raw: unknown, locales: readonly string[]): ParseResult {
	const problems: string[] = [];
	if (!isObject(raw)) return { ok: false, problems: ['The file must be a JSON object.'] };

	/** Field readers that record a problem and return a fallback. */
	const reader = (where: string, obj: Record<string, unknown>) => {
		const fail = (field: string, msg: string) => problems.push(`${where}${field}: ${msg}`);
		return {
			fail,
			str(field: string, max: number, opts: { optional?: boolean } = {}): string | null {
				const v = obj[field];
				if (v === undefined || v === null) {
					if (!opts.optional) fail(field, 'required');
					return null;
				}
				if (typeof v !== 'string') return (fail(field, 'must be a string'), null);
				const s = v.trim();
				if (!s) {
					if (!opts.optional) fail(field, 'required');
					return null;
				}
				if (s.length > max) return (fail(field, `longer than ${max} characters`), null);
				return s;
			},
			choice<T extends string>(field: string, options: readonly T[], fallback?: T): T {
				const v = obj[field];
				if ((v === undefined || v === null) && fallback !== undefined) return fallback;
				if (typeof v === 'string' && (options as readonly string[]).includes(v)) return v as T;
				fail(field, `must be one of ${options.join(', ')}`);
				return options[0];
			},
			date(field: string): string | null {
				const v = obj[field];
				if (v === undefined || v === null || v === '') return null;
				if (typeof v !== 'string' || !validDate(v))
					return (fail(field, 'must be YYYY-MM-DD'), null);
				return v;
			},
			int(field: string, min: number, max: number, fallback?: number): number {
				const v = obj[field];
				if ((v === undefined || v === null) && fallback !== undefined) return fallback;
				if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
					fail(field, `must be a whole number from ${min} to ${max}`);
					return fallback ?? min;
				}
				return v;
			},
			bool(field: string): boolean | null {
				const v = obj[field];
				if (v === undefined || v === null) return null;
				if (typeof v !== 'boolean') return (fail(field, 'must be true or false'), null);
				return v;
			},
			list(field: string): unknown[] {
				const v = obj[field];
				if (v === undefined || v === null) return [];
				if (!Array.isArray(v)) return (fail(field, 'must be a list'), []);
				return v;
			},
			slug(field: string): string {
				const s = this.str(field, SLUG_MAX);
				if (s !== null && !SLUG_RE.test(s)) {
					fail(field, 'must be lowercase letters and digits joined by dashes');
				}
				return s ?? '';
			}
		};
	};

	const top = reader('', raw);
	for (const key of Object.keys(raw)) {
		if (key !== 'creators' && key !== 'series') top.fail(key, 'unknown field');
	}

	/* creators */
	const creators: CatalogCreator[] = [];
	const creatorSlugs = new Set<string>();
	const channelIds = new Map<string, string>();
	top.list('creators').forEach((item, i) => {
		const base = `creators[${i}]`;
		if (!isObject(item)) return problems.push(`${base}: must be an object`);
		const label = typeof item.slug === 'string' ? `${base} ${item.slug}: ` : `${base}: `;
		const r = reader(label, item);
		const slug = r.slug('slug');
		if (slug && creatorSlugs.has(slug)) r.fail('slug', 'used twice in the file');
		creatorSlugs.add(slug);
		const name = r.str('name', NAME_MAX) ?? '';
		const color = r.str('color', 7, { optional: true });
		if (color !== null && !HEX_RE.test(color)) r.fail('color', 'must be a hex colour like #2ec4b6');
		const channels: CatalogChannel[] = [];
		r.list('channels').forEach((ch, j) => {
			const where = `${label}channels[${j}]`;
			if (!isObject(ch)) return problems.push(`${where}: must be an object`);
			const cr = reader(`${where}.`, ch);
			const youtubeChannelId = cr.str('youtubeChannelId', 24) ?? '';
			if (youtubeChannelId && !CHANNEL_ID_RE.test(youtubeChannelId))
				cr.fail('youtubeChannelId', 'must be a channel id (UC followed by 22 characters)');
			const other = channelIds.get(youtubeChannelId);
			if (youtubeChannelId && other !== undefined)
				cr.fail('youtubeChannelId', `also listed for creator ${other}`);
			channelIds.set(youtubeChannelId, slug);
			channels.push({
				youtubeChannelId,
				title: cr.str('title', 120, { optional: true }),
				kind: cr.choice('kind', ['main', 'secondary'] as const, 'main')
			});
		});
		creators.push({ slug, name, color: color?.toLowerCase() ?? null, channels });
	});

	/* series */
	const series: CatalogSeries[] = [];
	const seriesSlugs = new Set<string>();
	top.list('series').forEach((item, i) => {
		const base = `series[${i}]`;
		if (!isObject(item)) return problems.push(`${base}: must be an object`);
		const label = typeof item.slug === 'string' ? `${base} ${item.slug}: ` : `${base}: `;
		const r = reader(label, item);
		const slug = r.slug('slug');
		if (slug && seriesSlugs.has(slug)) r.fail('slug', 'used twice in the file');
		seriesSlugs.add(slug);
		const title = r.str('title', TITLE_MAX) ?? '';
		const kind = r.choice('kind', SERIES_KINDS);
		const status = r.choice('status', SERIES_STATUSES, 'ongoing');
		const grouping = r.choice('grouping', SERIES_GROUPINGS, 'week');
		const startedAt = r.date('startedAt');
		const endedAt = r.date('endedAt');
		if (startedAt && endedAt && endedAt < startedAt) r.fail('endedAt', 'is before startedAt');

		const descriptions: Record<string, string> = {};
		for (const key of Object.keys(item)) {
			const m = /^description_(.+)$/.exec(key);
			if (!m) continue;
			if (!locales.includes(m[1])) {
				r.fail(key, `unknown locale (known: ${locales.join(', ')})`);
				continue;
			}
			const value = r.str(key, DESCRIPTION_MAX, { optional: m[1] !== BASE_LOCALE });
			if (value) descriptions[m[1]] = value;
		}
		if (!(`description_${BASE_LOCALE}` in item)) r.fail(`description_${BASE_LOCALE}`, 'required');

		const members: string[] = [];
		r.list('creators').forEach((v, j) => {
			if (typeof v !== 'string' || !v.trim()) return r.fail(`creators[${j}]`, 'must be a slug');
			if (!members.includes(v.trim())) members.push(v.trim());
		});

		const extras = r.bool('extras') ?? false;

		const sessions: CatalogSession[] = [];
		r.list('sessions').forEach((s, j) => {
			const where = `${label}sessions[${j}]`;
			if (!isObject(s)) return problems.push(`${where}: must be an object`);
			const sr = reader(`${where}.`, s);
			const number = sr.int('number', 1, 9999);
			if (sessions.some((x) => x.number === number)) sr.fail('number', 'used twice');
			const startsAt = sr.date('startsAt');
			if (!startsAt && s.startsAt == null) sr.fail('startsAt', 'required');
			sessions.push({
				number,
				startsAt: startsAt ?? '',
				title: sr.str('title', TITLE_MAX, { optional: true })
			});
		});
		if (sessions.length > 0 && grouping !== 'session')
			r.fail('sessions', 'only for a series with grouping "session"');
		const ordered = [...sessions].sort((a, b) => a.number - b.number);
		for (let k = 1; k < ordered.length; k++) {
			if (ordered[k].startsAt && ordered[k].startsAt <= ordered[k - 1].startsAt)
				r.fail(
					`sessions`,
					`session ${ordered[k].number} must start after session ${ordered[k - 1].number}`
				);
		}

		const rules: CatalogRule[] = [];
		r.list('rules').forEach((rule, j) => {
			const where = `${label}rules[${j}]`;
			if (!isObject(rule)) return problems.push(`${where}: must be an object`);
			const rr = reader(`${where}.`, rule);
			const match = rr.choice('match', ['contains', 'regex'] as const, 'contains');
			const pattern = typeof rule.pattern === 'string' ? rule.pattern.trim() : '';
			if (!pattern) rr.fail('pattern', 'required');
			else if (pattern.length > MAX_PATTERN_LENGTH)
				rr.fail('pattern', `longer than ${MAX_PATTERN_LENGTH} characters`);
			else if (match === 'regex' && compileRulePattern(pattern) === null)
				rr.fail('pattern', 'not a valid regular expression');
			const target = rr.choice('target', ['main', 'extras'] as const, 'main');
			if (target === 'extras' && !extras)
				rr.fail('target', 'targets Extras, so the series needs "extras": true');
			const channel = rr.str('channel', SLUG_MAX, { optional: true });
			if (channel && !members.includes(channel))
				rr.fail('channel', `creator ${channel} is not in this series' creators`);
			const priority = rr.int('priority', -1000, 1000, 0);
			const enabled = rr.bool('enabled');
			if (rules.some((x) => x.pattern === pattern && x.match === match && x.channel === channel))
				rr.fail('pattern', 'the same rule is listed twice');
			rules.push({ pattern, match, target, channel, priority, enabled });
		});

		let poster: CatalogPoster | null = null;
		const rawPoster = item.poster;
		if (rawPoster !== undefined && rawPoster !== null) {
			if (!isObject(rawPoster)) r.fail('poster', 'must be an object');
			else if (typeof rawPoster.url === 'string') {
				try {
					const url = new URL(rawPoster.url);
					if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
					poster = { type: 'image', url: url.toString() };
				} catch {
					r.fail('poster.url', 'must be an http(s) URL');
				}
			} else {
				const pr = reader(`${label}poster.`, rawPoster);
				const palette = pr.str('palette', 40) ?? '';
				if (palette && !isPaletteName(palette))
					pr.fail('palette', `must be one of ${Object.keys(PALETTES).join(', ')}`);
				const seed = pr.int('seed', 1, 9999, 1);
				const motif = pr.str('motif', 40, { optional: true });
				if (motif && !isMotif(motif)) pr.fail('motif', 'unknown motif');
				poster = { type: 'art', palette, seed, ...(motif ? { motif } : {}) };
			}
		}

		series.push({
			slug,
			title,
			kind,
			status,
			grouping,
			startedAt,
			endedAt,
			creators: members,
			descriptions,
			extras,
			sessions,
			rules,
			poster
		});
	});

	return problems.length > 0
		? { ok: false, problems }
		: { ok: true, catalog: { creators, series } };
}

/* ---------- import ---------- */

export type Kind = 'creators' | 'channels' | 'series' | 'extras' | 'sessions' | 'rules';
export const KINDS: readonly Kind[] = [
	'creators',
	'channels',
	'series',
	'extras',
	'sessions',
	'rules'
];
export interface Counts {
	created: number;
	updated: number;
	unchanged: number;
	/** Left alone on purpose: a claimed or opted-out creator. */
	skipped: number;
}

export interface ImportSummary {
	dryRun: boolean;
	/** Empty when the import was written (or, in a dry run, would be). */
	problems: string[];
	counts: Record<Kind, Counts>;
	/** Things worth knowing that are not problems (a claimed creator kept their profile, ...). */
	notes: string[];
}

export interface ImportOptions {
	locales: readonly string[];
	dryRun?: boolean;
	actor?: Actor;
}

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
type CreatorRow = typeof t.creators.$inferSelect;

/** Field errors from the service layer as readable lines. */
function describeError(where: string, error: unknown): string[] {
	if (error instanceof ValidationError)
		return Object.entries(error.errors).map(([field, code]) => `${where}${field}: ${code}`);
	return [`${where}${error instanceof Error ? error.message : String(error)}`];
}

const sameDate = (a: Date | null, b: Date | null) =>
	(a?.getTime() ?? null) === (b?.getTime() ?? null);
const dateText = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

function posterInput(poster: t.PosterSettings): Input {
	return poster.type === 'image'
		? { poster_type: 'image', poster_url: poster.url }
		: {
				poster_type: 'art',
				palette: poster.palette,
				seed: String(poster.seed),
				motif: poster.motif ?? ''
			};
}

/**
 * Writes the catalog in one transaction. When anything fails (a problem the file check could not
 * see, such as a slug taken by another kind of row), nothing is written and every problem is
 * returned. A dry run does the same writes and rolls them back.
 */
export function importCatalog(db: DB, catalog: Catalog, options: ImportOptions): ImportSummary {
	const actor = options.actor ?? IMPORT_ACTOR;
	const dryRun = options.dryRun ?? false;
	const summary: ImportSummary = {
		dryRun,
		problems: [],
		notes: [],
		counts: Object.fromEntries(
			KINDS.map((k) => [k, { created: 0, updated: 0, unchanged: 0, skipped: 0 }])
		) as Record<Kind, Counts>
	};

	class Rollback extends Error {}
	try {
		db.transaction((tx) => {
			writeCatalog(tx, actor, catalog, options.locales, summary);
			if (dryRun || summary.problems.length > 0) throw new Rollback();
		});
	} catch (error) {
		if (!(error instanceof Rollback || error instanceof TransactionRollbackError)) throw error;
	}
	return summary;
}

function writeCatalog(
	tx: Tx,
	actor: Actor,
	catalog: Catalog,
	locales: readonly string[],
	summary: ImportSummary
) {
	// The service layer opens its own transactions; inside this one they become savepoints.
	const db = tx as unknown as DB;
	const { counts, notes, problems } = summary;
	/** Runs one service call; a failure is recorded and only its savepoint is rolled back. */
	const attempt = <T>(where: string, fn: () => T): T | undefined => {
		try {
			return fn();
		} catch (error) {
			problems.push(...describeError(where, error));
			return undefined;
		}
	};

	const creatorIds = new Map<string, number>();
	const creatorRow = (creatorId: number) =>
		tx.select().from(t.creators).where(eq(t.creators.id, creatorId)).get()!;

	/* creators and channels */
	catalog.creators.forEach((file, i) => {
		const where = `creators[${i}] ${file.slug}: `;
		let existing: CreatorRow | undefined = tx
			.select()
			.from(t.creators)
			.where(eq(t.creators.slug, file.slug))
			.get();
		const knownChannels = file.channels
			.map((ch) =>
				tx
					.select()
					.from(t.channels)
					.where(eq(t.channels.youtubeChannelId, ch.youtubeChannelId))
					.get()
			)
			.filter((ch) => ch !== undefined);
		const owners = new Set(knownChannels.map((ch) => ch.creatorId));
		if (!existing && owners.size === 1) {
			// Known under another slug: the channel decides. The slug in the app stays.
			existing = creatorRow([...owners][0]);
			notes.push(`Creator ${file.slug} matched ${existing.slug} by channel; its slug is kept.`);
		}
		const foreign = knownChannels.filter((ch) => ch.creatorId !== existing?.id);
		if (foreign.length > 0) {
			for (const ch of foreign)
				problems.push(
					`${where}channels: ${ch.youtubeChannelId} belongs to creator ${creatorRow(ch.creatorId).slug}`
				);
			return;
		}

		let creator: CreatorRow | undefined = existing;
		if (!existing) {
			creator = attempt(where, () =>
				createCreator(db, actor, {
					name: file.name,
					slug: file.slug,
					color: file.color ?? colorForSlug(file.slug)
				})
			);
			if (creator) counts.creators.created++;
		} else if (existing.optedOut) {
			counts.creators.skipped++;
			notes.push(`Creator ${existing.slug} opted out: left as it is, no channels added.`);
			creatorIds.set(file.slug, existing.id);
			return;
		} else if (existing.claimedAt) {
			counts.creators.skipped++;
			notes.push(`Creator ${existing.slug} is claimed: profile kept, only new channels added.`);
		} else {
			const color = file.color ?? existing.color;
			if (file.name !== existing.name || color !== existing.color) {
				creator = attempt(where, () =>
					updateCreator(db, actor, existing.id, {
						name: file.name,
						slug: existing.slug,
						color,
						avatar_url: existing.avatarUrl ?? '',
						bio: existing.bio?.slice(0, BIO_MAX) ?? ''
					})
				);
				if (creator) counts.creators.updated++;
			} else counts.creators.unchanged++;
		}
		if (!creator) return;
		creatorIds.set(file.slug, creator.id);

		file.channels.forEach((ch, j) => {
			const at = `${where}channels[${j}].`;
			const known = knownChannels.find((k) => k.youtubeChannelId === ch.youtubeChannelId);
			if (!known) {
				const row = attempt(at, () =>
					addChannel(db, actor, creator.id, {
						youtube_channel_id: ch.youtubeChannelId,
						title: ch.title ?? '',
						kind: ch.kind
					})
				);
				if (row) counts.channels.created++;
				return;
			}
			if (creator.claimedAt) {
				counts.channels.skipped++;
				return;
			}
			const title = ch.title ?? known.title;
			if (title === known.title && ch.kind === known.kind) {
				counts.channels.unchanged++;
				return;
			}
			const row = attempt(at, () =>
				updateChannel(db, actor, known.id, {
					title,
					kind: ch.kind,
					sync_enabled: known.syncEnabled ? 'on' : ''
				})
			);
			if (row) counts.channels.updated++;
		});
	});

	/** A creator slug from the file or already in the database. */
	const creatorId = (slug: string) => {
		if (!creatorIds.has(slug)) {
			const row = tx
				.select({ id: t.creators.id })
				.from(t.creators)
				.where(eq(t.creators.slug, slug))
				.get();
			if (row) creatorIds.set(slug, row.id);
		}
		return creatorIds.get(slug);
	};

	/* series */
	catalog.series.forEach((file, i) => {
		const where = `series[${i}] ${file.slug}: `;
		const memberIds: number[] = [];
		for (const slug of file.creators) {
			const id = creatorId(slug);
			if (id === undefined) problems.push(`${where}creators: unknown creator ${slug}`);
			else memberIds.push(id);
		}
		if (memberIds.length !== file.creators.length) return;

		const existing = tx.select().from(t.series).where(eq(t.series.slug, file.slug)).get();
		if (existing?.parentId != null) {
			problems.push(`${where}slug: ${file.slug} is an Extras series`);
			return;
		}

		const storedDescriptions = existing
			? Object.fromEntries(
					tx
						.select()
						.from(t.seriesTranslations)
						.where(eq(t.seriesTranslations.seriesId, existing.id))
						.all()
						.map((d) => [d.locale, d.description])
				)
			: {};
		const descriptions: Record<string, string> = { ...storedDescriptions, ...file.descriptions };
		const storedMembers = existing
			? tx
					.select({ id: t.seriesCreators.creatorId })
					.from(t.seriesCreators)
					.where(eq(t.seriesCreators.seriesId, existing.id))
					.all()
					.map((r) => r.id)
			: [];
		// Participants added in the app stay.
		const members = [...new Set([...storedMembers, ...memberIds])];
		const poster: t.PosterSettings = file.poster ?? existing?.poster ?? posterForSlug(file.slug);

		const input: Input = {
			title: file.title,
			slug: file.slug,
			kind: file.kind,
			status: file.status,
			grouping: file.grouping,
			started_at: file.startedAt ?? '',
			ended_at: file.endedAt ?? '',
			creators: members.map(String),
			...Object.fromEntries(Object.entries(descriptions).map(([l, d]) => [`description_${l}`, d])),
			...posterInput(poster)
		};

		let row: typeof t.series.$inferSelect | undefined = existing;
		if (!existing) {
			row = attempt(where, () => createSeries(db, actor, input, locales));
			if (row) counts.series.created++;
		} else {
			const changed =
				existing.title !== file.title ||
				existing.kind !== file.kind ||
				existing.status !== file.status ||
				existing.grouping !== file.grouping ||
				!sameDate(existing.startedAt, toDate(file.startedAt)) ||
				!sameDate(existing.endedAt, toDate(file.endedAt)) ||
				JSON.stringify(existing.poster) !== JSON.stringify(poster) ||
				members.length !== storedMembers.length ||
				Object.keys(descriptions).some((l) => descriptions[l] !== storedDescriptions[l]);
			if (changed) {
				row = attempt(where, () => updateSeries(db, actor, existing.id, input, locales));
				if (row) counts.series.updated++;
			} else counts.series.unchanged++;
		}
		if (!row) return;
		const seriesId = row.id;

		/* Extras child */
		let extras = tx.select().from(t.series).where(eq(t.series.parentId, seriesId)).get();
		if (file.extras) {
			if (extras) counts.extras.unchanged++;
			else {
				extras = attempt(`${where}extras: `, () => createExtras(db, actor, seriesId));
				if (extras) counts.extras.created++;
			}
		}

		/* sessions, also in an Extras child grouped by session (where the livestreams go) */
		if (file.sessions.length > 0) {
			writeSessions(seriesId, file, `${where}sessions: `);
			if (extras && extras.grouping === 'session')
				writeSessions(extras.id, file, `${where}sessions (Extras): `);
		}

		/* rules */
		file.rules.forEach((rule, j) => {
			const at = `${where}rules[${j}].`;
			let channelId: number | null = null;
			if (rule.channel) {
				const owner = creatorId(rule.channel)!;
				const main = tx
					.select({ id: t.channels.id })
					.from(t.channels)
					.where(and(eq(t.channels.creatorId, owner), eq(t.channels.kind, 'main')))
					.orderBy(asc(t.channels.id))
					.get();
				if (!main) {
					problems.push(`${at}channel: creator ${rule.channel} has no main channel`);
					return;
				}
				channelId = main.id;
			}
			const known = tx
				.select()
				.from(t.titleRules)
				.where(
					and(
						eq(t.titleRules.seriesId, seriesId),
						eq(t.titleRules.pattern, rule.pattern),
						eq(t.titleRules.match, rule.match),
						channelId === null
							? isNull(t.titleRules.channelId)
							: eq(t.titleRules.channelId, channelId)
					)
				)
				.get();
			const enabled = rule.enabled ?? known?.enabled ?? true;
			const ruleInput: Input = {
				pattern: rule.pattern,
				match: rule.match,
				target: rule.target,
				channel_id: channelId === null ? '' : String(channelId),
				priority: String(rule.priority),
				enabled: enabled ? 'on' : ''
			};
			if (!known) {
				if (attempt(at, () => createRule(db, actor, seriesId, ruleInput))) counts.rules.created++;
			} else if (
				known.target !== rule.target ||
				known.priority !== rule.priority ||
				known.enabled !== enabled
			) {
				if (attempt(at, () => updateRule(db, actor, seriesId, known.id, ruleInput)))
					counts.rules.updated++;
			} else counts.rules.unchanged++;
		});
	});

	/**
	 * Session groups: each ends where the next one starts (also counting sessions made in the
	 * app); the last is open-ended, or ends at the series' end once it has ended.
	 */
	function writeSessions(seriesId: number, file: CatalogSeries, where: string) {
		const stored = tx
			.select()
			.from(t.groups)
			.where(and(eq(t.groups.seriesId, seriesId), eq(t.groups.kind, 'session')))
			.all();
		const starts = new Map<number, Date | null>(stored.map((g) => [g.number, g.startsAt]));
		for (const s of file.sessions) starts.set(s.number, toDate(s.startsAt));
		const numbers = [...starts.keys()].sort((a, b) => a - b);
		const seriesEnd = file.status === 'ended' ? toDate(file.endedAt) : null;

		for (const s of file.sessions) {
			const startsAt = toDate(s.startsAt)!;
			const next = numbers.find((n) => n > s.number);
			const endsAt = next !== undefined ? (starts.get(next) ?? null) : seriesEnd;
			const known = stored.find((g) => g.number === s.number);
			const title = s.title ?? known?.title ?? null;
			const groupInput: Input = {
				kind: 'session',
				number: String(s.number),
				title: title ?? '',
				starts_at: dateText(startsAt),
				ends_at: endsAt && endsAt > startsAt ? dateText(endsAt) : ''
			};
			const at = `${where}session ${s.number}: `;
			if (!known) {
				if (attempt(at, () => createGroup(db, actor, seriesId, groupInput)))
					counts.sessions.created++;
				continue;
			}
			const wantedEnd = endsAt && endsAt > startsAt ? endsAt : null;
			if (
				sameDate(known.startsAt, startsAt) &&
				sameDate(known.endsAt, wantedEnd) &&
				(known.title ?? null) === title
			) {
				counts.sessions.unchanged++;
				continue;
			}
			if (attempt(at, () => updateGroup(db, actor, seriesId, known.id, groupInput)))
				counts.sessions.updated++;
		}
	}
}

/** The summary as a plain-text table for the CLI. */
export function formatImportSummary(summary: ImportSummary): string {
	const out: string[] = [];
	if (summary.problems.length > 0) {
		out.push(
			[
				`Catalog import failed: nothing was written. ${summary.problems.length} problem(s):`,
				...summary.problems.map((p) => `  ${p}`)
			].join('\n')
		);
		return out.join('\n\n');
	}
	const headers = ['Catalog import', 'Created', 'Updated', 'Unchanged', 'Skipped'];
	const rows = KINDS.map((k) => [
		k,
		String(summary.counts[k].created),
		String(summary.counts[k].updated),
		String(summary.counts[k].unchanged),
		String(summary.counts[k].skipped)
	]);
	const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
	const line = (cells: string[]) =>
		cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');
	out.push([line(headers), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n'));
	if (summary.notes.length > 0)
		out.push(['Notes:', ...summary.notes.map((n) => `  ${n}`)].join('\n'));
	return out.join('\n\n');
}
