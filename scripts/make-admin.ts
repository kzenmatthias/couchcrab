/**
 * `npm run make-admin -- <user id>`: gives a user the admin role, for a first admin on a local
 * or fresh install. Sign in once first so the user exists; `/manage/users` lists the ids.
 */
import { eq } from 'drizzle-orm';
import { openDatabase } from '../src/lib/server/db/client';
import { users } from '../src/lib/server/db/schema';

try {
	process.loadEnvFile();
} catch {
	// No .env file: use the environment as it is.
}

const id = Number(process.argv[2]);
if (!Number.isInteger(id) || id <= 0) {
	console.error('Usage: npm run make-admin -- <user id>');
	process.exit(2);
}

const db = openDatabase(process.env.DATABASE_URL);
try {
	const user = db
		.select({ id: users.id, name: users.name })
		.from(users)
		.where(eq(users.id, id))
		.get();
	if (!user) {
		console.error(`No user with id ${id}. Sign in once first, then run this again.`);
		process.exitCode = 1;
	} else {
		db.update(users).set({ role: 'admin' }).where(eq(users.id, id)).run();
		console.log(`${user.name} (id ${id}) is now an admin.`);
	}
} finally {
	db.$client.close();
}
