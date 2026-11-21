/** Series, their participants, translations, poster, Extras child and groups. */
import { and, asc, count, eq, inArray, isNull, ne } from 'drizzle-orm';
import { isMotif, isPaletteName } from '../../poster-art.js';
import type { DB } from '../db/client.js';
import * as t from '../db/schema.js';
import {
	type Actor,
	assertRole,
	auditUser,
	Checker,
	id,
	type Input,
	integerField,
	iso,
	NotFoundError,
	oneOf,
	optionalDate,
	optionalText,
	optionalUrl,
	requiredText,
	text,
	texts,
	ValidationError
} from './core.js';
import { slugField } from './slug.js';

export const SERIES_KINDS = ['season', 'live_series', 'event', 'other'] as const;
export const SERIES_STATUSES = ['upcoming', 'ongoing', 'ended'] as const;
export const SERIES_GROUPINGS = ['week', 'session', 'none'] as const;
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 2000;
export const BASE_LOCALE = 'en';

type SeriesRow = typeof t.series.$inferSelect;
type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

export function listSeries(db: DB, actor: Actor) {
	assertRole(actor, 'editor');
	const rows = db
		.select({
			id: t.series.id,
			slug: t.series.slug,
			title: t.series.title,
			kind: t.series.kind,
			status: t.series.status,
			grouping: t.series.grouping,
			startedAt: t.series.startedAt,
			parentId: t.series.parentId
		})
		.from(t.series)
		.orderBy(asc(t.series.title))
		.all();
	const members = new Map(
		db
			.select({ seriesId: t.seriesCreators.seriesId, n: count() })
			.from(t.seriesCreators)
			.groupBy(t.seriesCreators.seriesId)
			.all()
			.map((r) => [r.seriesId, r.n])
	);
	const rules = new Map(
		db
			.select({ seriesId: t.titleRules.seriesId, n: count() })
			.from(t.titleRules)
			.groupBy(t.titleRules.seriesId)
			.all()
			.map((r) => [r.seriesId, r.n])
	);
	const titles = new Map(rows.map((r) => [r.id, r.title]));
	return rows.map((r) => ({
		...r,
		parentTitle: r.parentId ? (titles.get(r.parentId) ?? null) : null,
		creators: members.get(r.id) ?? 0,
		rules: rules.get(r.id) ?? 0
	}));
}

/** Every series as a choice for a select, Extras after their parent. */
export function seriesChoices(db: DB) {
	const rows = db
		.select({
			id: t.series.id,
			title: t.series.title,
			parentId: t.series.parentId,
			grouping: t.series.grouping
		})
		.from(t.series)
		.orderBy(asc(t.series.title))
		.all();
	const out: typeof rows = [];
	for (const main of rows.filter((r) => r.parentId === null)) {
		out.push(main, ...rows.filter((r) => r.parentId === main.id));
	}
	return out;
}

export function getSeries(db: DB, actor: Actor, seriesId: number) {
	assertRole(actor, 'editor');
	const series = db.select().from(t.series).where(eq(t.series.id, seriesId)).get();
	if (!series) throw new NotFoundError();
	const translations = db
		.select()
		.from(t.seriesTranslations)
		.where(eq(t.seriesTranslations.seriesId, seriesId))
		.all();
	const creatorIds = db
		.select({ id: t.seriesCreators.creatorId })
		.from(t.seriesCreators)
		.where(eq(t.seriesCreators.seriesId, seriesId))
		.all()
		.map((r) => r.id);
	const parent = series.parentId
		? (db
				.select({ id: t.series.id, title: t.series.title })
				.from(t.series)
				.where(eq(t.series.id, series.parentId))
				.get() ?? null)
		: null;
	const extras =
		db
			.select({ id: t.series.id, title: t.series.title })
			.from(t.series)
			.where(eq(t.series.parentId, seriesId))
			.get() ?? null;
	return { series, translations, creatorIds, parent, extras };
}

