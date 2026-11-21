/**
 * `npm run sync`: fetches new uploads from YouTube, sorts them with the title rules and refreshes
 * stored API data older than 25 days.
 *
 *   npm run sync -- [--channel <youtube channel id>] [--dry-run] [--refresh-only]
 */
import { parseArgs } from 'node:util';
import { openDatabase } from '../src/lib/server/db/client';
import { createYouTubeClient } from '../src/lib/server/youtube/client';
import { formatSummary, runSync } from '../src/lib/server/youtube/sync';

try {
	process.loadEnvFile();
} catch {
	// No .env file: use the environment as it is.
}

let args;
try {
	args = parseArgs({
		options: {
			channel: { type: 'string' },
			'dry-run': { type: 'boolean', default: false },
			'refresh-only': { type: 'boolean', default: false },
			help: { type: 'boolean', short: 'h', default: false }
		}
	}).values;
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	console.error('Usage: npm run sync -- [--channel <youtube id>] [--dry-run] [--refresh-only]');
	process.exit(2);
}

if (args.help) {
	console.log(`Usage: npm run sync -- [options]

  --channel <id>   Only sync this YouTube channel id (UC...).
  --dry-run        Fetch and evaluate everything, but write nothing.
  --refresh-only   Only refresh stored videos older than 25 days.`);
	process.exit(0);
}

const apiKey = process.env.YOUTUBE_API_KEY?.trim();
if (!apiKey) {
	console.log(
		'YOUTUBE_API_KEY is not set, so there is nothing to sync. ' +
			'The demo data (npm run db:seed) works without it. ' +
			'To sync real uploads, add a YouTube Data API v3 key to .env.'
	);
	process.exit(0);
}

const db = openDatabase(process.env.DATABASE_URL);
try {
	const summary = await runSync({
		db,
		client: createYouTubeClient({ apiKey }),
		channel: args.channel,
		dryRun: args['dry-run'],
		refreshOnly: args['refresh-only']
	});
	if (summary.dryRun) console.log('Dry run: nothing was written.\n');
	console.log(formatSummary(summary, { actions: summary.dryRun }));
	const failed =
		summary.channels.some((c) => c.status === 'error') || (summary.refresh?.errors.length ?? 0) > 0;
	process.exitCode = failed ? 1 : 0;
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
} finally {
	db.$client.close();
}
