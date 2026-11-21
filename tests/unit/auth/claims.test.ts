import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	claimCreator,
	classifyOwnedChannels,
	loadClaimCheck,
	recordPendingReviews,
	saveClaimCheck
} from '#lib/server/auth/claims.js';
import {
	fetchGoogleAccount,
	GOOGLE_CHANNELS_URL,
	GOOGLE_TOKEN_URL
} from '#lib/server/auth/google.js';
import { createSession } from '#lib/server/auth/session.js';
import { upsertGoogleUser } from '#lib/server/auth/users.js';
import type { DB } from '#lib/server/db/client.js';
import * as t from '#lib/server/db/schema.js';
import { fakeFetch, fakeIdToken, json, testDatabase } from './helpers.js';

const NOW = new Date('2026-11-01T12:00:00Z');
const CH = {
	pebble: 'UCclaimPebblewick0000001',
	pebble2: 'UCclaimPebblewick0000002',
	marrow: 'UCclaimMarrowfen00000001',
	taken: 'UCclaimTaken000000000001',
	hidden: 'UCclaimHidden00000000001',
	unknown: 'UCclaimUnknown0000000001'
};

let db: DB;
let creators: Record<'pebble' | 'marrow' | 'taken' | 'hidden', number>;
let userId: number;
let sessionId: string;
let otherUserId: number;

beforeEach(() => {
	db = testDatabase();
	const rows = db
		.insert(t.creators)
		.values([
			{ slug: 'pebblewick', name: 'Pebblewick', color: '#e05d5d' },
			{ slug: 'marrowfen', name: 'Marrowfen', color: '#ffd166' },
			{ slug: 'taken', name: 'Taken', color: '#7bd389', claimedAt: NOW },
			{ slug: 'hidden', name: 'Hidden', color: '#7bd389', optedOut: true }
		])
		.returning({ id: t.creators.id })
		.all();
	creators = { pebble: rows[0].id, marrow: rows[1].id, taken: rows[2].id, hidden: rows[3].id };
	db.insert(t.channels)
		.values([
			{ creatorId: creators.pebble, youtubeChannelId: CH.pebble, title: 'Pebblewick' },
			{ creatorId: creators.pebble, youtubeChannelId: CH.pebble2, title: 'Pebble Plays' },
			{ creatorId: creators.marrow, youtubeChannelId: CH.marrow, title: 'Marrowfen' },
			{ creatorId: creators.taken, youtubeChannelId: CH.taken, title: 'Taken' },
			{ creatorId: creators.hidden, youtubeChannelId: CH.hidden, title: 'Hidden' }
		])
		.run();
	otherUserId = db
		.insert(t.users)
		.values({ googleSub: 'other', name: 'Other', creatorId: creators.taken })
		.returning({ id: t.users.id })
		.get().id;
	userId = db
		.insert(t.users)
		.values({ googleSub: 'me', name: 'Me' })
		.returning({ id: t.users.id })
		.get().id;
	sessionId = createSession(db, userId, NOW).id;
});

const owned = (...ids: string[]) => ids.map((id) => ({ id, title: `Title ${id.slice(-2)}` }));

describe('classification of owned channels', () => {
	it('sorts every owned channel into the right status', () => {
		const result = classifyOwnedChannels(db, owned(CH.pebble, CH.taken, CH.hidden, CH.unknown), {
			id: userId,
			creatorId: null
		});
		expect(result.channels.map((c) => [c.youtubeChannelId, c.status, c.creator?.name])).toEqual([
			[CH.pebble, 'claimable', 'Pebblewick'],
			[CH.taken, 'claimed_by_other', 'Taken'],
			// An opted-out creator stays private: it is treated as not on Couchcrab.
			[CH.hidden, 'needs_review', undefined],
			[CH.unknown, 'needs_review', undefined]
		]);
		expect(result.claimable).toEqual([{ id: creators.pebble, name: 'Pebblewick' }]);
	});

	it('offers a choice when the channels match several creators', () => {
		const result = classifyOwnedChannels(db, owned(CH.pebble, CH.pebble2, CH.marrow), {
			id: userId,
			creatorId: null
		});
		expect(result.claimable.map((c) => c.name)).toEqual(['Pebblewick', 'Marrowfen']);
	});

	it('shows the own creator as verified and others as not available', () => {
		const result = classifyOwnedChannels(db, owned(CH.pebble, CH.marrow), {
			id: userId,
			creatorId: creators.pebble
		});
		expect(result.channels.map((c) => c.status)).toEqual(['verified', 'has_other_profile']);
		expect(result.claimable).toEqual([]);
	});

	it('classifies the channels from a (mocked) Google sign-in', async () => {
		const { fetch } = fakeFetch({
			[GOOGLE_TOKEN_URL]: () =>
				json({
					access_token: 'token',
					id_token: fakeIdToken({
						iss: 'accounts.google.com',
						aud: 'cid',
						sub: 'me',
						exp: NOW.getTime() / 1000 + 60
					})
				}),
			[GOOGLE_CHANNELS_URL]: () =>
				json({
					items: [
						{ id: CH.pebble, snippet: { title: 'Pebblewick' } },
						{ id: CH.unknown, snippet: { title: 'Pebble Builds' } }
					]
				})
		});
		const account = await fetchGoogleAccount(
			fetch,
			{ clientId: 'cid', clientSecret: 's', redirectUri: 'http://x/cb' },
			'code',
			'verifier',
			NOW
		);
		const user = upsertGoogleUser(db, { sub: account.sub, name: 'x' }, { currentUserId: null });
		expect(user).toMatchObject({ ok: true, userId, created: false });
		const result = classifyOwnedChannels(db, account.channels, { id: userId, creatorId: null });
		expect(result.channels.map((c) => c.status)).toEqual(['claimable', 'needs_review']);
	});
});

