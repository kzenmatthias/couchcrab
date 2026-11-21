import { redirect } from '@sveltejs/kit';
import { m } from '#lib/paraglide/messages.js';
import { recordPendingReviews, saveClaimCheck } from '#lib/server/auth/claims.js';
import { providerConfig } from '#lib/server/auth/config.js';
import { fetchGoogleAccount } from '#lib/server/auth/google.js';
import { checkCallback } from '#lib/server/auth/oauth.js';
import { establishSession, failSignIn } from '#lib/server/auth/signin.js';
import { upsertGoogleUser } from '#lib/server/auth/users.js';
import { db } from '#lib/server/db/index.js';
import type { RequestHandler } from './$types';

/**
 * Finishes Google sign-in: one `channels.list?mine=true` call with the access token, which is
 * then dropped. Only the channel ids and titles go to the claim step.
 */
export const GET: RequestHandler = async (event) => {
	const { cookies, url, locals, fetch } = event;
	const config = providerConfig('google', url.origin);
	if (!config) failSignIn('not_configured');
	const check = checkCallback(cookies, url, 'google');
	if (!check.ok) failSignIn(check.reason);

	let account;
	try {
		account = await fetchGoogleAccount(fetch, config, check.code, check.codeVerifier);
	} catch (err) {
		console.error('Google sign-in failed:', err instanceof Error ? err.message : 'unknown error');
		failSignIn('provider');
	}
	const result = upsertGoogleUser(
		db,
		{ sub: account.sub, name: account.channels[0]?.title ?? m.account_default_name() },
		{ currentUserId: locals.user?.id ?? null }
	);
	if (!result.ok) failSignIn(result.reason);
	const sessionId = establishSession(db, event, result.userId);
	saveClaimCheck(db, { sessionId, userId: result.userId, channels: account.channels });
	recordPendingReviews(db, result.userId, account.channels);
	redirect(303, '/claim');
};
