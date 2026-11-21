/** Test-only database helpers for the community e2e tests (the e2e database, not the app). */
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

/**
 * Inserts a placed upload of a creator in a session of a series and returns its YouTube id,
 * so every test has its own video.
 */
export function insertPlacedVideo(
	creatorSlug: string,
	seriesSlug: string,
	session: number,
	title: string
): string {
	const youtubeId = `e2e${randomBytes(4).toString('hex')}`;
	withDb((db) => {
		const channel = db
			.prepare(
				`SELECT ch.id FROM channels ch JOIN creators c ON c.id = ch.creator_id
				 WHERE c.slug = ? AND ch.kind = 'main'`
			)
			.get(creatorSlug) as { id: number };
		const group = db
			.prepare(
				`SELECT g.id, g.series_id AS seriesId, g.starts_at AS startsAt FROM groups g
				 JOIN series s ON s.id = g.series_id WHERE s.slug = ? AND g.kind = 'session' AND g.number = ?`
			)
			.get(seriesSlug, session) as { id: number; seriesId: number; startsAt: number };
		db.prepare(
			`INSERT INTO videos (youtube_video_id, channel_id, title, published_at, duration_s, status,
			 placed_by, series_id, group_id, fetched_at)
			 VALUES (?, ?, ?, ?, 1500, 'placed', 'rule', ?, ?, ?)`
		).run(
			youtubeId,
			channel.id,
			title,
			group.startsAt + 3600,
			group.seriesId,
			group.id,
			Math.floor(Date.now() / 1000)
		);
	});
	return youtubeId;
}

/** The session number a video is in now (null without a group). */
export function sessionOf(youtubeId: string): number | null {
	return withDb(
		(db) =>
			(
				db
					.prepare(
						`SELECT g.number FROM videos v LEFT JOIN groups g ON g.id = v.group_id
						 WHERE v.youtube_video_id = ?`
					)
					.get(youtubeId) as { number: number | null }
			).number
	);
}
