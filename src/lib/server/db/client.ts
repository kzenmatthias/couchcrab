import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

export const DEFAULT_DATABASE_URL = './data/couchcrab.db';

/** Turns `DATABASE_URL` into a file path. Accepts a plain path or a `file:` URL. */
export function databasePath(url: string | undefined): string {
	const value = url?.trim() || DEFAULT_DATABASE_URL;
	return value.startsWith('file:') ? value.slice('file:'.length) : value;
}

/** Opens (and creates if needed) the SQLite database. Used by the app and the scripts. */
export function openDatabase(url: string | undefined) {
	const path = databasePath(url);
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
	const client = new Database(path);
	client.pragma('journal_mode = WAL');
	client.pragma('foreign_keys = ON');
	return drizzle(client, { schema });
}

export type DB = ReturnType<typeof openDatabase>;
