import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { Cookies } from '@sveltejs/kit';
import { type DB, openDatabase } from '#lib/server/db/client.js';

/** A migrated in-memory database. */
export function testDatabase(): DB {
	const db = openDatabase(':memory:');
	migrate(db, { migrationsFolder: './src/lib/server/db/migrations' });
	return db;
}

/** A minimal in-memory stand-in for SvelteKit's `Cookies`. */
export function fakeCookies(initial: Record<string, string> = {}) {
	const jar = new Map(Object.entries(initial));
	const cookies = {
		get: (name: string) => jar.get(name),
		getAll: () => [...jar].map(([name, value]) => ({ name, value })),
		set: (name: string, value: string) => void jar.set(name, value),
		delete: (name: string) => void jar.delete(name),
		serialize: () => ''
	} as unknown as Cookies;
	return { cookies, jar };
}

type Route = (url: URL, init?: RequestInit) => Response;

/** A fake `fetch` that answers per URL prefix and records every call. */
export function fakeFetch(routes: Record<string, Route>) {
	const calls: { url: string; init?: RequestInit }[] = [];
	const fn = (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(input instanceof Request ? input.url : input.toString());
		calls.push({ url: url.toString(), init });
		const key = Object.keys(routes).find((prefix) => url.toString().startsWith(prefix));
		if (!key)
			return Promise.reject(new Error(`Unexpected request to ${url.origin}${url.pathname}`));
		return Promise.resolve(routes[key](url, init));
	};
	return { fetch: fn, calls };
}

export const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** An unsigned JWT with the given payload; only the payload is read. */
export function fakeIdToken(payload: Record<string, unknown>): string {
	const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
	return `${part({ alg: 'RS256', typ: 'JWT' })}.${part(payload)}.signature`;
}

/** The error a promise rejects with; fails the test when it resolves. */
export async function rejection(promise: Promise<unknown>): Promise<Error> {
	try {
		await promise;
	} catch (err) {
		return err as Error;
	}
	throw new Error('Expected the promise to reject');
}