function slugTaken(db: DB | Tx, slug: string, exceptId?: number) {
	return Boolean(
		db
			.select({ id: t.series.id })
			.from(t.series)
			.where(and(eq(t.series.slug, slug), exceptId ? ne(t.series.id, exceptId) : undefined))
			.get()
	);
}

function parsePoster(c: Checker, input: Input): t.PosterSettings | null {
	const type = oneOf(c, input, 'poster_type', ['art', 'image'] as const, 'art');
	if (type === 'image') {
		const url = optionalUrl(c, input, 'poster_url');
		if (!url && !c.errors.poster_url) c.fail('poster_url', 'required');
		return url ? { type: 'image', url } : null;
	}
	const palette = text(input, 'palette') || 'meadow';
	if (!isPaletteName(palette)) c.fail('palette', 'invalid_choice');
	const motif = text(input, 'motif');
	if (motif && !isMotif(motif)) c.fail('motif', 'invalid_choice');
	const seed = integerField(c, input, 'seed', { min: 1, max: 9999, fallback: 1 });
	return { type: 'art', palette, seed, ...(motif ? { motif } : {}) };
}

function parseSeries(db: DB, input: Input, locales: readonly string[], exceptId?: number) {
	const c = new Checker();
	const title = requiredText(c, input, 'title', TITLE_MAX);
	const slug = slugField(c, input, title, (s) => slugTaken(db, s, exceptId));
	const kind = oneOf(c, input, 'kind', SERIES_KINDS);
	const status = oneOf(c, input, 'status', SERIES_STATUSES, 'ongoing');
	const grouping = oneOf(c, input, 'grouping', SERIES_GROUPINGS, 'week');
	const startedAt = optionalDate(c, input, 'started_at');
	const endedAt = optionalDate(c, input, 'ended_at');
	if (startedAt && endedAt && endedAt < startedAt) c.fail('ended_at', 'date_order');
	const descriptions: { locale: string; description: string }[] = [];
	for (const locale of locales) {
		const field = `description_${locale}`;
		const value =
			locale === BASE_LOCALE
				? requiredText(c, input, field, DESCRIPTION_MAX)
				: optionalText(c, input, field, DESCRIPTION_MAX);
		if (value) descriptions.push({ locale, description: value });
	}
	const creatorIds = [...new Set(texts(input, 'creators').map(id))].filter(
		(n): n is number => n !== null
	);
	if (creatorIds.length > 0) {
		const known = db
			.select({ id: t.creators.id })
			.from(t.creators)
			.where(inArray(t.creators.id, creatorIds))
			.all();
		if (known.length !== creatorIds.length) c.fail('creators', 'invalid_choice');
	}
	const poster = parsePoster(c, input);
	return {
		c,
		values: { title, slug, kind, status, grouping, startedAt, endedAt, poster },
		descriptions,
		creatorIds
	};
}

function snapshot(
	row: SeriesRow,
	descriptions: { locale: string; description: string }[],
	creatorIds: number[]
) {
	return {
		slug: row.slug,
		title: row.title,
		kind: row.kind,
		status: row.status,
		grouping: row.grouping,
		startedAt: iso(row.startedAt),
		endedAt: iso(row.endedAt),
		poster: row.poster,
		parentId: row.parentId,
		descriptions: Object.fromEntries(descriptions.map((d) => [d.locale, d.description])),
		creatorIds: [...creatorIds].sort((a, b) => a - b)
	};
}

function writeChildren(
	tx: Tx,
	seriesId: number,
	descriptions: { locale: string; description: string }[],
	creatorIds: number[]
) {
	tx.delete(t.seriesTranslations).where(eq(t.seriesTranslations.seriesId, seriesId)).run();
	if (descriptions.length > 0)
		tx.insert(t.seriesTranslations)
			.values(descriptions.map((d) => ({ seriesId, ...d })))
			.run();
	tx.delete(t.seriesCreators).where(eq(t.seriesCreators.seriesId, seriesId)).run();
	if (creatorIds.length > 0)
		tx.insert(t.seriesCreators)
			.values(creatorIds.map((creatorId) => ({ seriesId, creatorId })))
			.run();
}

