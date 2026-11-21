/**
 * The `PrefsSyncAdapter` for a signed-in viewer: talks to `/api/me/*` with the session cookie.
 * Every method rejects on a network or HTTP error; the store decides when to retry.
 */
import { migratePrefs } from './schema.js';
import { cleanProgress, type ProgressMap } from './progress.js';
import type { PrefsSyncAdapter, PushOptions, SyncSnapshot } from './sync.js';

export const SNAPSHOT_URL = '/api/me/snapshot';
export const PROGRESS_URL = '/api/me/progress';

type Fetch = typeof fetch;

export function accountSyncAdapter(fetchFn: Fetch = fetch): PrefsSyncAdapter {
	async function send(url: string, method: string, body: unknown, options: PushOptions = {}) {
		const res = await fetchFn(url, {
			method,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
			credentials: 'same-origin',
			keepalive: options.keepalive ?? false
		});
		if (!res.ok) throw new Error(`${method} ${url}: ${res.status}`);
	}

	return {
		async pull(): Promise<SyncSnapshot | null> {
			const res = await fetchFn(SNAPSHOT_URL, {
				credentials: 'same-origin',
				headers: { accept: 'application/json' }
			});
			if (!res.ok) throw new Error(`GET ${SNAPSHOT_URL}: ${res.status}`);
			const data = (await res.json()) as { prefs: unknown; progress: unknown };
			const progress: ProgressMap = cleanProgress(data.progress);
			if (data.prefs === null && !Object.keys(progress).length) return null;
			return { prefs: migratePrefs(data.prefs), progress };
		},
		pushPrefs: (prefs, options) => send(SNAPSHOT_URL, 'PUT', { prefs }, options),
		pushProgress: (entries, options) => send(PROGRESS_URL, 'POST', { entries }, options)
	};
}
