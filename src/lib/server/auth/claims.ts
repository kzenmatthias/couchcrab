/**
 * The creator claim step after Google sign-in.
 *
 * The channels the Google account owns (ids and titles only) are kept for 15 minutes in
 * `claim_checks`, bound to the session. Each owned channel is then classified:
 *
 * - `claimable`: on Couchcrab, its creator is unclaimed and not opted out;
 * - `verified`: its creator is already claimed by this user;
 * - `claimed_by_other`: its creator was claimed by someone else;
 * - `has_other_profile`: claimable, but this user already claimed another creator;
 * - `needs_review`: not on Couchcrab (or the creator opted out, which stays private), so it
 *   becomes a creator request for review.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import {
	channels,
	claimChecks,
	claims,
	creators,
	suggestions,
	users,
	type OwnedChannel
} from '../db/schema.js';
import { writeAudit, type Executor } from '../audit.js';

export const CLAIM_CHECK_TTL_MS = 15 * 60 * 1000;

export function saveClaimCheck(
	db: DB,
	record: { sessionId: string; userId: number; channels: OwnedChannel[] },
	now = new Date()
): void {
	const expiresAt = new Date(now.getTime() + CLAIM_CHECK_TTL_MS);
	db.insert(claimChecks)
		.values({ ...record, expiresAt })
		.onConflictDoUpdate({
			target: claimChecks.sessionId,
			set: { userId: record.userId, channels: record.channels, expiresAt }
		})
		.run();
}

/** The owned channels saved for this session and user, or null when missing or expired. */
export function loadClaimCheck(
	db: Executor,
	sessionId: string,
	userId: number,
	now = new Date()
): OwnedChannel[] | null {
	const row = db.select().from(claimChecks).where(eq(claimChecks.sessionId, sessionId)).get();
	if (!row) return null;
	if (row.userId !== userId || row.expiresAt.getTime() <= now.getTime()) {
		db.delete(claimChecks).where(eq(claimChecks.sessionId, sessionId)).run();
		return null;
	}
	return row.channels;
}

export function deleteClaimCheck(db: DB, sessionId: string): void {
	db.delete(claimChecks).where(eq(claimChecks.sessionId, sessionId)).run();
}

export type ChannelStatus =
	'claimable' | 'verified' | 'claimed_by_other' | 'has_other_profile' | 'needs_review';

export interface ClassifiedChannel {
	youtubeChannelId: string;
	title: string;
	status: ChannelStatus;
	/** Set when the channel is on Couchcrab and its creator is public. */
	creator: { id: number; name: string; slug: string; color: string } | null;
}

export interface Classification {
	channels: ClassifiedChannel[];
	/** Distinct creators the user may claim; more than one means the user picks. */
	claimable: { id: number; name: string }[];
}

export function classifyOwnedChannels(
	db: Executor,
	owned: OwnedChannel[],
	user: { id: number; creatorId: number | null }
): Classification {
	const ids = owned.map((c) => c.id);
	const rows = ids.length
		? db
				.select({
					youtubeChannelId: channels.youtubeChannelId,
					creatorId: creators.id,
					name: creators.name,
					slug: creators.slug,
					color: creators.color,
					claimedAt: creators.claimedAt,
					optedOut: creators.optedOut
				})
				.from(channels)
				.innerJoin(creators, eq(creators.id, channels.creatorId))
				.where(inArray(channels.youtubeChannelId, ids))
				.all()
		: [];
	const byChannel = new Map(rows.map((r) => [r.youtubeChannelId, r]));

	const result: ClassifiedChannel[] = owned.map((c) => {
		const row = byChannel.get(c.id);
		// An opted-out creator stays private, except to the user who claimed it.
		if (!row || (row.optedOut && user.creatorId !== row.creatorId)) {
			return { youtubeChannelId: c.id, title: c.title, status: 'needs_review', creator: null };
		}
		const creator = { id: row.creatorId, name: row.name, slug: row.slug, color: row.color };
		let status: ChannelStatus;
		if (user.creatorId === row.creatorId) status = 'verified';
		else if (row.claimedAt) status = 'claimed_by_other';
		else if (user.creatorId !== null) status = 'has_other_profile';
		else status = 'claimable';
		return { youtubeChannelId: c.id, title: c.title, status, creator };
	});

	const claimable = new Map<number, { id: number; name: string }>();
	for (const c of result) {
		if (c.status === 'claimable' && c.creator) {
			claimable.set(c.creator.id, { id: c.creator.id, name: c.creator.name });
		}
	}
	return { channels: result, claimable: [...claimable.values()] };
}