describe('claim check record', () => {
	it('lives for 15 minutes and only for its own session and user', () => {
		saveClaimCheck(db, { sessionId, userId, channels: owned(CH.pebble) }, NOW);
		expect(loadClaimCheck(db, sessionId, userId, new Date(NOW.getTime() + 14 * 60_000))).toEqual(
			owned(CH.pebble)
		);
		expect(loadClaimCheck(db, sessionId, otherUserId, NOW)).toBeNull();
		saveClaimCheck(db, { sessionId, userId, channels: owned(CH.pebble) }, NOW);
		expect(loadClaimCheck(db, sessionId, userId, new Date(NOW.getTime() + 16 * 60_000))).toBeNull();
		expect(db.select().from(t.claimChecks).all()).toHaveLength(0);
	});

	it('stores channel ids and titles only', () => {
		saveClaimCheck(db, { sessionId, userId, channels: owned(CH.pebble) }, NOW);
		const row = db.select().from(t.claimChecks).get()!;
		expect(Object.keys(row).sort()).toEqual([
			'channels',
			'createdAt',
			'expiresAt',
			'sessionId',
			'userId'
		]);
		expect(row.channels).toEqual([{ id: CH.pebble, title: 'Title 01' }]);
	});

	it('is deleted with the session (sign out)', () => {
		saveClaimCheck(db, { sessionId, userId, channels: owned(CH.pebble) }, NOW);
		db.delete(t.sessions).where(eq(t.sessions.id, sessionId)).run();
		expect(db.select().from(t.claimChecks).all()).toHaveLength(0);
	});
});

describe('claiming', () => {
	it('verifies the channels, links the user, marks the creator and writes history', () => {
		saveClaimCheck(db, { sessionId, userId, channels: owned(CH.pebble, CH.pebble2) }, NOW);
		const result = claimCreator(db, { sessionId, userId, creatorId: creators.pebble }, NOW);
		expect(result).toEqual({ ok: true, creatorId: creators.pebble, channels: 2 });

		const user = db.select().from(t.users).where(eq(t.users.id, userId)).get()!;
		expect(user.creatorId).toBe(creators.pebble);
		const creator = db.select().from(t.creators).where(eq(t.creators.id, creators.pebble)).get()!;
		expect(creator.claimedAt).toEqual(NOW);
		const channels = db
			.select()
			.from(t.channels)
			.where(eq(t.channels.creatorId, creators.pebble))
			.all();
		expect(channels.every((c) => c.verifiedByUserId === userId && c.verifiedAt)).toBe(true);
		const claims = db.select().from(t.claims).all();
		expect(claims.map((c) => [c.youtubeChannelId, c.status, c.creatorId])).toEqual([
			[CH.pebble, 'verified', creators.pebble],
			[CH.pebble2, 'verified', creators.pebble]
		]);
		const audit = db.select().from(t.auditLog).all();
		expect(audit.map((a) => a.entity).sort()).toEqual(['channel', 'channel', 'creator', 'user']);
		expect(audit.every((a) => a.actor === 'user' && a.actorUserId === userId)).toBe(true);

		// Shown as verified afterwards.
		const after = classifyOwnedChannels(db, owned(CH.pebble), {
			id: userId,
			creatorId: user.creatorId
		});
		expect(after.channels[0].status).toBe('verified');
	});

	it('refuses creators that are not in the owned list, already claimed or opted out', () => {
		saveClaimCheck(db, { sessionId, userId, channels: owned(CH.taken, CH.hidden) }, NOW);
		for (const creatorId of [creators.marrow, creators.taken, creators.hidden]) {
			expect(claimCreator(db, { sessionId, userId, creatorId }, NOW)).toEqual({
				ok: false,
				reason: 'not_claimable'
			});
		}
		expect(db.select().from(t.claims).all()).toHaveLength(0);
		expect(db.select().from(t.auditLog).all()).toHaveLength(0);
	});

	it('refuses after the check expired', () => {
		saveClaimCheck(db, { sessionId, userId, channels: owned(CH.pebble) }, NOW);
		const later = new Date(NOW.getTime() + 16 * 60_000);
		expect(claimCreator(db, { sessionId, userId, creatorId: creators.pebble }, later)).toEqual({
			ok: false,
			reason: 'expired'
		});
	});

	it('cannot claim a second creator', () => {
		saveClaimCheck(db, { sessionId, userId, channels: owned(CH.pebble, CH.marrow) }, NOW);
		expect(claimCreator(db, { sessionId, userId, creatorId: creators.pebble }, NOW).ok).toBe(true);
		expect(claimCreator(db, { sessionId, userId, creatorId: creators.marrow }, NOW).ok).toBe(false);
	});
});

describe('channels not on Couchcrab', () => {
	it('become pending_review claims and creator requests, once', () => {
		const list = owned(CH.pebble, CH.unknown, CH.hidden);
		expect(recordPendingReviews(db, userId, list)).toBe(2);
		expect(recordPendingReviews(db, userId, list)).toBe(0);
		const claims = db.select().from(t.claims).all();
		expect(claims.map((c) => [c.youtubeChannelId, c.status])).toEqual([
			[CH.unknown, 'pending_review'],
			[CH.hidden, 'pending_review']
		]);
		const requests = db.select().from(t.suggestions).all();
		expect(requests).toHaveLength(2);
		expect(requests.every((r) => r.isCreatorRequest && r.targetType === 'channel')).toBe(true);
	});
});
