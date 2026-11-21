/**
 * Shared OAuth 2 helpers: state and PKCE (S256), the short-lived cookies that carry them
 * across the redirect, and the token exchange. `fetch` is injected so tests never call a
 * provider. Tokens and secrets never end up in error messages or logs.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { secureCookies } from './session.js';

export type Provider = 'discord' | 'google';
export type Fetch = typeof fetch;

/** The sign-in round trip must finish within 10 minutes. */
export const OAUTH_COOKIE_MAX_AGE_S = 10 * 60;

export const stateCookie = (provider: Provider) => `oauth_${provider}_state`;
export const verifierCookie = (provider: Provider) => `oauth_${provider}_verifier`;

export function generateState(): string {
	return randomBytes(32).toString('base64url');
}

/** RFC 7636: 43 to 128 characters from the unreserved set. 32 bytes base64url gives 43. */
export function generateCodeVerifier(): string {
	return randomBytes(32).toString('base64url');
}

export function codeChallenge(verifier: string): string {
	return createHash('sha256').update(verifier).digest('base64url');
}

/** Constant-time comparison of the returned `state` with the one in the cookie. */
export function validateState(expected: string | undefined, received: string | null): boolean {
	if (!expected || !received) return false;
	const a = Buffer.from(expected);
	const b = Buffer.from(received);
	return a.length === b.length && timingSafeEqual(a, b);
}

export function authorizationUrl(
	endpoint: string,
	params: {
		clientId: string;
		redirectUri: string;
		scopes: string[];
		state: string;
		codeVerifier: string;
		extra?: Record<string, string>;
	}
): URL {
	const url = new URL(endpoint);
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('client_id', params.clientId);
	url.searchParams.set('redirect_uri', params.redirectUri);
	url.searchParams.set('scope', params.scopes.join(' '));
	url.searchParams.set('state', params.state);
	url.searchParams.set('code_challenge', codeChallenge(params.codeVerifier));
	url.searchParams.set('code_challenge_method', 'S256');
	for (const [key, value] of Object.entries(params.extra ?? {})) url.searchParams.set(key, value);
	return url;
}

const cookieOptions = (url: URL) =>
	({
		path: '/auth',
		httpOnly: true,
		sameSite: 'lax',
		secure: secureCookies(url),
		maxAge: OAUTH_COOKIE_MAX_AGE_S
	}) as const;

/** Creates state and verifier, stores them in cookies and returns them. */
export function startOAuth(cookies: Cookies, url: URL, provider: Provider) {
	const state = generateState();
	const codeVerifier = generateCodeVerifier();
	cookies.set(stateCookie(provider), state, cookieOptions(url));
	cookies.set(verifierCookie(provider), codeVerifier, cookieOptions(url));
	return { state, codeVerifier };
}

export type CallbackCheck =
	{ ok: true; code: string; codeVerifier: string } | { ok: false; reason: 'denied' | 'state' };

/**
 * Checks the callback request against the cookies and always deletes them, so a state can be
 * used only once.
 */
export function checkCallback(cookies: Cookies, url: URL, provider: Provider): CallbackCheck {
	const expected = cookies.get(stateCookie(provider));
	const codeVerifier = cookies.get(verifierCookie(provider));
	cookies.delete(stateCookie(provider), { path: '/auth' });
	cookies.delete(verifierCookie(provider), { path: '/auth' });

	if (url.searchParams.get('error')) return { ok: false, reason: 'denied' };
	const code = url.searchParams.get('code');
	if (!code || !codeVerifier || !validateState(expected, url.searchParams.get('state'))) {
		return { ok: false, reason: 'state' };
	}
	return { ok: true, code, codeVerifier };
}

export class OAuthError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'OAuthError';
	}
}

export interface TokenResponse {
	access_token: string;
	token_type?: string;
	id_token?: string;
	scope?: string;
}

/** Authorization code + PKCE verifier for tokens (client secret in the body). */
export async function exchangeCode(
	fetchFn: Fetch,
	endpoint: string,
	params: {
		clientId: string;
		clientSecret: string;
		redirectUri: string;
		code: string;
		codeVerifier: string;
	}
): Promise<TokenResponse> {
	const body = new URLSearchParams({
		grant_type: 'authorization_code',
		code: params.code,
		redirect_uri: params.redirectUri,
		client_id: params.clientId,
		client_secret: params.clientSecret,
		code_verifier: params.codeVerifier
	});
	const response = await fetchFn(endpoint, {
		method: 'POST',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			accept: 'application/json'
		},
		body
	});
	if (!response.ok) throw new OAuthError(`Token exchange failed with HTTP ${response.status}`);
	const json = (await response.json()) as Partial<TokenResponse>;
	if (typeof json.access_token !== 'string' || !json.access_token) {
		throw new OAuthError('Token response has no access token');
	}
	return json as TokenResponse;
}

/** Same-site path to return to after sign-in, never `//host` or a full URL. */
export function safeReturnPath(value: string | null | undefined): string {
	return typeof value === 'string' &&
		value.startsWith('/') &&
		!value.startsWith('//') &&
		!value.startsWith('/\\')
		? value
		: '/';
}
