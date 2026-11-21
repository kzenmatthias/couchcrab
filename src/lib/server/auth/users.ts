/**
 * Creates, updates and links users after a provider sign-in.
 *
 * - A known provider id signs in that user.
 * - When someone is already signed in and the provider id is new, it is linked to them, so one
 *   person can use Discord and Google on the same account.
 * - A provider id that belongs to another user is never moved: that is a conflict.
 */
import { eq } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import { users } from '../db/schema.js';
import type { DiscordProfile } from './discord.js';

export type LinkResult =
	| { ok: true; userId: number; created: boolean; linked: boolean }
	| { ok: false; reason: 'linked_elsewhere' | 'other_account_linked' };

/** Discord sign-in. Refreshes name and avatar, and makes listed ids admin every time. */
export function upsertDiscordUser(
	db: DB,
	profile: DiscordProfile,
	options: { currentUserId: number | null; adminDiscordIds: readonly string[] }
): LinkResult {
	const isAdmin = options.adminDiscordIds.includes(profile.discordId);
	return db.transaction((tx): LinkResult => {
		const existing = tx.select().from(users).where(eq(users.discordId, profile.discordId)).get();
		if (existing && options.currentUserId !== null && existing.id !== options.currentUserId) {
			return { ok: false, reason: 'linked_elsewhere' };
		}
		const updates = {
			name: profile.name,
			avatarUrl: profile.avatarUrl,
			...(isAdmin ? { role: 'admin' as const } : {})
		};
		if (existing) {
			tx.update(users).set(updates).where(eq(users.id, existing.id)).run();
			return { ok: true, userId: existing.id, created: false, linked: false };
		}
		if (options.currentUserId !== null) {
			const current = tx.select().from(users).where(eq(users.id, options.currentUserId)).get();
			if (current) {
				if (current.discordId) return { ok: false, reason: 'other_account_linked' };
				tx.update(users)
					.set({ ...updates, discordId: profile.discordId })
					.where(eq(users.id, current.id))
					.run();
				return { ok: true, userId: current.id, created: false, linked: true };
			}
		}
		const row = tx
			.insert(users)
			.values({ ...updates, discordId: profile.discordId })
			.returning({ id: users.id })
			.get();
		return { ok: true, userId: row.id, created: true, linked: false };
	});
}

/**
 * Google sign-in. A new Google-only user is named after their first channel (or `fallbackName`).
 * The name of an existing user is left alone: Discord stays the profile source when linked.
 */
export function upsertGoogleUser(
	db: DB,
	account: { sub: string; name: string },
	options: { currentUserId: number | null }
): LinkResult {
	return db.transaction((tx): LinkResult => {
		const existing = tx.select().from(users).where(eq(users.googleSub, account.sub)).get();
		if (existing) {
			if (options.currentUserId !== null && existing.id !== options.currentUserId) {
				return { ok: false, reason: 'linked_elsewhere' };
			}
			return { ok: true, userId: existing.id, created: false, linked: false };
		}
		if (options.currentUserId !== null) {
			const current = tx.select().from(users).where(eq(users.id, options.currentUserId)).get();
			if (current) {
				if (current.googleSub) return { ok: false, reason: 'other_account_linked' };
				tx.update(users).set({ googleSub: account.sub }).where(eq(users.id, current.id)).run();
				return { ok: true, userId: current.id, created: false, linked: true };
			}
		}
		const row = tx
			.insert(users)
			.values({ googleSub: account.sub, name: account.name.slice(0, 100) })
			.returning({ id: users.id })
			.get();
		return { ok: true, userId: row.id, created: true, linked: false };
	});
}
