/**
 * Google OAuth 2 for creators (scopes `openid` and `youtube.readonly`, with PKCE).
 * The access token is used once, for `channels.list?mine=true`, and then dropped: it is never
 * stored, returned or logged.
 */
import type { OwnedChannel } from '../db/schema.js';
import type { ProviderConfig } from './discord.js';
import { authorizationUrl, exchangeCode, OAuthError, type Fetch } from './oauth.js';

export const GOOGLE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_CHANNELS_URL =
	'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=50';
export const GOOGLE_SCOPES = ['openid', 'https://www.googleapis.com/auth/youtube.readonly'];
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

export function googleAuthorizationUrl(config: ProviderConfig, state: string, verifier: string) {
	return authorizationUrl(GOOGLE_AUTHORIZE_URL, {
		clientId: config.clientId,
		redirectUri: config.redirectUri,
		scopes: GOOGLE_SCOPES,
		state,
		codeVerifier: verifier,
		// Ask for the channel picker every time, so a creator with several Google accounts can choose.
		extra: { prompt: 'select_account' }
	});
}

/**
 * Reads `sub` from the ID token. The token comes straight from Google's token endpoint over TLS,
 * so per OpenID Connect Core 3.1.3.7 the TLS check replaces a signature check; issuer, audience
 * and expiry are still checked.
 */
export function googleSubFromIdToken(idToken: string | undefined, clientId: string, now: Date) {
	const payload = idToken?.split('.')[1];
	if (!payload) throw new OAuthError('Google sent no ID token');
	let claims: { sub?: unknown; iss?: unknown; aud?: unknown; exp?: unknown };
	try {
		claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as typeof claims;
	} catch {
		throw new OAuthError('Google ID token is not readable');
	}
	const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
	if (typeof claims.iss !== 'string' || !GOOGLE_ISSUERS.has(claims.iss)) {
		throw new OAuthError('Google ID token has the wrong issuer');
	}
	if (!audience.includes(clientId)) throw new OAuthError('Google ID token has the wrong audience');
	if (typeof claims.exp !== 'number' || claims.exp * 1000 < now.getTime()) {
		throw new OAuthError('Google ID token has expired');
	}
	if (typeof claims.sub !== 'string' || !claims.sub)
		throw new OAuthError('Google ID token has no sub');
	return claims.sub;
}

interface ApiChannelList {
	items?: { id?: unknown; snippet?: { title?: unknown } }[];
}

export function parseOwnedChannels(json: ApiChannelList): OwnedChannel[] {
	const seen = new Set<string>();
	const owned: OwnedChannel[] = [];
	for (const item of json.items ?? []) {
		if (typeof item.id !== 'string' || !/^UC[\w-]{22}$/.test(item.id) || seen.has(item.id))
			continue;
		seen.add(item.id);
		const title = typeof item.snippet?.title === 'string' ? item.snippet.title.trim() : '';
		owned.push({ id: item.id, title: (title || item.id).slice(0, 200) });
	}
	return owned;
}

export interface GoogleResult {
	sub: string;
	channels: OwnedChannel[];
}

/** Exchanges the code, reads `sub`, asks YouTube once which channels the account owns. */
export async function fetchGoogleAccount(
	fetchFn: Fetch,
	config: ProviderConfig,
	code: string,
	codeVerifier: string,
	now = new Date()
): Promise<GoogleResult> {
	const tokens = await exchangeCode(fetchFn, GOOGLE_TOKEN_URL, { ...config, code, codeVerifier });
	const sub = googleSubFromIdToken(tokens.id_token, config.clientId, now);
	const response = await fetchFn(GOOGLE_CHANNELS_URL, {
		headers: { authorization: `Bearer ${tokens.access_token}`, accept: 'application/json' }
	});
	if (!response.ok)
		throw new OAuthError(`YouTube channels.list failed with HTTP ${response.status}`);
	const channels = parseOwnedChannels((await response.json()) as ApiChannelList);
	return { sub, channels };
}
