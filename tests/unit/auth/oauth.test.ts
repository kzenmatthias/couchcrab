import { describe, expect, it } from 'vitest';
import {
	DISCORD_TOKEN_URL,
	DISCORD_USER_URL,
	discordAuthorizationUrl,
	fetchDiscordProfile,
	parseDiscordUser
} from '#lib/server/auth/discord.js';
import {
	fetchGoogleAccount,
	GOOGLE_CHANNELS_URL,
	GOOGLE_TOKEN_URL,
	googleAuthorizationUrl,
	googleSubFromIdToken
} from '#lib/server/auth/google.js';
import {
	checkCallback,
	codeChallenge,
	exchangeCode,
	generateCodeVerifier,
	safeReturnPath,
	startOAuth,
	stateCookie,
	validateState,
	verifierCookie
} from '#lib/server/auth/oauth.js';
import { fakeCookies, fakeFetch, fakeIdToken, json, rejection } from './helpers.js';

const CONFIG = {
	clientId: 'client-id',
	clientSecret: 'client-secret',
	redirectUri: 'http://localhost:5173/auth/x/callback'
};
const ORIGIN = new URL('http://localhost:5173/auth/x');
const NOW = new Date('2026-11-01T12:00:00Z');
const ACCESS_TOKEN = 'ya29.fake-access-token';

describe('state', () => {
	it('must match the cookie exactly', () => {
		expect(validateState('abc', 'abc')).toBe(true);
		expect(validateState('abc', 'abd')).toBe(false);
		expect(validateState('abc', 'abcd')).toBe(false);
		expect(validateState(undefined, 'abc')).toBe(false);
		expect(validateState('abc', null)).toBe(false);
		expect(validateState('', '')).toBe(false);
	});
});

describe('PKCE', () => {
	it('uses S256: base64url(SHA-256(verifier)) without padding', () => {
		expect(codeChallenge('dBjftJeZ4CVP-mJ92ZqDOtfqoYNjFnZ0ZjCkWSEQq4w')).toBe(
			'NuSX0qnmG6AoJIFL-NW7rYpox6vwZ_Ecyh8sDBGEUUk'
		);
	});

	it('verifiers are 43 unreserved characters and random', () => {
		const v = generateCodeVerifier();
		expect(v).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(generateCodeVerifier()).not.toBe(v);
	});

	it('authorization URLs carry state, challenge and the right scopes', () => {
		const discord = discordAuthorizationUrl(CONFIG, 'st', 'verifier');
		expect(discord.origin + discord.pathname).toBe('https://discord.com/oauth2/authorize');
		expect(discord.searchParams.get('scope')).toBe('identify');
		expect(discord.searchParams.get('state')).toBe('st');
		expect(discord.searchParams.get('code_challenge')).toBe(codeChallenge('verifier'));
		expect(discord.searchParams.get('code_challenge_method')).toBe('S256');
		expect(discord.searchParams.get('redirect_uri')).toBe(CONFIG.redirectUri);

		const google = googleAuthorizationUrl(CONFIG, 'st', 'verifier');
		expect(google.searchParams.get('scope')).toBe(
			'openid https://www.googleapis.com/auth/youtube.readonly'
		);
		expect(google.searchParams.get('code_challenge_method')).toBe('S256');
		expect(google.searchParams.get('access_type')).toBeNull();
	});
});

describe('callback check', () => {
	const callback = (query: string) => new URL(`http://localhost:5173/auth/x/callback?${query}`);

	it('accepts the matching state and hands back the verifier', () => {
		const { cookies, jar } = fakeCookies();
		const { state, codeVerifier } = startOAuth(cookies, ORIGIN, 'google');
		const result = checkCallback(cookies, callback(`code=c1&state=${state}`), 'google');
		expect(result).toEqual({ ok: true, code: 'c1', codeVerifier });
		// One use only.
		expect(jar.has(stateCookie('google'))).toBe(false);
		expect(jar.has(verifierCookie('google'))).toBe(false);
	});

	it('rejects a wrong or missing state, a missing verifier and a replay', () => {
		const { cookies } = fakeCookies();
		const { state } = startOAuth(cookies, ORIGIN, 'discord');
		expect(checkCallback(cookies, callback('code=c1&state=forged'), 'discord')).toEqual({
			ok: false,
			reason: 'state'
		});
		// The cookies are gone after the first try, so the right state no longer works either.
		expect(checkCallback(cookies, callback(`code=c1&state=${state}`), 'discord')).toEqual({
			ok: false,
			reason: 'state'
		});
		const other = fakeCookies({ [stateCookie('discord')]: 's' });
		expect(checkCallback(other.cookies, callback('code=c1&state=s'), 'discord').ok).toBe(false);
	});

	it('does not accept the state of the other provider', () => {
		const { cookies } = fakeCookies();
		const { state } = startOAuth(cookies, ORIGIN, 'discord');
		expect(checkCallback(cookies, callback(`code=c&state=${state}`), 'google').ok).toBe(false);
	});

	it('reports a provider error as denied', () => {
		const { cookies } = fakeCookies();
		const { state } = startOAuth(cookies, ORIGIN, 'google');
		expect(
			checkCallback(cookies, callback(`error=access_denied&state=${state}`), 'google')
		).toEqual({ ok: false, reason: 'denied' });
	});
});

