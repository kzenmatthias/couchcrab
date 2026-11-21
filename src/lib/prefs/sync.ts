/**
 * Account sync: the adapter interface and the merge rules. Pure module, unit tested.
 *
 * Without an adapter everything stays in this browser. With one (a signed-in viewer) the
 * account is the source of truth and the browser keeps a cache that is merged on connect.
 */
import {
	cleanIds,
	isItemKey,
	prefItems,
	setPrefItem,
	type CreatorChoice,
	type Prefs,
	type SeriesChoice
} from './schema.js';
import { mergeProgress, type ProgressMap } from './progress.js';

export type SyncSnapshot = { prefs: Prefs; progress: ProgressMap };

export type PushOptions = {
	/** Send with `keepalive`, so the request survives the page being closed. */
	keepalive?: boolean;
};

export interface PrefsSyncAdapter {
	/** The account's copy, or null when the account has none yet. Called once on connect. */
	pull(): Promise<SyncSnapshot | null>;
	/** Saves the whole prefs. Rejects on failure (the store retries). */
	pushPrefs(prefs: Prefs, options?: PushOptions): Promise<void>;
	/** Saves a batch of progress entries (at most `PROGRESS_BATCH_MAX`). Rejects on failure. */
	pushProgress(entries: ProgressMap, options?: PushOptions): Promise<void>;
}

/** Progress entries per request. Also the limit of `POST /api/me/progress`. */
export const PROGRESS_BATCH_MAX = 100;

export type MergeOptions = {
	/**
	 * The first merge of this browser into this account: lists of creators that both sides
	 * chose are combined, so nothing picked before signing in is lost. Later merges only take
	 * the newest item.
	 */
	first?: boolean;
};

const stampOf = (p: Prefs, key: string) => p.stamps[key] ?? 0;

const union = (a: readonly number[], b: readonly number[]) => cleanIds([...a, ...b]);

/** The union of two creator choices that are both set: everyone wins over a list. */
function unionCreators(a: CreatorChoice, b: CreatorChoice): CreatorChoice {
	if (a.mode === 'all' || b.mode === 'all') return { mode: 'all' };
	return { mode: 'list', ids: union(a.ids, b.ids) };
}

function unionSeries(a: unknown, b: unknown): SeriesChoice | null {
	const x = a as SeriesChoice | undefined;
	const y = b as SeriesChoice | undefined;
	if (x?.mode === 'custom' && y?.mode === 'custom')
		return { mode: 'custom', ids: union(x.ids, y.ids) };
	return null;
}

/**
 * Merges two copies of the prefs item by item: per item the newest stamp wins (on a tie the
 * local copy). On the first merge, creator lists set on both sides are combined instead.
 */
export function mergePrefs(local: Prefs, remote: Prefs, options: MergeOptions = {}): Prefs {
	const a = prefItems(local);
	const b = prefItems(remote);
	const keys = new Set(
		[
			...Object.keys(a),
			...Object.keys(b),
			...Object.keys(local.stamps),
			...Object.keys(remote.stamps)
		].filter(isItemKey)
	);
	const out: Prefs = structuredClone(local);
	for (const key of keys) {
		const lt = stampOf(local, key);
		const rt = stampOf(remote, key);
		if (options.first && lt > 0 && rt > 0) {
			if (key === 'creators') {
				setPrefItem(out, key, unionCreators(local.creators, remote.creators));
				out.stamps[key] = Math.max(lt, rt);
				continue;
			}
			if (key.startsWith('series.')) {
				const combined = unionSeries(a[key], b[key]);
				if (combined) {
					setPrefItem(out, key, combined);
					out.stamps[key] = Math.max(lt, rt);
					continue;
				}
			}
		}
		if (rt > lt) {
			setPrefItem(out, key, structuredClone(b[key]));
			out.stamps[key] = rt;
		}
	}
	out.updatedAt = Math.max(local.updatedAt, remote.updatedAt);
	return out;
}

/** Merges the browser's copy with the account's: prefs item by item, progress per video. */
export function mergeSnapshots(
	local: SyncSnapshot,
	remote: SyncSnapshot | null,
	options: MergeOptions = {}
): SyncSnapshot {
	if (!remote) return local;
	return {
		prefs: mergePrefs(local.prefs, remote.prefs, options),
		progress: mergeProgress(local.progress, remote.progress)
	};
}

const seconds = (ms: number) => Math.floor(ms / 1000);

/**
 * Progress entries the account does not have yet: missing there or newer here. The account
 * keeps whole seconds, so a difference below a second is not a change. `since` skips entries
 * already pushed in an earlier visit.
 */
export function progressToPush(local: ProgressMap, remote: ProgressMap, since = 0): string[] {
	return Object.entries(local)
		.filter(([id, e]) => {
			if (e.updatedAt <= since) return false;
			const r = remote[id];
			if (!r) return true;
			return (
				seconds(e.updatedAt) > seconds(r.updatedAt) &&
				(r.seconds !== e.seconds || r.watched !== e.watched)
			);
		})
		.map(([id]) => id);
}

/** True when the account's prefs differ from the merged copy (so it needs a push). */
export function prefsDiffer(a: Prefs, b: Prefs): boolean {
	return JSON.stringify(normalize(a)) !== JSON.stringify(normalize(b));
}

function normalize(p: Prefs) {
	const sortKeys = (o: Record<string, unknown>) =>
		Object.fromEntries(Object.entries(o).sort(([x], [y]) => x.localeCompare(y)));
	return { items: sortKeys(prefItems(p)), stamps: sortKeys(p.stamps) };
}
