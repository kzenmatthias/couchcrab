import { eq } from 'drizzle-orm';
import type { DB } from '#lib/server/db/client.js';
import * as t from '#lib/server/db/schema.js';
import { seed } from '#lib/server/db/seed.js';
import type { Actor } from '#lib/server/manage/core.js';
import { testDatabase } from '../auth/helpers.js';

/** A migrated, seeded in-memory database with the demo viewer, editor and admin as actors. */
export function seeded() {
	const db = testDatabase();
	seed(db);
	const actor = (name: string): Actor => {
		const u = db.select().from(t.users).where(eq(t.users.name, name)).get()!;
		return { id: u.id, role: u.role };
	};
	return {
		db,
		viewer: actor('Demo Viewer'),
		editor: actor('Demo Editor'),
		admin: actor('Demo Admin')
	};
}

export const creatorBySlug = (db: DB, slug: string) =>
	db.select().from(t.creators).where(eq(t.creators.slug, slug)).get()!;

export const seriesBySlug = (db: DB, slug: string) =>
	db.select().from(t.series).where(eq(t.series.slug, slug)).get()!;

export const auditRows = (db: DB) => db.select().from(t.auditLog).all();

/** The newest audit entry. */
export const lastAudit = (db: DB) => auditRows(db).at(-1)!;
