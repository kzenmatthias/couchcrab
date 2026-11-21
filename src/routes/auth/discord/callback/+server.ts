import { redirect } from '@sveltejs/kit';
import { adminDiscordIds, providerConfig } from '#lib/server/auth/config.js';
import { fetchDiscordProfile } from '#lib/server/auth/discord.js';
import { checkCallback } from '#lib/server/auth/oauth.js';
import { establishSession, failSignIn, takeReturnPath } from '#lib/server/auth/signin.js';
import { upsertDiscordUser } from '#lib/server/auth/users.js';
import { db } from '#lib/server/db/index.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const { cookies, url, locals, fetch } = event;
	const config = providerConfig('discord', url.origin);
	if (!config) failSignIn('not_configured');
	const check = checkCallback(cookies, url, 'discord');
	if (!check.ok) failSignIn(check.reason);
	const returnTo = takeReturnPath(cookies);

	let profile;
	try {
		profile = await fetchDiscordProfile(fetch, config, check.code, check.codeVerifier);
	} catch (err) {
		console.error('Discord sign-in failed:', err instanceof Error ? err.message : 'unknown error');
		failSignIn('provider');
	}
	const result = upsertDiscordUser(db, profile, {
		currentUserId: locals.user?.id ?? null,
		adminDiscordIds
	});
	if (!result.ok) failSignIn(result.reason);
	establishSession(db, event, result.userId);
	redirect(303, returnTo);
};
