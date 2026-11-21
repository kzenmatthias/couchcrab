/**
 * Applies the Drizzle migrations to the database in DATABASE_URL.
 * `--fresh` deletes the database file first (used by the e2e tests).
 */
import { rmSync } from 'node:fs';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { databasePath, openDatabase } from '../src/lib/server/db/client';

const path = databasePath(process.env.DATABASE_URL);

if (process.argv.includes('--fresh') && path !== ':memory:') {
	for (const suffix of ['', '-wal', '-shm', '-journal']) rmSync(path + suffix, { force: true });
}

const db = openDatabase(path);
migrate(db, { migrationsFolder: './src/lib/server/db/migrations' });
db.$client.close();
console.log(`Migrated ${path}`);
