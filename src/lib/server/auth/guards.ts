import { error } from '@sveltejs/kit';
import type { SessionUser } from './session.js';

type Role = SessionUser['role'];
const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };

/** The signed-in user, or a 401. */
export function requireUser(locals: App.Locals): SessionUser {
	if (!locals.user) error(401, 'Sign in first');
	return locals.user;
}

/** The signed-in user with at least `role` (an admin can do what an editor can), or 401/403. */
export function requireRole(locals: App.Locals, role: 'editor' | 'admin'): SessionUser {
	const user = requireUser(locals);
	if (RANK[user.role] < RANK[role]) error(403, 'Not allowed');
	return user;
}
