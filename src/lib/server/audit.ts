/**
 * Writes history entries to `audit_log`. Reverting comes with the management tool.
 */
import type { DB } from './db/client.js';
import { auditLog } from './db/schema.js';

/** The app database or a transaction on it. */
export type Executor = DB | Parameters<Parameters<DB['transaction']>[0]>[0];

export interface AuditEntry {
	/** `creator`: a claimed creator changing their own profile, channels or videos. */
	actor: 'user' | 'creator' | 'rule' | 'sync';
	/** Required when `actor` is `user` or `creator`. */
	actorUserId?: number | null;
	entity: string;
	entityId: number;
	before: Record<string, unknown> | null;
	after: Record<string, unknown> | null;
	createdAt?: Date;
}

export function writeAudit(db: Executor, entry: AuditEntry): number {
	if ((entry.actor === 'user' || entry.actor === 'creator') && entry.actorUserId == null) {
		throw new Error('An audit entry by a person needs actorUserId.');
	}
	const row = db
		.insert(auditLog)
		.values({
			actor: entry.actor,
			actorUserId: entry.actorUserId ?? null,
			entity: entry.entity,
			entityId: entry.entityId,
			before: entry.before,
			after: entry.after,
			...(entry.createdAt ? { createdAt: entry.createdAt } : {})
		})
		.returning({ id: auditLog.id })
		.get();
	return row.id;
}
