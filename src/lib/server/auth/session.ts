/**
 * Server-side sessions. The browser gets a random token in an httpOnly cookie; the database
 * only stores its SHA-256 hash (`sessions.id`), so a leaked database does not leak sessions.
 * Sessions last 30 days and slide: using one in its second half extends it to 30 days again.
 */
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import type { DB } from '../db/client.js';
import { sessions, users } from '../db/schema.js';

export const SESSION_COOKIE = 'couchcrab_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Extend the session when less than this is left, so not every request writes. */
export const SESSION_RENEW_BEFORE_MS = 15 * 24 * 60 * 60 * 1000;

/** What `locals.user` holds for a signed-in visitor. */
export interface SessionUser {
	id: number;
	name: string;
	avatarUrl: string | null;
	role: 'viewer' | 'editor' | 'admin';
	creatorId: number | null;
}

/** 32 random bytes, base64url. */
export function generateSessionToken(): string {
	return randomBytes(32).toString('base64url');
}

/** SHA-256 of the token, hex. This is the `sessions.id`. */
export function hashSessionToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function sessionExpiry(now: Date): Date {
	return new Date(now.getTime() + SESSION_TTL_MS);
}

/** Whether a valid session should be extended on this request. */
export function shouldRenew(expiresAt: Date, now: Date): boolean {
	return expiresAt.getTime() - now.getTime() < SESSION_RENEW_BEFORE_MS;
}

export function createSession(
	db: DB,
	userId: number,
	now = new Date()
): { token: string; id: string; expiresAt: Date } {
	const token = generateSessionToken();
	const id = hashSessionToken(token);
	const expiresAt = sessionExpiry(now);
	db.insert(sessions).values({ id, userId, expiresAt }).run();
	return { token, id, expiresAt };
}

export interface ValidatedSession {
	sessionId: string;
	user: SessionUser;
	expiresAt: Date;
	/** True when the expiry was extended, so the cookie needs a new max-age. */
	renewed: boolean;
}

/** Looks up a token. Deletes and rejects an expired session; extends one in its second half. */
export function validateSessionToken(
	db: DB,
	token: string,
	now = new Date()
): ValidatedSession | null {
	if (!token) return null;
	const id = hashSessionToken(token);
	const row = db
		.select({
			expiresAt: sessions.expiresAt,
			user: {
				id: users.id,
				name: users.name,
				avatarUrl: users.avatarUrl,
				role: users.role,
				creatorId: users.creatorId
			}
		})
		.from(sessions)
		.innerJoin(users, eq(users.id, sessions.userId))
		.where(eq(sessions.id, id))
		.get();
	if (!row) return null;
	if (row.expiresAt.getTime() <= now.getTime()) {
		db.delete(sessions).where(eq(sessions.id, id)).run();
		return null;
	}
	if (shouldRenew(row.expiresAt, now)) {
		const expiresAt = sessionExpiry(now);
		db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id)).run();
		return { sessionId: id, user: row.user, expiresAt, renewed: true };
	}
	return { sessionId: id, user: row.user, expiresAt: row.expiresAt, renewed: false };
}

export function invalidateSession(db: DB, sessionId: string): void {
	db.delete(sessions).where(eq(sessions.id, sessionId)).run();
}

/** `Secure` everywhere except plain http on localhost (development and the e2e build). */
export function secureCookies(url: URL): boolean {
	return !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
}

export function setSessionCookie(cookies: Cookies, url: URL, token: string, expiresAt: Date) {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: secureCookies(url),
		expires: expiresAt
	});
}

export function deleteSessionCookie(cookies: Cookies, url: URL) {
	cookies.delete(SESSION_COOKIE, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: secureCookies(url)
	});
}
