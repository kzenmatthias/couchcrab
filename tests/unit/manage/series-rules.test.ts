import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import * as t from '#lib/server/db/schema.js';
import { ForbiddenError, ValidationError } from '#lib/server/manage/core.js';
import { applyRulesToUnsorted, createRule, parseRule, testRule } from '#lib/server/manage/rules.js';
import {
	createExtras,
	createGroup,
	createSeries,
	getSeries,
	updateSeries
} from '#lib/server/manage/series.js';
import { placeVideoByHand, setVideoStatus } from '#lib/server/manage/videos.js';
import { auditRows, creatorBySlug, lastAudit, seeded, seriesBySlug } from './fixtures.js';

const LOCALES = ['en', 'nl'] as const;
let env: ReturnType<typeof seeded>;
beforeEach(() => {
	env = seeded();
});

const errorsOf = (fn: () => unknown) => {
	try {
		fn();
	} catch (err) {
		if (err instanceof ValidationError) return err.errors;
		throw err;
	}
	throw new Error('Expected a ValidationError');
};

function newSeries(creatorSlugs: string[] = ['quillby']) {
	return createSeries(
		env.db,
		env.editor,
		{
			title: 'Mossbound',
			kind: 'season',
			grouping: 'week',
			started_at: '2026-09-01',
			description_en: 'A test season.',
			creators: creatorSlugs.map((s) => String(creatorBySlug(env.db, s).id)),
			palette: 'tide',
			motif: 'crown',
			seed: '42'
		},
		LOCALES
	);
}

const unsortedTitled = (title: string) =>
	env.db.select().from(t.videos).where(eq(t.videos.title, title)).get()!;

describe('series', () => {
	it('creates a series with participants, translations, poster and history', () => {
		const row = newSeries(['quillby', 'oakhollow']);
		expect(row).toMatchObject({
			slug: 'mossbound',
			status: 'ongoing',
			poster: { type: 'art', palette: 'tide', seed: 42, motif: 'crown' }
		});
		const detail = getSeries(env.db, env.editor, row.id);
		expect(detail.creatorIds).toHaveLength(2);
		expect(detail.translations).toEqual([
			{ seriesId: row.id, locale: 'en', description: 'A test season.' }
		]);
		expect(lastAudit(env.db)).toMatchObject({
			entity: 'series',
			entityId: row.id,
			before: null,
			after: { title: 'Mossbound', descriptions: { en: 'A test season.' } }
		});
	});

	it('requires English and checks dates and choices', () => {
		expect(
			errorsOf(() =>
				createSeries(
					env.db,
					env.editor,
					{
						title: 'X',
						kind: 'film',
						started_at: '2026-09-10',
						ended_at: '2026-09-01',
						description_nl: 'Alleen Nederlands',
						creators: ['99999'],
						palette: 'neon'
					},
					LOCALES
				)
			)
		).toEqual({
			kind: 'invalid_choice',
			ended_at: 'date_order',
			description_en: 'required',
			creators: 'invalid_choice',
			palette: 'invalid_choice'
		});
	});

	it('updates and keeps before and after in the history', () => {
		const row = newSeries();
		updateSeries(
			env.db,
			env.editor,
			row.id,
			{ title: 'Mossbound 2', slug: 'mossbound', kind: 'event', description_en: 'Changed.' },
			LOCALES
		);
		expect(lastAudit(env.db)).toMatchObject({
			before: { title: 'Mossbound', kind: 'season' },
			after: { title: 'Mossbound 2', kind: 'event', creatorIds: [] }
		});
	});

	it('creates one Extras child with the same participants', () => {
		const row = newSeries(['quillby']);
		const extras = createExtras(env.db, env.editor, row.id);
		expect(extras).toMatchObject({ slug: 'mossbound-extras', parentId: row.id, kind: 'season' });
		expect(getSeries(env.db, env.editor, extras.id).creatorIds).toEqual([
			creatorBySlug(env.db, 'quillby').id
		]);
		expect(errorsOf(() => createExtras(env.db, env.editor, row.id))).toEqual({
			extras: 'has_extras'
		});
		expect(errorsOf(() => createExtras(env.db, env.editor, extras.id))).toEqual({
			extras: 'is_extras'
		});
	});

	it('adds groups with unique numbers and a sane window', () => {
		const row = newSeries();
		createGroup(env.db, env.editor, row.id, {
			kind: 'session',
			number: '1',
			starts_at: '2026-09-01T18:00'
		});
		expect(
			errorsOf(() =>
				createGroup(env.db, env.editor, row.id, {
					kind: 'session',
					number: '1',
					starts_at: '2026-09-08T18:00',
					ends_at: '2026-09-08T17:00'
				})
			)
		).toEqual({ ends_at: 'date_order' });
		expect(
			errorsOf(() =>
				createGroup(env.db, env.editor, row.id, {
					kind: 'session',
					number: '1',
					starts_at: '2026-09-08T18:00'
				})
			)
		).toEqual({ number: 'number_taken' });
	});
});

