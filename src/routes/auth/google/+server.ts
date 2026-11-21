import { redirect } from '@sveltejs/kit';
import { providerConfig } from '#lib/server/auth/config.js';
import { googleAuthorizationUrl } from '#lib/server/auth/google.js';
import { startOAuth } from '#lib/server/auth/oauth.js';
import { failSignIn } from '#lib/server/auth/signin.js';
import type { RequestHandler } from './$types';

/** Starts Google sign-in for creators (or linking, when someone is signed in). */
export const GET: RequestHandler = ({ cookies, url }) => {
	const config = providerConfig('google', url.origin);
	if (!config) failSignIn('not_configured');
	const { state, codeVerifier } = startOAuth(cookies, url, 'google');
	redirect(302, googleAuthorizationUrl(config, state, codeVerifier).toString());
};
