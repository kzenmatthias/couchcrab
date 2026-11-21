/** Users and roles (admin only). */
import { and, asc, count, eq, like, ne } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import * as t from '../db/schema.js';
import {
	type Actor,
	assertRole,
	auditUser,
	Checker,
	type Input,
	NotFoundError,
	oneOf,
	type Role
} from './core.js';

export const ROLES = ['viewer', 'editor', 'admin'] as const satisfies readonly Role[];

export function listUsers(db: DB, actor: Actor, search = '') {
	assertRole(actor, 'admin');
	const q = search.trim();
	const pattern = `%${q.replace(/[%_\\]/g, (ch) => `\\${ch}`)}%`;
	return db
		.select({
			id: t.users.id,
			name: t.users.name,
			role: t.users.role,
			discordId: t.users.discordId,
			googleSub: t.users.googleSub,
			createdAt: t.users.createdAt,
			creatorName: t.creators.name,
			creatorSlug: t.creators.slug
		})
		.from(t.users)
		.leftJoin(t.creators, eq(t.creators.id, t.users.creatorId))
		.where(q ? like(t.users.name, pattern) : undefined)
		.orderBy(asc(t.users.name), asc(t.users.id))
		.all()
		.map(({ discordId, googleSub, ...u }) => ({
			...u,
			providers: [...(discordId ? ['discord'] : []), ...(googleSub ? ['google'] : [])] as (
				'discord' | 'google'
			)[]
		}));
}

/**
 * Changes a user's role. The last admin cannot be demoted (also not by themselves), so the
 * management tool always keeps someone who can manage it.
 */
export function setUserRole(db: DB, actor: Actor, userId: number, input: Input) {
	assertRole(actor, 'admin');
	const c = new Checker();
	const role = oneOf(c, input, 'role', ROLES);
	c.done();
	return db.transaction((tx) => {
		const before = tx
			.select({ id: t.users.id, role: t.users.role })
			.from(t.users)
			.where(eq(t.users.id, userId))
			.get();
		if (!before) throw new NotFoundError();
		if (before.role === role) return before;
		if (before.role === 'admin') {
			const others =
				tx
					.select({ n: count() })
					.from(t.users)
					.where(and(eq(t.users.role, 'admin'), ne(t.users.id, userId)))
					.get()?.n ?? 0;
			if (others === 0) {
				const check = new Checker();
				check.fail('role', 'last_admin');
				check.done();
			}
		}
		tx.update(t.users).set({ role }).where(eq(t.users.id, userId)).run();
		auditUser(tx, actor, 'user', userId, { role: before.role }, { role });
		return { id: userId, role };
	});
}