/**
 * Turns owned channels that are not on Couchcrab into `pending_review` claims and creator
 * requests in the review queue. Runs once per user and channel.
 */
export function recordPendingReviews(db: DB, userId: number, owned: OwnedChannel[]): number {
	return db.transaction((tx) => {
		const user = tx
			.select({ id: users.id, creatorId: users.creatorId })
			.from(users)
			.where(eq(users.id, userId))
			.get();
		if (!user) return 0;
		const { channels: classified } = classifyOwnedChannels(tx, owned, user);
		let added = 0;
		for (const c of classified) {
			if (c.status !== 'needs_review') continue;
			const known = tx
				.select({ id: claims.id })
				.from(claims)
				.where(and(eq(claims.userId, userId), eq(claims.youtubeChannelId, c.youtubeChannelId)))
				.get();
			if (known) continue;
			tx.insert(claims)
				.values({
					userId,
					creatorId: null,
					youtubeChannelId: c.youtubeChannelId,
					status: 'pending_review'
				})
				.run();
			tx.insert(suggestions)
				.values({
					userId,
					targetType: 'channel',
					targetId: null,
					kind: 'create',
					payload: { youtubeChannelId: c.youtubeChannelId, title: c.title },
					isCreatorRequest: true
				})
				.run();
			added++;
		}
		return added;
	});
}

export type ClaimResult =
	| { ok: true; creatorId: number; channels: number }
	| { ok: false; reason: 'expired' | 'not_claimable' };

/**
 * Claims a creator for the user, if one of the owned channels in this session's claim check
 * belongs to it and it is still claimable. Everything happens in one transaction, with history.
 */
export function claimCreator(
	db: DB,
	input: { sessionId: string; userId: number; creatorId: number },
	now = new Date()
): ClaimResult {
	return db.transaction((tx): ClaimResult => {
		const owned = loadClaimCheck(tx, input.sessionId, input.userId, now);
		if (!owned) return { ok: false, reason: 'expired' };
		const user = tx
			.select({ id: users.id, creatorId: users.creatorId })
			.from(users)
			.where(eq(users.id, input.userId))
			.get();
		if (!user) return { ok: false, reason: 'expired' };
		const { channels: classified, claimable } = classifyOwnedChannels(tx, owned, user);
		if (!claimable.some((c) => c.id === input.creatorId))
			return { ok: false, reason: 'not_claimable' };

		const mine = classified.filter((c) => c.creator?.id === input.creatorId);
		const at = new Date(Math.floor(now.getTime() / 1000) * 1000);
		const actor = { actor: 'user' as const, actorUserId: user.id };

		const claimed = tx
			.update(creators)
			.set({ claimedAt: at })
			.where(and(eq(creators.id, input.creatorId), isNull(creators.claimedAt)))
			.run();
		if (claimed.changes !== 1) return { ok: false, reason: 'not_claimable' };
		writeAudit(tx, {
			...actor,
			entity: 'creator',
			entityId: input.creatorId,
			before: { claimedAt: null },
			after: { claimedAt: at.toISOString(), claimedByUserId: user.id },
			createdAt: at
		});

		tx.update(users).set({ creatorId: input.creatorId }).where(eq(users.id, user.id)).run();
		writeAudit(tx, {
			...actor,
			entity: 'user',
			entityId: user.id,
			before: { creatorId: user.creatorId },
			after: { creatorId: input.creatorId },
			createdAt: at
		});

		for (const c of mine) {
			const channel = tx
				.update(channels)
				.set({ verifiedAt: at, verifiedByUserId: user.id })
				.where(eq(channels.youtubeChannelId, c.youtubeChannelId))
				.returning({ id: channels.id })
				.get();
			writeAudit(tx, {
				...actor,
				entity: 'channel',
				entityId: channel.id,
				before: { verifiedAt: null, verifiedByUserId: null },
				after: { verifiedAt: at.toISOString(), verifiedByUserId: user.id },
				createdAt: at
			});
			tx.insert(claims)
				.values({
					userId: user.id,
					creatorId: input.creatorId,
					youtubeChannelId: c.youtubeChannelId,
					status: 'verified',
					createdAt: at
				})
				.run();
		}
		return { ok: true, creatorId: input.creatorId, channels: mine.length };
	});
}
