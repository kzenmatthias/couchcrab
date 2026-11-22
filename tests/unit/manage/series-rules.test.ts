import { MAX_PATTERN_LENGTH } from '#lib/server/youtube/rules.js';
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
	posterVideoChoices,
	updateSeries
} from '#lib/server/manage/series.js';
import { posterInput } from '#lib/poster.js';
import { seriesValues } from '../../../src/routes/manage/series/helpers.js';
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
			poster_type: 'image',
			poster_url: 'https://example.com/mossbound.jpg'
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
			poster: { type: 'image', url: 'https://example.com/mossbound.jpg' }
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
						poster_type: 'neon'
					},
					LOCALES
				)
			)
		).toEqual({
			kind: 'invalid_choice',
			ended_at: 'date_order',
			description_en: 'required',
			creators: 'invalid_choice',
			poster_type: 'invalid_choice'
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

describe('series posters', () => {
	const season = () => seriesBySlug(env.db, 'lanternfall-season-3');
	const placedIn = (seriesId: number) =>
		env.db
			.select()
			.from(t.videos)
			.where(and(eq(t.videos.seriesId, seriesId), eq(t.videos.status, 'placed')))
			.all();
	/** The form as it is for the series, with other poster fields. */
	const save = (seriesId: number, poster: Record<string, string>) => {
		const d = getSeries(env.db, env.editor, seriesId);
		return updateSeries(
			env.db,
			env.editor,
			seriesId,
			{ ...seriesValues(d.series, d.translations, d.creatorIds), ...poster },
			LOCALES
		);
	};

	it('lists the episodes of the series family, oldest first, without Shorts', () => {
		const choices = posterVideoChoices(env.db, env.editor, season().id);
		expect(choices.length).toBeGreaterThan(1);
		const times = choices.map((c) => c.publishedAt.getTime());
		expect(times).toEqual([...times].sort((a, b) => a - b));
		expect(choices[0].creator).toBeTruthy();
		expect(() => posterVideoChoices(env.db, env.viewer, season().id)).toThrow(ForbiddenError);
	});

	it('saves a chosen episode and frame, and automatic as null', () => {
		const v = placedIn(season().id)[0];
		const row = save(season().id, {
			poster_type: 'video',
			poster_video: v.youtubeVideoId,
			poster_frame: '2'
		});
		expect(row.poster).toEqual({ type: 'video', youtubeVideoId: v.youtubeVideoId, frame: '2' });
		expect(posterInput(row.poster)).toMatchObject({ poster_type: 'video', poster_frame: '2' });
		expect(save(season().id, { poster_type: 'auto' }).poster).toBeNull();
		// What older forms and history entries send.
		expect(save(season().id, { poster_type: 'art', palette: 'meadow' }).poster).toBeNull();
	});

	it('refuses an episode of another series, a Short and a bad frame or id', () => {
		const family = env.db
			.select({ id: t.series.id })
			.from(t.series)
			.where(eq(t.series.parentId, season().id))
			.all()
			.map((r) => r.id)
			.concat(season().id);
		const other = env.db
			.select()
			.from(t.videos)
			.where(eq(t.videos.status, 'placed'))
			.all()
			.find((v) => v.seriesId !== null && !family.includes(v.seriesId) && !v.isShort)!;
		const id = season().id;
		expect(
			errorsOf(() =>
				save(id, { poster_type: 'video', poster_video: other.youtubeVideoId, poster_frame: '1' })
			)
		).toEqual({ poster_video: 'invalid_choice' });
		const short = placedIn(id)[0];
		env.db.update(t.videos).set({ isShort: true }).where(eq(t.videos.id, short.id)).run();
		expect(
			errorsOf(() => save(id, { poster_type: 'video', poster_video: short.youtubeVideoId }))
		).toEqual({ poster_video: 'invalid_choice' });
		const ok = placedIn(id).find((v) => !v.isShort)!;
		expect(
			errorsOf(() =>
				save(id, { poster_type: 'video', poster_video: ok.youtubeVideoId, poster_frame: '4' })
			)
		).toEqual({ poster_frame: 'invalid_choice' });
		expect(errorsOf(() => save(id, { poster_type: 'video', poster_video: 'nope' }))).toEqual({
			poster_video: 'invalid_choice'
		});
		expect(errorsOf(() => save(id, { poster_type: 'video', poster_video: '' }))).toEqual({
			poster_video: 'required'
		});
		expect(errorsOf(() => save(id, { poster_type: 'image', poster_url: '' }))).toEqual({
			poster_url: 'required'
		});
	});

	it('accepts a video it does not know yet, and keeps the stored one when it moved', () => {
		const id = season().id;
		expect(
			save(id, { poster_type: 'video', poster_video: 'notsyncedyt', poster_frame: '1' }).poster
		).toMatchObject({ youtubeVideoId: 'notsyncedyt' });
		const v = placedIn(id)[0];
		save(id, { poster_type: 'video', poster_video: v.youtubeVideoId, poster_frame: '3' });
		setVideoStatus(env.db, env.editor, v.id, 'ignored');
		// An unrelated edit still saves; the public pages fall back to automatic.
		const row = save(id, { title: 'Lanternfall S3' });
		expect(row.poster).toEqual({ type: 'video', youtubeVideoId: v.youtubeVideoId, frame: '3' });
	});

	it('gives the Extras series the same poster', () => {
		const v = placedIn(season().id)[0];
		save(season().id, { poster_type: 'video', poster_video: v.youtubeVideoId, poster_frame: '1' });
		const existing = env.db.select().from(t.series).where(eq(t.series.parentId, season().id)).get();
		const extras = existing ?? createExtras(env.db, env.editor, season().id);
		if (!existing) expect(extras.poster).toEqual(season().poster);
		expect(
			save(extras.id, { poster_type: 'video', poster_video: v.youtubeVideoId, poster_frame: '1' })
				.poster
		).toMatchObject({ youtubeVideoId: v.youtubeVideoId });
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
				createRule(env.db, env.editor, row.id, {
					pattern: 'x'.repeat(MAX_PATTERN_LENGTH + 1),
					match: 'contains'
				})
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

	it('limits a rule to the series dates when asked, in the test and the re-run', () => {
		const row = newSeries(['quillby']);
		const video = unsortedTitled('My new texture pack');
		const setPublished = (iso: string) =>
			env.db
				.update(t.videos)
				.set({ publishedAt: new Date(iso) })
				.where(eq(t.videos.id, video.id))
				.run();
		const input = { pattern: 'texture', match: 'contains', within_series_dates: '1' };

		setPublished('2026-08-29T00:00:00Z'); // 3 days before the start: outside
		expect(testRule(env.db, env.editor, row.id, input).matches).toHaveLength(0);
		setPublished('2026-08-30T00:00:00Z'); // 2 days before: inside
		expect(testRule(env.db, env.editor, row.id, input).matches).toHaveLength(1);

		setPublished('2026-08-01T00:00:00Z');
		const rule = createRule(env.db, env.editor, row.id, { ...input, enabled: '1' });
		expect(rule.withinSeriesDates).toBe(true);
		expect(lastAudit(env.db)).toMatchObject({
			entity: 'rule',
			after: { withinSeriesDates: true }
		});
		expect(applyRulesToUnsorted(env.db, env.editor, { dryRun: true }).placed).toHaveLength(0);
		setPublished('2026-09-05T00:00:00Z');
		expect(applyRulesToUnsorted(env.db, env.editor, { dryRun: true }).placed).toMatchObject([
			{ videoId: video.id, ruleId: rule.id }
		]);
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
