import { redirect } from '@sveltejs/kit';
import { providerConfig } from '#lib/server/auth/config.js';
import { discordAuthorizationUrl } from '#lib/server/auth/discord.js';
import { startOAuth } from '#lib/server/auth/oauth.js';
import { failSignIn, rememberReturnPath } from '#lib/server/auth/signin.js';
import type { RequestHandler } from './$types';

/** Starts Discord sign-in (or linking, when someone is signed in). */
export const GET: RequestHandler = ({ cookies, url }) => {
	const config = providerConfig('discord', url.origin);
	if (!config) failSignIn('not_configured');
	const { state, codeVerifier } = startOAuth(cookies, url, 'discord');
	rememberReturnPath(cookies, url);
	redirect(302, discordAuthorizationUrl(config, state, codeVerifier).toString());
};
