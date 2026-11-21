/**
 * `npm run catalog:import`: loads a starter catalog (creators, channels, series, sessions and
 * title rules) from a JSON file. Safe to run again: it only adds and updates, never deletes.
 *
 *   npm run catalog:import -- <file> [--dry-run]
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { openDatabase } from '../src/lib/server/db/client';
import {
	formatImportSummary,
	importCatalog,
	parseCatalog
} from '../src/lib/server/manage/catalog-import';
import { locales } from '../src/lib/paraglide/runtime.js';

const USAGE = 'Usage: npm run catalog:import -- <file.json> [--dry-run]';

try {
	process.loadEnvFile();
} catch {
	// No .env file: use the environment as it is.
}

let parsed;
try {
	parsed = parseArgs({
		allowPositionals: true,
		options: {
			'dry-run': { type: 'boolean', default: false },
			help: { type: 'boolean', short: 'h', default: false }
		}
	});
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	console.error(USAGE);
	process.exit(2);
}

if (parsed.values.help) {
	console.log(`${USAGE}

  <file.json>  The catalog: creators with channels, series with sessions and title rules.
               See "Starter catalog" in the README for the format.
  --dry-run    Check and evaluate everything, but write nothing.

Creators match by slug (or one of their channels), series by slug. Running it again changes
nothing; an edited file updates what it lists. Nothing that is not in the file is deleted.`);
	process.exit(0);
}

const [file, ...extra] = parsed.positionals;
if (!file || extra.length > 0) {
	console.error(USAGE);
	process.exit(2);
}

let raw: unknown;
try {
	raw = JSON.parse(readFileSync(file, 'utf8'));
} catch (error) {
	console.error(
		`Could not read ${file}: ${error instanceof Error ? error.message : String(error)}`
	);
	process.exit(1);
}

const checked = parseCatalog(raw, locales);
if (!checked.ok) {
	console.error(`${file} has ${checked.problems.length} problem(s); nothing was written:`);
	for (const p of checked.problems) console.error(`  ${p}`);
	process.exit(1);
}

const db = openDatabase(process.env.DATABASE_URL);
try {
	const summary = importCatalog(db, checked.catalog, {
		locales,
		dryRun: parsed.values['dry-run']
	});
	if (summary.dryRun && summary.problems.length === 0)
		console.log('Dry run: nothing was written.\n');
	const text = formatImportSummary(summary);
	if (summary.problems.length > 0) console.error(text);
	else console.log(text);
	process.exitCode = summary.problems.length > 0 ? 1 : 0;
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
} finally {
	db.$client.close();
}
