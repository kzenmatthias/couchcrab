/** Discord OAuth 2 (scope `identify`, with PKCE). */
import { authorizationUrl, exchangeCode, OAuthError, type Fetch } from './oauth.js';

export const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
export const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
export const DISCORD_USER_URL = 'https://discord.com/api/users/@me';
export const DISCORD_SCOPES = ['identify'];

export interface ProviderConfig {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
}

export interface DiscordProfile {
	discordId: string;
	name: string;
	avatarUrl: string | null;
}

export function discordAuthorizationUrl(config: ProviderConfig, state: string, verifier: string) {
	return authorizationUrl(DISCORD_AUTHORIZE_URL, {
		clientId: config.clientId,
		redirectUri: config.redirectUri,
		scopes: DISCORD_SCOPES,
		state,
		codeVerifier: verifier
	});
}

interface ApiDiscordUser {
	id?: string;
	username?: string;
	global_name?: string | null;
	avatar?: string | null;
}

export function parseDiscordUser(json: ApiDiscordUser): DiscordProfile {
	if (typeof json.id !== 'string' || !/^\d{1,25}$/.test(json.id)) {
		throw new OAuthError('Discord user has no valid id');
	}
	const name = (json.global_name || json.username || '').trim() || json.id;
	const avatarUrl =
		json.avatar && /^(a_)?[0-9a-f]{1,64}$/.test(json.avatar)
			? `https://cdn.discordapp.com/avatars/${json.id}/${json.avatar}.png?size=96`
			: null;
	return { discordId: json.id, name: name.slice(0, 100), avatarUrl };
}

/** Exchanges the code, reads the profile and drops the token. */
export async function fetchDiscordProfile(
	fetchFn: Fetch,
	config: ProviderConfig,
	code: string,
	codeVerifier: string
): Promise<DiscordProfile> {
	const tokens = await exchangeCode(fetchFn, DISCORD_TOKEN_URL, { ...config, code, codeVerifier });
	const response = await fetchFn(DISCORD_USER_URL, {
		headers: { authorization: `Bearer ${tokens.access_token}`, accept: 'application/json' }
	});
	if (!response.ok) throw new OAuthError(`Discord profile failed with HTTP ${response.status}`);
	return parseDiscordUser((await response.json()) as ApiDiscordUser);
}
