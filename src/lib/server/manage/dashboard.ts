/** Counts and the last sync per channel for the management dashboard. */
import { asc, count, eq } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import * as t from '../db/schema.js';
import { type Actor, assertRole } from './core.js';

export function dashboard(db: DB, actor: Actor) {
	assertRole(actor, 'editor');
	const n = (rows: { n: number }[]) => rows[0]?.n ?? 0;
	return {
		unsorted: n(
			db.select({ n: count() }).from(t.videos).where(eq(t.videos.status, 'unsorted')).all()
		),
		pendingClaims: n(
			db.select({ n: count() }).from(t.claims).where(eq(t.claims.status, 'pending_review')).all()
		),
		creators: n(db.select({ n: count() }).from(t.creators).all()),
		series: n(db.select({ n: count() }).from(t.series).all()),
		channels: db
			.select({
				id: t.channels.id,
				title: t.channels.title,
				youtubeChannelId: t.channels.youtubeChannelId,
				syncEnabled: t.channels.syncEnabled,
				lastSyncedAt: t.channels.lastSyncedAt,
				creatorId: t.creators.id,
				creatorName: t.creators.name
			})
			.from(t.channels)
			.innerJoin(t.creators, eq(t.creators.id, t.channels.creatorId))
			.orderBy(asc(t.creators.name), asc(t.channels.id))
			.all()
	};
}
