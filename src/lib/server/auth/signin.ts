/** Shared steps of the sign-in routes. */
import { redirect, type Cookies, type RequestEvent } from '@sveltejs/kit';
import type { DB } from '../db/client.js';
import { safeReturnPath } from './oauth.js';
import { createSession, invalidateSession, secureCookies, setSessionCookie } from './session.js';

export const SIGNIN_ERRORS = [
	'not_configured',
	'denied',
	'state',
	'provider',
	'linked_elsewhere',
	'other_account_linked'
] as const;
export type SignInError = (typeof SIGNIN_ERRORS)[number];

const RETURN_COOKIE = 'oauth_return';

/** Back to the sign-in page with an error code it explains. */
export function failSignIn(reason: SignInError): never {
	redirect(303, `/signin?error=${reason}`);
}

export function rememberReturnPath(cookies: Cookies, url: URL) {
	cookies.set(RETURN_COOKIE, safeReturnPath(url.searchParams.get('redirect_to')), {
		path: '/auth',
		httpOnly: true,
		sameSite: 'lax',
		secure: secureCookies(url),
		maxAge: 600
	});
}

export function takeReturnPath(cookies: Cookies): string {
	const value = cookies.get(RETURN_COOKIE);
	cookies.delete(RETURN_COOKIE, { path: '/auth' });
	return safeReturnPath(value);
}

/**
 * Signs the user in. Keeps the current session when it already belongs to this user (linking),
 * otherwise replaces it with a new one. Returns the session id.
 */
export function establishSession(db: DB, event: RequestEvent, userId: number): string {
	const { locals, cookies, url } = event;
	if (locals.user?.id === userId && locals.sessionId) return locals.sessionId;
	if (locals.sessionId) invalidateSession(db, locals.sessionId);
	const session = createSession(db, userId);
	setSessionCookie(cookies, url, session.token, session.expiresAt);
	return session.id;
}
