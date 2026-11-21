import { readFileSync } from 'node:fs';
import { and, asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '#lib/server/db/client.js';
import * as t from '#lib/server/db/schema.js';
import {
	type Catalog,
	colorForSlug,
	importCatalog,
	parseCatalog,
	posterForSlug
} from '#lib/server/manage/catalog-import.js';
import { testDatabase } from '../auth/helpers.js';
import { auditRows, creatorBySlug, seeded, seriesBySlug } from './fixtures.js';

const LOCALES = ['en', 'nl'] as const;
const fixture = () =>
	JSON.parse(readFileSync('tests/fixtures/catalog/starter.json', 'utf8')) as Record<
		string,
		unknown
	>;

function parsed(raw: unknown = fixture()): Catalog {
	const result = parseCatalog(raw, LOCALES);
	if (!result.ok) throw new Error(result.problems.join('\n'));
	return result.catalog;
}

const run = (db: DB, raw: unknown = fixture(), dryRun = false) =>
	importCatalog(db, parsed(raw), { locales: LOCALES, dryRun });

const sessionsOf = (db: DB, seriesId: number) =>
	db
		.select()
		.from(t.groups)
		.where(and(eq(t.groups.seriesId, seriesId), eq(t.groups.kind, 'session')))
		.orderBy(asc(t.groups.number))
		.all();

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('catalog import', () => {
	let db: DB;
	beforeEach(() => {
		db = testDatabase();
	});

	it('creates creators, channels, series, Extras, sessions and rules', () => {
		const summary = run(db);
		expect(summary.problems).toEqual([]);
		expect(summary.counts.creators).toMatchObject({ created: 2 });
		expect(summary.counts.channels).toMatchObject({ created: 3 });
		expect(summary.counts.series).toMatchObject({ created: 1 });
		expect(summary.counts.extras).toMatchObject({ created: 1 });
		expect(summary.counts.rules).toMatchObject({ created: 2 });

		const dewlark = creatorBySlug(db, 'dewlark');
		expect(dewlark.color).toBe('#5fb3ff');
		// No colour in the file: a stable one from the slug.
		const moss = creatorBySlug(db, 'lanternmoss');
		expect(moss.color).toBe(colorForSlug('lanternmoss'));
		expect(colorForSlug('lanternmoss')).toBe(colorForSlug('lanternmoss'));
		const mossChannel = db
			.select()
			.from(t.channels)
			.where(eq(t.channels.creatorId, moss.id))
			.get()!;
		expect(mossChannel.title).toBe('Lanternmoss');

		const series = seriesBySlug(db, 'glimmerdeep-life');
		expect(series).toMatchObject({ kind: 'live_series', status: 'ended', grouping: 'session' });
		expect(series.poster).toEqual(posterForSlug('glimmerdeep-life'));
		const extras = seriesBySlug(db, 'glimmerdeep-life-extras');
		expect(extras.parentId).toBe(series.id);
		const translations = db
			.select()
			.from(t.seriesTranslations)
			.where(eq(t.seriesTranslations.seriesId, series.id))
			.all();
		expect(translations.map((d) => d.locale).sort()).toEqual(['en', 'nl']);

		// History entries come from the sync actor, without a user.
		const entries = auditRows(db);
		expect(entries.length).toBeGreaterThan(0);
		expect(entries.every((e) => e.actor === 'sync' && e.actorUserId === null)).toBe(true);
	});

	it('makes sessions that end where the next starts, the last at the series end', () => {
		run(db);
		const series = seriesBySlug(db, 'glimmerdeep-life');
		const sessions = sessionsOf(db, series.id);
		expect(sessions.map((g) => [g.number, g.startsAt, g.endsAt, g.title])).toEqual([
			[1, day('2026-01-05'), day('2026-01-12'), null],
			[2, day('2026-01-12'), day('2026-01-19'), 'Second session'],
			[3, day('2026-01-19'), day('2026-02-02'), null]
		]);
		// The Extras child (grouped by session) gets the same sessions for the livestreams.
		const extras = seriesBySlug(db, 'glimmerdeep-life-extras');
		expect(sessionsOf(db, extras.id)).toHaveLength(3);
	});

	it('leaves the last session open-ended while the series runs', () => {
		const raw = fixture();
		const s = (raw.series as Record<string, unknown>[])[0];
		s.status = 'ongoing';
		s.endedAt = null;
		run(db, raw);
		const sessions = sessionsOf(db, seriesBySlug(db, 'glimmerdeep-life').id);
		expect(sessions.at(-1)?.endsAt).toBeNull();
	});

	it('binds a rule with a channel to that creator main channel', () => {
		run(db);
		const series = seriesBySlug(db, 'glimmerdeep-life');
		const main = db
			.select()
			.from(t.channels)
			.where(eq(t.channels.youtubeChannelId, 'UCdewlark0000000000000aa'))
			.get()!;
		const rules = db.select().from(t.titleRules).where(eq(t.titleRules.seriesId, series.id)).all();
		expect(rules.find((r) => r.pattern === '^LIVE')).toMatchObject({
			channelId: main.id,
			match: 'regex',
			target: 'extras',
			priority: 5,
			enabled: true
		});
		expect(rules.find((r) => r.pattern === 'Glimmerdeep Life')?.channelId).toBeNull();
	});

	it('changes nothing when run twice', () => {
		run(db);
		const before = auditRows(db).length;
		const summary = run(db);
		expect(summary.problems).toEqual([]);
		for (const counts of Object.values(summary.counts)) {
			expect(counts.created).toBe(0);
			expect(counts.updated).toBe(0);
		}
		expect(summary.counts.creators.unchanged).toBe(2);
		expect(summary.counts.sessions.unchanged).toBe(6);
		expect(auditRows(db).length).toBe(before);
	});

	it('updates what an edited file changes and deletes nothing', () => {
		run(db);
		const series = seriesBySlug(db, 'glimmerdeep-life');
		const raw = fixture();
		const creators = raw.creators as Record<string, unknown>[];
		creators[0].name = 'Dewlark Renamed';
		creators.pop(); // lanternmoss is no longer in the file
		const s = (raw.series as Record<string, unknown>[])[0];
		s.title = 'Glimmerdeep Life (edited)';
		delete s.description_nl;
		s.sessions = [{ number: 2, startsAt: '2026-01-13', title: null }];
		s.rules = [
			{ pattern: 'Glimmerdeep Life', match: 'contains', target: 'main', channel: null, priority: 3 }
		];

		const summary = run(db, raw);
		expect(summary.problems).toEqual([]);
		expect(summary.counts.creators).toMatchObject({ updated: 1 });
		expect(summary.counts.series).toMatchObject({ updated: 1 });
		expect(summary.counts.rules).toMatchObject({ updated: 1 });

		expect(creatorBySlug(db, 'dewlark').name).toBe('Dewlark Renamed');
		expect(creatorBySlug(db, 'lanternmoss')).toBeDefined();
		const updated = seriesBySlug(db, 'glimmerdeep-life');
		expect(updated.title).toBe('Glimmerdeep Life (edited)');
		// Lanternmoss still takes part; the Dutch description stays.
		expect(
			db.select().from(t.seriesCreators).where(eq(t.seriesCreators.seriesId, series.id)).all()
		).toHaveLength(2);
		expect(
			db
				.select()
				.from(t.seriesTranslations)
				.where(eq(t.seriesTranslations.seriesId, series.id))
				.all()
		).toHaveLength(2);
		// Session 2 moved; sessions 1 and 3 are not in the file and are kept.
		const sessions = sessionsOf(db, series.id);
		expect(sessions).toHaveLength(3);
		expect(sessions[1].startsAt).toEqual(day('2026-01-13'));
		expect(db.select().from(t.titleRules).all()).toHaveLength(2);
	});

	it('writes nothing in a dry run', () => {
		const summary = run(db, fixture(), true);
		expect(summary.counts.creators.created).toBe(2);
		expect(db.select().from(t.creators).all()).toHaveLength(0);
		expect(auditRows(db)).toHaveLength(0);
	});
});

describe('catalog import over existing data', () => {
	let env: ReturnType<typeof seeded>;
	beforeEach(() => {
		env = seeded();
	});

	it('keeps a claimed creator profile and only adds channels', () => {
		const juno = creatorBySlug(env.db, 'tidecaller-juno');
		const channels = env.db
			.select()
			.from(t.channels)
			.where(eq(t.channels.creatorId, juno.id))
			.all();
		const summary = run(env.db, {
			creators: [
				{
					slug: 'tidecaller-juno',
					name: 'Someone Else',
					color: '#000000',
					channels: [
						{ youtubeChannelId: channels[0].youtubeChannelId, title: 'Renamed', kind: 'main' },
						{ youtubeChannelId: 'UCjunoextra00000000000aa', title: 'Juno Extra', kind: 'secondary' }
					]
				}
			],
			series: []
		});
		expect(summary.problems).toEqual([]);
		expect(summary.counts.creators.skipped).toBe(1);
		expect(summary.counts.channels).toMatchObject({ created: 1, skipped: 1 });
		const after = creatorBySlug(env.db, 'tidecaller-juno');
		expect(after).toMatchObject({ name: juno.name, color: juno.color, bio: juno.bio });
		const stored = env.db.select().from(t.channels).where(eq(t.channels.creatorId, juno.id)).all();
		expect(stored).toHaveLength(channels.length + 1);
		expect(stored.find((c) => c.id === channels[0].id)?.title).toBe(channels[0].title);
	});

	it('does not touch an opted-out creator', () => {
		const vesper = creatorBySlug(env.db, 'vesper-moss');
		const summary = run(env.db, {
			creators: [
				{
					slug: 'vesper-moss',
					name: 'Vesper Moss Again',
					channels: [{ youtubeChannelId: 'UCvesperextra0000000000a', kind: 'main' }]
				}
			],
			series: []
		});
		expect(summary.problems).toEqual([]);
		expect(summary.counts.creators.skipped).toBe(1);
		expect(summary.counts.channels.created).toBe(0);
		expect(creatorBySlug(env.db, 'vesper-moss').name).toBe(vesper.name);
	});

	it('rolls everything back when a channel belongs to another creator', () => {
		const juno = creatorBySlug(env.db, 'tidecaller-juno');
		const junoChannel = env.db
			.select()
			.from(t.channels)
			.where(eq(t.channels.creatorId, juno.id))
			.get()!;
		const before = env.db.select().from(t.creators).all().length;
		const summary = run(env.db, {
			creators: [
				{ slug: 'brand-new', name: 'Brand New', channels: [] },
				{
					slug: 'quillby',
					name: 'Quillby',
					channels: [{ youtubeChannelId: junoChannel.youtubeChannelId, kind: 'main' }]
				}
			],
			series: []
		});
		expect(summary.problems).toEqual([
			`creators[1] quillby: channels: ${junoChannel.youtubeChannelId} belongs to creator tidecaller-juno`
		]);
		expect(env.db.select().from(t.creators).all()).toHaveLength(before);
	});
});

describe('parseCatalog', () => {
	it('reports every problem at once', () => {
		const result = parseCatalog(
			{
				creators: [
					{ slug: 'Bad Slug', name: '', color: 'red', channels: [{ youtubeChannelId: 'nope' }] },
					{ slug: 'twin', name: 'Twin', channels: [] },
					{ slug: 'twin', name: 'Twin again', channels: [] }
				],
				series: [
					{
						slug: 'broken',
						title: 'Broken',
						kind: 'film',
						grouping: 'week',
						startedAt: '2026-13-40',
						creators: ['twin'],
						description_fr: 'Non',
						sessions: [{ number: 1, startsAt: '2026-01-01' }],
						rules: [
							{ pattern: '(', match: 'regex' },
							{ pattern: 'x', target: 'extras', channel: 'nobody' }
						]
					}
				],
				extra: true
			},
			LOCALES
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.problems).toEqual([
			'extra: unknown field',
			'creators[0] Bad Slug: slug: must be lowercase letters and digits joined by dashes',
			'creators[0] Bad Slug: name: required',
			'creators[0] Bad Slug: color: must be a hex colour like #2ec4b6',
			'creators[0] Bad Slug: channels[0].youtubeChannelId: must be a channel id (UC followed by 22 characters)',
			'creators[2] twin: slug: used twice in the file',
			'series[0] broken: kind: must be one of season, live_series, event, other',
			'series[0] broken: startedAt: must be YYYY-MM-DD',
			'series[0] broken: description_fr: unknown locale (known: en, nl)',
			'series[0] broken: description_en: required',
			'series[0] broken: sessions: only for a series with grouping "session"',
			'series[0] broken: rules[0].pattern: not a valid regular expression',
			'series[0] broken: rules[1].target: targets Extras, so the series needs "extras": true',
			"series[0] broken: rules[1].channel: creator nobody is not in this series' creators"
		]);
	});

	it('accepts the fixture', () => {
		expect(parseCatalog(fixture(), LOCALES).ok).toBe(true);
	});
});
