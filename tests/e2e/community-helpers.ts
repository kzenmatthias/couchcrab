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

/** Inserts an Unsorted upload on the channel with this title. */
export function insertUnsortedOn(channelTitle: string, title: string) {
	withDb((db) => {
		const channel = db.prepare('SELECT id FROM channels WHERE title = ?').get(channelTitle) as {
			id: number;
		};
		const now = Math.floor(Date.now() / 1000);
		db.prepare(
			`INSERT INTO videos (youtube_video_id, channel_id, title, published_at, duration_s, status, fetched_at)
			 VALUES (?, ?, ?, ?, 900, 'unsorted', ?)`
		).run(`e2e${randomBytes(4).toString('hex')}`, channel.id, title, now - 300, now);
	});
}

/**
 * Writes a history entry that places a video (by YouTube id) in its current series, as the
 * management tool would, by the named user.
 */
export function insertPlacementEntry(youtubeId: string, userName: string) {
	withDb((db) => {
		const video = db
			.prepare(
				'SELECT id, series_id AS seriesId, group_id AS groupId FROM videos WHERE youtube_video_id = ?'
			)
			.get(youtubeId) as { id: number; seriesId: number; groupId: number | null };
		const user = db.prepare('SELECT id FROM users WHERE name = ?').get(userName) as { id: number };
		db.prepare(
			`INSERT INTO audit_log (actor, actor_user_id, entity, entity_id, before, after, created_at)
			 VALUES ('user', ?, 'video', ?, ?, ?, ?)`
		).run(
			user.id,
			video.id,
			JSON.stringify({ seriesId: null, groupId: null, status: 'unsorted', placedBy: 'rule' }),
			JSON.stringify({
				seriesId: video.seriesId,
				groupId: video.groupId,
				status: 'placed',
				placedBy: 'user'
			}),
			Math.floor(Date.now() / 1000)
		);
	});
}

/** The English body of a managed site page, as stored. */
export function pageBody(slug: string): string {
	return withDb(
		(db) =>
			(
				db
					.prepare(
						`SELECT pt.body FROM page_translations pt JOIN pages p ON p.id = pt.page_id
						 WHERE p.slug = ? AND pt.locale = 'en'`
					)
					.get(slug) as { body: string }
			).body
	);
}
