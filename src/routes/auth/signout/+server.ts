import { redirect } from '@sveltejs/kit';
import { safeReturnPath } from '#lib/server/auth/oauth.js';
import { deleteSessionCookie, invalidateSession } from '#lib/server/auth/session.js';
import { db } from '#lib/server/db/index.js';
import type { RequestHandler } from './$types';

/**
 * Signs out. POST only: SvelteKit rejects cross-site form posts (origin check), so another site
 * cannot sign you out. Deleting the session also deletes its claim check.
 */
export const POST: RequestHandler = async ({ request, locals, cookies, url }) => {
	if (locals.sessionId) invalidateSession(db, locals.sessionId);
	deleteSessionCookie(cookies, url);
	const form = await request.formData().catch(() => null);
	const target = form?.get('redirect_to');
	redirect(303, safeReturnPath(typeof target === 'string' ? target : '/'));
};
