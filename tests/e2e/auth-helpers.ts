/**
 * Test-only helpers that sign a seeded user in by writing a session row straight into the e2e
 * database and setting the cookie. The app has no backdoor route for this.
 */
import { createHash, randomBytes } from 'node:crypto';
import Database from 'better-sqlite3';
import type { BrowserContext } from '@playwright/test';

const DB_PATH = './data/e2e.db';
const DAY_S = 86_400;

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

const now = () => Math.floor(Date.now() / 1000);

/** Creates a session for the user and returns the token and session id. */
export function createSessionRow(userId: number) {
	const token = randomBytes(32).toString('base64url');
	const id = createHash('sha256').update(token).digest('hex');
	withDb((db) =>
		db
			.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
			.run(id, userId, now() + 30 * DAY_S)
	);
	return { token, id };
}

export function userIdByName(name: string): number {
	return withDb(
		(db) => (db.prepare('SELECT id FROM users WHERE name = ?').get(name) as { id: number }).id
	);
}

/** A fresh Google-only user, so tests that claim or sign out never share state. */
export function createGoogleUser(name: string): number {
	return withDb(
		(db) =>
			db
				.prepare('INSERT INTO users (google_sub, name) VALUES (?, ?) RETURNING id')
				.get(`e2e-${randomBytes(8).toString('hex')}`, name) as { id: number }
	).id;
}

export function mainChannelOf(slug: string): string {
	return withDb(
		(db) =>
			db
				.prepare(
					`SELECT ch.youtube_channel_id AS id FROM channels ch
					 JOIN creators c ON c.id = ch.creator_id
					 WHERE c.slug = ? AND ch.kind = 'main'`
				)
				.get(slug) as { id: string }
	).id;
}

/** The record the Google callback would write: owned channel ids and titles, 15 minutes. */
export function createClaimCheck(
	sessionId: string,
	userId: number,
	channels: { id: string; title: string }[]
) {
	withDb((db) =>
		db
			.prepare(
				'INSERT INTO claim_checks (session_id, user_id, channels, expires_at) VALUES (?, ?, ?, ?)'
			)
			.run(sessionId, userId, JSON.stringify(channels), now() + 15 * 60)
	);
}

export function sessionExists(id: string): boolean {
	return withDb((db) => Boolean(db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(id)));
}

export async function signIn(context: BrowserContext, baseURL: string, userId: number) {
	const session = createSessionRow(userId);
	await context.addCookies([
		{
			name: 'couchcrab_session',
			value: session.token,
			url: baseURL,
			httpOnly: true,
			sameSite: 'Lax'
		}
	]);
	return session;
}
