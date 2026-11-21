/** "Sync now" in the management tool: the same `runSync` as `npm run sync`, started by an admin. */
import type { DB } from '../db/client.js';
import { createYouTubeClient, type YouTubeClient } from '../youtube/client.js';
import { runSync, type SyncSummary } from '../youtube/sync.js';
import { type Actor, assertRole } from './core.js';

/** A YouTube client for the API key, or null without one. */
export function youtubeClientFor(apiKey: string | undefined): YouTubeClient | null {
	return apiKey ? createYouTubeClient({ apiKey }) : null;
}

export async function syncNow(
	db: DB,
	actor: Actor,
	client: YouTubeClient | null,
	{ dryRun }: { dryRun: boolean }
): Promise<SyncSummary | null> {
	assertRole(actor, 'admin');
	if (!client) return null;
	return runSync({ db, client, dryRun });
}