export function createSeries(
	db: DB,
	actor: Actor,
	input: Input,
	locales: readonly string[]
): SeriesRow {
	assertRole(actor, 'editor');
	const { c, values, descriptions, creatorIds } = parseSeries(db, input, locales);
	c.done();
	return db.transaction((tx) => {
		const row = tx.insert(t.series).values(values).returning().get();
		writeChildren(tx, row.id, descriptions, creatorIds);
		auditUser(tx, actor, 'series', row.id, null, snapshot(row, descriptions, creatorIds));
		return row;
	});
}

export function updateSeries(
	db: DB,
	actor: Actor,
	seriesId: number,
	input: Input,
	locales: readonly string[]
): SeriesRow {
	assertRole(actor, 'editor');
	const current = getSeries(db, actor, seriesId);
	const { c, values, descriptions, creatorIds } = parseSeries(db, input, locales, seriesId);
	c.done();
	return db.transaction((tx) => {
		const row = tx.update(t.series).set(values).where(eq(t.series.id, seriesId)).returning().get();
		writeChildren(tx, seriesId, descriptions, creatorIds);
		auditUser(
			tx,
			actor,
			'series',
			seriesId,
			snapshot(current.series, current.translations, current.creatorIds),
			snapshot(row, descriptions, creatorIds)
		);
		return row;
	});
}

/**
 * Creates the Extras child of a main series: same kind, grouping, poster and participants, the
 * title plus " Extras" and the slug plus "-extras". A series has at most one Extras child.
 */
export function createExtras(db: DB, actor: Actor, seriesId: number): SeriesRow {
	assertRole(actor, 'editor');
	return db.transaction((tx) => {
		const parent = tx.select().from(t.series).where(eq(t.series.id, seriesId)).get();
		if (!parent) throw new NotFoundError();
		if (parent.parentId !== null) throw new ValidationError({ extras: 'is_extras' });
		if (tx.select({ id: t.series.id }).from(t.series).where(eq(t.series.parentId, seriesId)).get())
			throw new ValidationError({ extras: 'has_extras' });
		const base = `${parent.slug}-extras`;
		let slug = base;
		for (let n = 2; slugTaken(tx, slug); n++) slug = `${base}-${n}`;
		const row = tx
			.insert(t.series)
			.values({
				slug,
				title: `${parent.title} Extras`.slice(0, TITLE_MAX),
				kind: parent.kind,
				status: parent.status,
				grouping: parent.grouping,
				startedAt: parent.startedAt,
				endedAt: parent.endedAt,
				poster: parent.poster,
				parentId: parent.id
			})
			.returning()
			.get();
		const descriptions = tx
			.select({
				locale: t.seriesTranslations.locale,
				description: t.seriesTranslations.description
			})
			.from(t.seriesTranslations)
			.where(eq(t.seriesTranslations.seriesId, seriesId))
			.all();
		const creatorIds = tx
			.select({ id: t.seriesCreators.creatorId })
			.from(t.seriesCreators)
			.where(eq(t.seriesCreators.seriesId, seriesId))
			.all()
			.map((r) => r.id);
		writeChildren(tx, row.id, descriptions, creatorIds);
		auditUser(tx, actor, 'series', row.id, null, snapshot(row, descriptions, creatorIds));
		return row;
	});
}

/* ---------- groups ---------- */

type GroupRow = typeof t.groups.$inferSelect;
const groupSnapshot = (g: GroupRow) => ({
	seriesId: g.seriesId,
	kind: g.kind,
	number: g.number,
	title: g.title,
	startsAt: iso(g.startsAt),
	endsAt: iso(g.endsAt)
});

