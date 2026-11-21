/**
 * Sync adapter interface: lets a later round keep the prefs and progress of a signed-in viewer
 * on the server. Without an adapter everything stays in this browser.
 */
import type { Prefs } from './schema.js';
import { mergeProgress, type ProgressMap } from './progress.js';

export type SyncSnapshot = { prefs: Prefs; progress: ProgressMap };

export interface PrefsSyncAdapter {
	/** The account's copy, or null when the account has none yet. Called once on connect. */
	pull(): Promise<SyncSnapshot | null>;
	/** Saves the merged copy. Called on connect and (debounced) after every local change. */
	push(snapshot: SyncSnapshot): Promise<void>;
}

/**
 * Merges the browser's copy with the account's: the prefs changed last win as a whole (they
 * are edited together on the settings pages); progress is merged per video, newest first.
 */
export function mergeSnapshots(local: SyncSnapshot, remote: SyncSnapshot | null): SyncSnapshot {
	if (!remote) return local;
	return {
		prefs: remote.prefs.updatedAt > local.prefs.updatedAt ? remote.prefs : local.prefs,
		progress: mergeProgress(local.progress, remote.progress)
	};
}
