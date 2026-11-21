import { beforeEach, describe, expect, it } from 'vitest';
import { upsertDiscordUser, upsertGoogleUser } from '#lib/server/auth/users.js';
import type { DB } from '#lib/server/db/client.js';
import * as t from '#lib/server/db/schema.js';
import { testDatabase } from './helpers.js';

let db: DB;
const discord = (id: string, name = 'Fan') => ({ discordId: id, name, avatarUrl: null });
const noCurrent = { currentUserId: null, adminDiscordIds: [] as string[] };

beforeEach(() => {
	db = testDatabase();
});

describe('Discord sign-in', () => {
	it('creates a user once and updates the name on the next sign-in', () => {
		const first = upsertDiscordUser(db, discord('11', 'Old'), noCurrent);
		const second = upsertDiscordUser(db, discord('11', 'New'), noCurrent);
		expect(first).toMatchObject({ ok: true, created: true });
		expect(second).toMatchObject({ ok: true, created: false });
		const users = db.select().from(t.users).all();
		expect(users).toHaveLength(1);
		expect(users[0]).toMatchObject({ discordId: '11', name: 'New', role: 'viewer' });
	});

	it('makes ids in ADMIN_DISCORD_IDS admin on every sign-in', () => {
		upsertDiscordUser(db, discord('11'), noCurrent);
		upsertDiscordUser(db, discord('22'), { currentUserId: null, adminDiscordIds: ['22', '33'] });
		upsertDiscordUser(db, discord('11'), { currentUserId: null, adminDiscordIds: ['11'] });
		const roles = db
			.select({ id: t.users.discordId, role: t.users.role })
			.from(t.users)
			.all()
			.sort((a, b) => a.id!.localeCompare(b.id!));
		expect(roles).toEqual([
			{ id: '11', role: 'admin' },
			{ id: '22', role: 'admin' }
		]);
	});
});

describe('account linking', () => {
	it('links Google to the signed-in Discord user instead of creating a user', () => {
		const viewer = upsertDiscordUser(db, discord('11'), noCurrent);
		if (!viewer.ok) throw new Error();
		const google = upsertGoogleUser(
			db,
			{ sub: 'g-1', name: 'Channel' },
			{ currentUserId: viewer.userId }
		);
		expect(google).toEqual({ ok: true, userId: viewer.userId, created: false, linked: true });
		const users = db.select().from(t.users).all();
		expect(users).toHaveLength(1);
		expect(users[0]).toMatchObject({ discordId: '11', googleSub: 'g-1', name: 'Fan' });
		// Signing in with Google alone now finds the same user.
		expect(upsertGoogleUser(db, { sub: 'g-1', name: 'x' }, { currentUserId: null })).toMatchObject({
			ok: true,
			userId: viewer.userId,
			created: false
		});
	});

	it('links Discord to the signed-in Google user (the reverse)', () => {
		const creator = upsertGoogleUser(db, { sub: 'g-1', name: 'Channel' }, { currentUserId: null });
		if (!creator.ok) throw new Error();
		expect(creator.created).toBe(true);
		const linked = upsertDiscordUser(db, discord('11', 'Discord Name'), {
			currentUserId: creator.userId,
			adminDiscordIds: []
		});
		expect(linked).toMatchObject({ ok: true, userId: creator.userId, linked: true });
		expect(db.select().from(t.users).all()).toEqual([
			expect.objectContaining({ discordId: '11', googleSub: 'g-1', name: 'Discord Name' })
		]);
	});

	it('never moves a provider account that belongs to someone else', () => {
		const a = upsertDiscordUser(db, discord('11'), noCurrent);
		const b = upsertGoogleUser(db, { sub: 'g-2', name: 'B' }, { currentUserId: null });
		if (!a.ok || !b.ok) throw new Error();
		expect(upsertGoogleUser(db, { sub: 'g-2', name: 'B' }, { currentUserId: a.userId })).toEqual({
			ok: false,
			reason: 'linked_elsewhere'
		});
		expect(
			upsertDiscordUser(db, discord('11'), { currentUserId: b.userId, adminDiscordIds: [] })
		).toEqual({ ok: false, reason: 'linked_elsewhere' });
	});

	it('does not replace a linked account of the same provider', () => {
		const a = upsertDiscordUser(db, discord('11'), noCurrent);
		if (!a.ok) throw new Error();
		upsertGoogleUser(db, { sub: 'g-1', name: 'x' }, { currentUserId: a.userId });
		expect(upsertGoogleUser(db, { sub: 'g-9', name: 'x' }, { currentUserId: a.userId })).toEqual({
			ok: false,
			reason: 'other_account_linked'
		});
	});
});
