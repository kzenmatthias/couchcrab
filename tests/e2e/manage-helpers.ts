/** Test-only database helpers for the management e2e tests (the e2e database, not the app). */
import { randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';

const DB_PATH = './data/e2e.db';

function withDb<T>(fn: (db: Database.Database) => T): T {
	const db = new Database(DB_PATH);
	db.pragma('busy_timeout = 5000');
	db.pragma('foreign_keys = ON');
	try {
		return fn(db);
	} finally {
		db.close();
	}
}

/** Inserts an unsorted upload on a creator's main channel and returns its title. */
export function insertUnsorted(creatorSlug: string, title: string): string {
	withDb((db) => {
		const channel = db
			.prepare(
				`SELECT ch.id FROM channels ch JOIN creators c ON c.id = ch.creator_id
				 WHERE c.slug = ? AND ch.kind = 'main'`
			)
			.get(creatorSlug) as { id: number };
		const now = Math.floor(Date.now() / 1000);
		db.prepare(
			`INSERT INTO videos (youtube_video_id, channel_id, title, published_at, duration_s, status, fetched_at)
			 VALUES (?, ?, ?, ?, 1200, 'unsorted', ?)`
		).run(`e2e${randomBytes(4).toString('hex')}`, channel.id, title, now - 3600, now);
	});
	return title;
}

export function videoByTitle(title: string) {
	return withDb(
		(db) =>
			db
				.prepare(
					'SELECT status, placed_by AS placedBy, series_id AS seriesId FROM videos WHERE title = ?'
				)
				.get(title) as { status: string; placedBy: string | null; seriesId: number | null }
	);
}

export function idOf(table: 'creators' | 'series', slug: string): number {
	return withDb(
		(db) => (db.prepare(`SELECT id FROM ${table} WHERE slug = ?`).get(slug) as { id: number }).id
	);
}

export function siteText(key: string, locale: string): string | undefined {
	return withDb(
		(db) =>
			(
				db.prepare('SELECT value FROM site_texts WHERE key = ? AND locale = ?').get(key, locale) as
					{ value: string } | undefined
			)?.value
	);
}

export function setSiteText(key: string, locale: string, value: string) {
	withDb((db) =>
		db
			.prepare(
				`INSERT INTO site_texts (key, locale, value) VALUES (?, ?, ?)
				 ON CONFLICT (key, locale) DO UPDATE SET value = excluded.value`
			)
			.run(key, locale, value)
	);
}

export const uniqueTag = () => randomBytes(3).toString('hex');

/**
 * A series of its own with Quillby and two placed episodes whose ids look like real YouTube ids
 * (so the posters load images, which the test answers itself). Returns the slug and the ids.
 */
export function insertPosterSeries(tag: string) {
	const slug = `poster-${tag}`;
	const ids = [`e2ep${tag}a`, `e2ep${tag}b`];
	withDb((db) => {
		const now = Math.floor(Date.now() / 1000);
		const series = db
			.prepare(
				`INSERT INTO series (slug, title, kind, status, grouping, started_at, created_at)
				 VALUES (?, ?, 'season', 'ongoing', 'week', ?, ?) RETURNING id`
			)
			.get(slug, `Poster ${tag}`, now - 86400 * 10, now) as { id: number };
		const creator = db.prepare("SELECT id FROM creators WHERE slug = 'quillby'").get() as {
			id: number;
		};
		db.prepare(
			"INSERT INTO series_translations (series_id, locale, description) VALUES (?, 'en', ?)"
		).run(series.id, 'A series made by the e2e test.');
		db.prepare('INSERT INTO series_creators (series_id, creator_id) VALUES (?, ?)').run(
			series.id,
			creator.id
		);
		const channel = db
			.prepare("SELECT id FROM channels WHERE creator_id = ? AND kind = 'main'")
			.get(creator.id) as { id: number };
		ids.forEach((id, i) =>
			db
				.prepare(
					`INSERT INTO videos (youtube_video_id, channel_id, title, published_at, duration_s,
					 series_id, status, placed_by, fetched_at)
					 VALUES (?, ?, ?, ?, 1200, ?, 'placed', 'user', ?)`
				)
				.run(
					id,
					channel.id,
					`Poster ${tag} episode ${i + 1}`,
					now - 86400 * (5 - i),
					series.id,
					now
				)
		);
	});
	return { slug, ids };
}
