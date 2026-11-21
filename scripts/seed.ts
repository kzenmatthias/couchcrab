/** Replaces all data in the database with the fictional demo data. Run `npm run db:migrate` first. */
import { openDatabase } from '../src/lib/server/db/client';
import { clearDatabase, seed } from '../src/lib/server/db/seed';

const db = openDatabase(process.env.DATABASE_URL);
clearDatabase(db);
const summary = seed(db);
db.$client.close();
console.log(
	`Seeded ${summary.creators} creators, ${summary.series} series, ${summary.videos} videos, ${summary.pages} pages.`
);
