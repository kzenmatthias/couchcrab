/**
 * Runs service-layer writes inside one transaction and hands back the audit entries they wrote,
 * so the caller can tag them (with the suggestion they came from, or the entry they revert).
 *
 * better-sqlite3 is synchronous and Drizzle runs a nested `transaction()` as a savepoint, so the
 * service functions (which open their own transaction) can run on the outer transaction.
 */
import { gt, max } from 'drizzle-orm';
import type { DB } from '../db/client.js';
import * as t from '../db/schema.js';

export function runTagged<T>(
	db: DB,
	write: (tx: DB) => T,
	finish: (tx: DB, entryIds: number[], result: T) => void
): T {
	return db.transaction((outer) => {
		const tx = outer as unknown as DB;
		const last =
			tx
				.select({ id: max(t.auditLog.id) })
				.from(t.auditLog)
				.get()?.id ?? 0;
		const result = write(tx);
		const ids = tx
			.select({ id: t.auditLog.id })
			.from(t.auditLog)
			.where(gt(t.auditLog.id, last))
			.all()
			.map((r) => r.id)
			.sort((a, b) => a - b);
		finish(tx, ids, result);
		return result;
	});
}
