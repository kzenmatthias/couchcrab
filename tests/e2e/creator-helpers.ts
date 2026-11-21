/** Test-only database helpers for the creator dashboard e2e tests (the e2e database). */
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
 * A fresh claimed creator with a main channel, a place in a series and one placed upload, plus
 * the Google user who claimed it. Tests that change visibility use this instead of the demo
 * creator, so parallel tests never see it disappear.
 */
export function createClaimedCreator(seriesSlug: string) {
	const tag = randomBytes(4).toString('hex');
	const now = Math.floor(Date.now() / 1000);
	return withDb((db) =>
		db.transaction(() => {
			const slug = `e2e-creator-${tag}`;
			const name = `Creator ${tag}`;
			const creator = db
				.prepare(
					'INSERT INTO creators (slug, name, color, claimed_at) VALUES (?, ?, ?, ?) RETURNING id'
				)
				.get(slug, name, '#2ec4b6', now) as { id: number };
			const channel = db
				.prepare(
					`INSERT INTO channels (creator_id, youtube_channel_id, title, kind, verified_at)
					 VALUES (?, ?, ?, 'main', ?) RETURNING id`
				)
				.get(creator.id, `UC${randomBytes(11).toString('hex')}`, name, now) as { id: number };
			const series = db.prepare('SELECT id FROM series WHERE slug = ?').get(seriesSlug) as {
				id: number;
			};
			db.prepare('INSERT INTO series_creators (series_id, creator_id) VALUES (?, ?)').run(
				series.id,
				creator.id
			);
			const videoTitle = `Visible upload ${tag}`;
			const youtubeId = `e2e${randomBytes(4).toString('hex')}`;
			db.prepare(
				`INSERT INTO videos (youtube_video_id, channel_id, title, published_at, duration_s,
				 series_id, status, placed_by, fetched_at)
				 VALUES (?, ?, ?, ?, 1500, ?, 'placed', 'rule', ?)`
			).run(youtubeId, channel.id, videoTitle, now - 600, series.id, now);
			// A second channel with one placed upload, for unlinking.
			const secondChannelTitle = `${name} Plays`;
			const second = db
				.prepare(
					`INSERT INTO channels (creator_id, youtube_channel_id, title, kind)
					 VALUES (?, ?, ?, 'secondary') RETURNING id`
				)
				.get(creator.id, `UC${randomBytes(11).toString('hex')}`, secondChannelTitle) as {
				id: number;
			};
			const secondVideoTitle = `Second channel upload ${tag}`;
			db.prepare(
				`INSERT INTO videos (youtube_video_id, channel_id, title, published_at, duration_s,
				 series_id, status, placed_by, fetched_at)
				 VALUES (?, ?, ?, ?, 1500, ?, 'placed', 'rule', ?)`
			).run(
				`e2e${randomBytes(4).toString('hex')}`,
				second.id,
				secondVideoTitle,
				now - 900,
				series.id,
				now
			);
			const user = db
				.prepare('INSERT INTO users (google_sub, name, creator_id) VALUES (?, ?, ?) RETURNING id')
				.get(`e2e-${tag}`, name, creator.id) as { id: number };
			return {
				userId: user.id,
				slug,
				name,
				videoTitle,
				youtubeId,
				secondChannelTitle,
				secondVideoTitle
			};
		})()
	);
}

/** The id of a video on another creator's main channel. */
export function videoIdOf(creatorSlug: string): number {
	return withDb(
		(db) =>
			(
				db
					.prepare(
						`SELECT v.id FROM videos v JOIN channels ch ON ch.id = v.channel_id
						 JOIN creators c ON c.id = ch.creator_id WHERE c.slug = ? LIMIT 1`
					)
					.get(creatorSlug) as { id: number }
			).id
	);
}

export function videoPlacement(title: string) {
	return withDb(
		(db) =>
			db
				.prepare(
					'SELECT status, placed_by AS placedBy, series_id AS seriesId FROM videos WHERE title = ?'
				)
				.get(title) as { status: string; placedBy: string | null; seriesId: number | null }
	);
}

export function lastAuditActor(entity: string, entityId: number) {
	return withDb(
		(db) =>
			(
				db
					.prepare(
						'SELECT actor FROM audit_log WHERE entity = ? AND entity_id = ? ORDER BY id DESC LIMIT 1'
					)
					.get(entity, entityId) as { actor: string } | undefined
			)?.actor
	);
}

export function channelState(title: string) {
	return withDb(
		(db) =>
			db
				.prepare(
					`SELECT unlinked_at AS unlinkedAt, sync_enabled AS syncEnabled,
					 (SELECT count(*) FROM videos v WHERE v.channel_id = ch.id) AS videos
					 FROM channels ch WHERE title = ?`
				)
				.get(title) as { unlinkedAt: number | null; syncEnabled: number; videos: number }
	);
}