export function listGroups(db: DB, actor: Actor, seriesId: number) {
	assertRole(actor, 'editor');
	return db
		.select()
		.from(t.groups)
		.where(eq(t.groups.seriesId, seriesId))
		.orderBy(asc(t.groups.kind), asc(t.groups.number))
		.all();
}

function parseGroup(db: DB, input: Input, seriesId: number, exceptId?: number) {
	const c = new Checker();
	const kind = oneOf(c, input, 'kind', ['session', 'week'] as const);
	const number = integerField(c, input, 'number', { min: 1, max: 9999 });
	const title = optionalText(c, input, 'title', TITLE_MAX);
	const startsAt = optionalDate(c, input, 'starts_at');
	const endsAt = optionalDate(c, input, 'ends_at');
	if (!startsAt && !c.errors.starts_at) c.fail('starts_at', 'required');
	if (startsAt && endsAt && endsAt <= startsAt) c.fail('ends_at', 'date_order');
	if (c.ok) {
		const clash = db
			.select({ id: t.groups.id })
			.from(t.groups)
			.where(
				and(
					eq(t.groups.seriesId, seriesId),
					eq(t.groups.kind, kind),
					eq(t.groups.number, number),
					exceptId ? ne(t.groups.id, exceptId) : undefined
				)
			)
			.get();
		if (clash) c.fail('number', 'number_taken');
	}
	return { c, values: { kind, number, title, startsAt, endsAt } };
}

export function createGroup(db: DB, actor: Actor, seriesId: number, input: Input): GroupRow {
	assertRole(actor, 'editor');
	if (!db.select({ id: t.series.id }).from(t.series).where(eq(t.series.id, seriesId)).get())
		throw new NotFoundError();
	const { c, values } = parseGroup(db, input, seriesId);
	c.done();
	return db.transaction((tx) => {
		const row = tx
			.insert(t.groups)
			.values({ seriesId, ...values })
			.returning()
			.get();
		auditUser(tx, actor, 'group', row.id, null, groupSnapshot(row));
		return row;
	});
}

export function updateGroup(
	db: DB,
	actor: Actor,
	seriesId: number,
	groupId: number,
	input: Input
): GroupRow {
	assertRole(actor, 'editor');
	const before = db
		.select()
		.from(t.groups)
		.where(and(eq(t.groups.id, groupId), eq(t.groups.seriesId, seriesId)))
		.get();
	if (!before) throw new NotFoundError();
	const { c, values } = parseGroup(db, input, seriesId, groupId);
	c.done();
	return db.transaction((tx) => {
		const row = tx.update(t.groups).set(values).where(eq(t.groups.id, groupId)).returning().get();
		auditUser(tx, actor, 'group', groupId, groupSnapshot(before), groupSnapshot(row));
		return row;
	});
}

/** Deletes a group. Its videos stay in the series without a group. */
export function deleteGroup(db: DB, actor: Actor, seriesId: number, groupId: number): void {
	assertRole(actor, 'editor');
	db.transaction((tx) => {
		const before = tx
			.select()
			.from(t.groups)
			.where(and(eq(t.groups.id, groupId), eq(t.groups.seriesId, seriesId)))
			.get();
		if (!before) throw new NotFoundError();
		tx.delete(t.groups).where(eq(t.groups.id, groupId)).run();
		auditUser(tx, actor, 'group', groupId, groupSnapshot(before), null);
	});
}

/** Main series without an Extras child (for hints in the UI). */
export function seriesWithoutExtras(db: DB): number[] {
	const withExtras = new Set(
		db
			.select({ parentId: t.series.parentId })
			.from(t.series)
			.all()
			.map((r) => r.parentId)
	);
	return db
		.select({ id: t.series.id })
		.from(t.series)
		.where(isNull(t.series.parentId))
		.all()
		.map((r) => r.id)
		.filter((n) => !withExtras.has(n));
}