describe('token exchange', () => {
	it('sends code and verifier and never puts the secret in an error', async () => {
		const { fetch, calls } = fakeFetch({ [DISCORD_TOKEN_URL]: () => json({ error: 'x' }, 400) });
		const error = await rejection(
			exchangeCode(fetch, DISCORD_TOKEN_URL, {
				...CONFIG,
				code: 'c',
				codeVerifier: 'v'
			})
		);
		expect(error).toBeInstanceOf(Error);
		expect(error.message).not.toContain('client-secret');
		const body = new URLSearchParams(calls[0].init!.body as URLSearchParams);
		expect(body.get('code_verifier')).toBe('v');
		expect(body.get('grant_type')).toBe('authorization_code');
	});
});

describe('Discord profile', () => {
	it('reads id, display name and avatar', async () => {
		const { fetch, calls } = fakeFetch({
			[DISCORD_TOKEN_URL]: () => json({ access_token: 'discord-token', token_type: 'Bearer' }),
			[DISCORD_USER_URL]: () =>
				json({ id: '123456789', username: 'crab', global_name: 'Crab Fan', avatar: 'abc123' })
		});
		const profile = await fetchDiscordProfile(fetch, CONFIG, 'code', 'verifier');
		expect(profile).toEqual({
			discordId: '123456789',
			name: 'Crab Fan',
			avatarUrl: 'https://cdn.discordapp.com/avatars/123456789/abc123.png?size=96'
		});
		expect(new Headers(calls[1].init!.headers).get('authorization')).toBe('Bearer discord-token');
	});

	it('rejects a profile without a numeric id', () => {
		expect(() => parseDiscordUser({ id: '../x' })).toThrow();
		expect(parseDiscordUser({ id: '5', username: 'u', avatar: '<bad>' }).avatarUrl).toBeNull();
	});
});

describe('Google account', () => {
	const idToken = (extra: Record<string, unknown> = {}) =>
		fakeIdToken({
			iss: 'https://accounts.google.com',
			aud: CONFIG.clientId,
			sub: 'google-sub-1',
			exp: NOW.getTime() / 1000 + 600,
			...extra
		});

	it('reads sub, lists owned channels once and returns no token', async () => {
		const { fetch, calls } = fakeFetch({
			[GOOGLE_TOKEN_URL]: () => json({ access_token: ACCESS_TOKEN, id_token: idToken() }),
			[GOOGLE_CHANNELS_URL]: () =>
				json({
					items: [
						{ id: 'UCowned00000000000000001', snippet: { title: 'Pebble Plays' } },
						{ id: 'UCowned00000000000000001', snippet: { title: 'Duplicate' } },
						{ id: 'not-a-channel', snippet: { title: 'Bad' } },
						{ id: 'UCowned00000000000000002', snippet: {} }
					]
				})
		});
		const result = await fetchGoogleAccount(fetch, CONFIG, 'code', 'verifier', NOW);
		expect(result).toEqual({
			sub: 'google-sub-1',
			channels: [
				{ id: 'UCowned00000000000000001', title: 'Pebble Plays' },
				{ id: 'UCowned00000000000000002', title: 'UCowned00000000000000002' }
			]
		});
		expect(JSON.stringify(result)).not.toContain(ACCESS_TOKEN);
		const channelCalls = calls.filter((c) => c.url.startsWith(GOOGLE_CHANNELS_URL));
		expect(channelCalls).toHaveLength(1);
		expect(channelCalls[0].url).toContain('mine=true');
		expect(new Headers(channelCalls[0].init!.headers).get('authorization')).toBe(
			`Bearer ${ACCESS_TOKEN}`
		);
	});

	it('rejects ID tokens for another client, another issuer or expired ones', () => {
		expect(() => googleSubFromIdToken(idToken({ aud: 'other' }), CONFIG.clientId, NOW)).toThrow(
			/audience/
		);
		expect(() =>
			googleSubFromIdToken(idToken({ iss: 'https://evil.example' }), CONFIG.clientId, NOW)
		).toThrow(/issuer/);
		expect(() =>
			googleSubFromIdToken(idToken({ exp: NOW.getTime() / 1000 - 1 }), CONFIG.clientId, NOW)
		).toThrow(/expired/);
		expect(() => googleSubFromIdToken(undefined, CONFIG.clientId, NOW)).toThrow();
		expect(googleSubFromIdToken(idToken(), CONFIG.clientId, NOW)).toBe('google-sub-1');
	});

	it('fails without leaking the token when YouTube refuses', async () => {
		const { fetch } = fakeFetch({
			[GOOGLE_TOKEN_URL]: () => json({ access_token: ACCESS_TOKEN, id_token: idToken() }),
			[GOOGLE_CHANNELS_URL]: () => json({ error: { code: 403 } }, 403)
		});
		const error = await rejection(fetchGoogleAccount(fetch, CONFIG, 'code', 'v', NOW));
		expect(error.message).toMatch(/403/);
		expect(error.message).not.toContain(ACCESS_TOKEN);
	});
});

describe('return path', () => {
	it('only allows same-site paths', () => {
		expect(safeReturnPath('/series/x?y=1')).toBe('/series/x?y=1');
		expect(safeReturnPath('//evil.example')).toBe('/');
		expect(safeReturnPath('/\\evil.example')).toBe('/');
		expect(safeReturnPath('https://evil.example')).toBe('/');
		expect(safeReturnPath(null)).toBe('/');
	});
});