describe('title rules', () => {
	it('validates regexes with the engine guard and Extras targets', () => {
		const row = newSeries();
		expect(
			errorsOf(() =>
				createRule(env.db, env.editor, row.id, { pattern: '(unclosed', match: 'regex' })
			)
		).toEqual({ pattern: 'invalid_regex' });
		expect(
			errorsOf(() =>
				createRule(env.db, env.editor, row.id, { pattern: 'x'.repeat(201), match: 'contains' })
			)
		).toEqual({ pattern: 'pattern_too_long' });
		expect(
			errorsOf(() => createRule(env.db, env.editor, row.id, { pattern: 'live', target: 'extras' }))
		).toEqual({ target: 'no_extras' });
		const other = creatorBySlug(env.db, 'pebblewick');
		const otherChannel = env.db
			.select()
			.from(t.channels)
			.where(eq(t.channels.creatorId, other.id))
			.get()!;
		expect(
			parseRule(env.db, row.id, { pattern: 'x', channel_id: String(otherChannel.id) }).c.errors
		).toEqual({
			channel_id: 'invalid_choice'
		});
	});

	it('tests a rule against recent uploads without writing', () => {
		const row = newSeries(['quillby']);
		const before = auditRows(env.db).length;
		const result = testRule(env.db, env.editor, row.id, { pattern: 'texture', match: 'contains' });
		expect(result.matches.map((m) => m.title)).toEqual(['My new texture pack']);
		expect(result.matches[0]).toMatchObject({
			seriesId: row.id,
			target: 'main',
			status: 'unsorted'
		});
		expect(auditRows(env.db)).toHaveLength(before);
		expect(unsortedTitled('My new texture pack').status).toBe('unsorted');
	});

	it('applies rules to Unsorted: a dry run first, then for real with actor rule', () => {
		const row = newSeries(['quillby']);
		const rule = createRule(env.db, env.editor, row.id, {
			pattern: '^my new',
			match: 'regex',
			enabled: '1'
		});
		const before = auditRows(env.db).length;
		const dry = applyRulesToUnsorted(env.db, env.editor, { dryRun: true });
		expect(dry.checked).toBe(6);
		expect(dry.placed).toMatchObject([
			{ title: 'My new texture pack', seriesId: row.id, ruleId: rule.id }
		]);
		expect(auditRows(env.db)).toHaveLength(before);
		expect(unsortedTitled('My new texture pack').status).toBe('unsorted');

		const real = applyRulesToUnsorted(env.db, env.editor, { dryRun: false });
		expect(real.placed).toHaveLength(1);
		const video = unsortedTitled('My new texture pack');
		expect(video).toMatchObject({ status: 'placed', placedBy: 'rule', seriesId: row.id });
		expect(lastAudit(env.db)).toMatchObject({
			actor: 'rule',
			actorUserId: env.editor.id,
			entity: 'video',
			entityId: video.id,
			before: { status: 'unsorted' },
			after: { status: 'placed', ruleId: rule.id }
		});
		expect(applyRulesToUnsorted(env.db, env.editor, { dryRun: true }).placed).toHaveLength(0);
	});

	it('is for editors only', () => {
		expect(() => applyRulesToUnsorted(env.db, env.viewer, { dryRun: true })).toThrow(
			ForbiddenError
		);
	});
});

describe('the Unsorted queue', () => {
	it('places a video by hand with placed_by user', () => {
		const season = seriesBySlug(env.db, 'lanternfall-season-3');
		const video = unsortedTitled('Answering your questions');
		placeVideoByHand(env.db, env.editor, video.id, { series_id: String(season.id) });
		expect(unsortedTitled('Answering your questions')).toMatchObject({
			status: 'placed',
			placedBy: 'user',
			seriesId: season.id
		});
		expect(lastAudit(env.db)).toMatchObject({
			actor: 'user',
			entity: 'video',
			before: { status: 'unsorted', seriesId: null },
			after: { status: 'placed', placedBy: 'user', seriesId: season.id }
		});
	});

	it('refuses a group from another series', () => {
		const live = seriesBySlug(env.db, 'ember-hearts');
		const season = seriesBySlug(env.db, 'lanternfall-season-3');
		const group = env.db
			.select()
			.from(t.groups)
			.where(and(eq(t.groups.seriesId, live.id)))
			.get()!;
		const video = unsortedTitled('Answering your questions');
		expect(
			errorsOf(() =>
				placeVideoByHand(env.db, env.editor, video.id, {
					series_id: String(season.id),
					group_id: String(group.id)
				})
			)
		).toEqual({ group_id: 'group_mismatch' });
	});

	it('ignores a video and brings it back', () => {
		const video = unsortedTitled('Answering your questions');
		setVideoStatus(env.db, env.editor, video.id, 'ignored');
		expect(unsortedTitled('Answering your questions').status).toBe('ignored');
		setVideoStatus(env.db, env.editor, video.id, 'unsorted');
		expect(unsortedTitled('Answering your questions')).toMatchObject({
			status: 'unsorted',
			seriesId: null
		});
	});
});
