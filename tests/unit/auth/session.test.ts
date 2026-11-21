import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { requireRole, requireUser } from '#lib/server/auth/guards.js';
import {
	createSession,
	generateSessionToken,
	hashSessionToken,
	invalidateSession,
	SESSION_TTL_MS,
	secureCookies,
	shouldRenew,
	validateSessionToken,
	type SessionUser
} from '#lib/server/auth/session.js';
import type { DB } from '#lib/server/db/client.js';
import * as t from '#lib/server/db/schema.js';
import { testDatabase } from './helpers.js';

const DAY = 86_400_000;
const NOW = new Date('2026-11-01T12:00:00Z');

let db: DB;
let userId: number;

beforeEach(() => {
	db = testDatabase();
	userId = db
		.insert(t.users)
		.values({ discordId: '1', name: 'Viewer' })
		.returning({ id: t.users.id })
		.get().id;
});

describe('session tokens', () => {
	it('are random and long enough', () => {
		const a = generateSessionToken();
		expect(a).toMatch(/^[\w-]{43}$/);
		expect(generateSessionToken()).not.toBe(a);
	});

	it('are stored only as a SHA-256 hash', () => {
		expect(hashSessionToken('abc')).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		);
		const { token, id } = createSession(db, userId, NOW);
		const row = db.select().from(t.sessions).get()!;
		expect(row.id).toBe(id);
		expect(row.id).toBe(hashSessionToken(token));
		expect(row.id).not.toContain(token);
	});
});

describe('session expiry', () => {
	it('expires 30 days after creation', () => {
		const { expiresAt } = createSession(db, userId, NOW);
		expect(expiresAt.getTime() - NOW.getTime()).toBe(SESSION_TTL_MS);
		expect(SESSION_TTL_MS).toBe(30 * DAY);
	});

	it('resolves the user of a valid token without renewing a fresh session', () => {
		const { token } = createSession(db, userId, NOW);
		const session = validateSessionToken(db, token, new Date(NOW.getTime() + DAY))!;
		expect(session.user).toEqual({
			id: userId,
			name: 'Viewer',
			avatarUrl: null,
			role: 'viewer',
			creatorId: null
		});
		expect(session.renewed).toBe(false);
	});

	it('slides: a session in its second half is extended to 30 days again', () => {
		const { token, id } = createSession(db, userId, NOW);
		const later = new Date(NOW.getTime() + 20 * DAY);
		const session = validateSessionToken(db, token, later)!;
		expect(session.renewed).toBe(true);
		expect(session.expiresAt.getTime()).toBe(later.getTime() + 30 * DAY);
		const row = db.select().from(t.sessions).where(eq(t.sessions.id, id)).get()!;
		expect(row.expiresAt.getTime()).toBe(Math.floor((later.getTime() + 30 * DAY) / 1000) * 1000);
	});

	it('rejects and deletes an expired session', () => {
		const { token } = createSession(db, userId, NOW);
		expect(validateSessionToken(db, token, new Date(NOW.getTime() + 31 * DAY))).toBeNull();
		expect(db.select().from(t.sessions).all()).toHaveLength(0);
	});

	it('rejects unknown and empty tokens and signed-out sessions', () => {
		expect(validateSessionToken(db, 'nope', NOW)).toBeNull();
		expect(validateSessionToken(db, '', NOW)).toBeNull();
		const { token, id } = createSession(db, userId, NOW);
		invalidateSession(db, id);
		expect(validateSessionToken(db, token, NOW)).toBeNull();
	});

	it('renews only when less than 15 days are left', () => {
		expect(shouldRenew(new Date(NOW.getTime() + 16 * DAY), NOW)).toBe(false);
		expect(shouldRenew(new Date(NOW.getTime() + 14 * DAY), NOW)).toBe(true);
	});
});

describe('cookies', () => {
	it('are Secure except on plain http localhost', () => {
		expect(secureCookies(new URL('https://couchcrab.example/'))).toBe(true);
		expect(secureCookies(new URL('http://couchcrab.example/'))).toBe(true);
		expect(secureCookies(new URL('http://localhost:5173/'))).toBe(false);
	});
});

describe('guards', () => {
	const user = (role: SessionUser['role']): App.Locals => ({
		theme: 'system',
		sessionId: 'x',
		user: { id: 1, name: 'A', avatarUrl: null, role, creatorId: null }
	});
	const status = (fn: () => unknown) => {
		try {
			fn();
		} catch (err) {
			if (isHttpError(err)) return err.status;
			throw err;
		}
		return 200;
	};

	it('requireUser gives 401 when signed out', () => {
		expect(status(() => requireUser({ theme: 'system', sessionId: null, user: null }))).toBe(401);
		expect(requireUser(user('viewer')).id).toBe(1);
	});

	it('requireRole gives 403 below the role and lets admins do editor work', () => {
		expect(status(() => requireRole(user('viewer'), 'editor'))).toBe(403);
		expect(status(() => requireRole(user('editor'), 'admin'))).toBe(403);
		expect(status(() => requireRole(user('editor'), 'editor'))).toBe(200);
		expect(status(() => requireRole(user('admin'), 'editor'))).toBe(200);
		expect(
			status(() => requireRole({ theme: 'system', sessionId: null, user: null }, 'admin'))
		).toBe(401);
	});
});
