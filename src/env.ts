import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => value || undefined;

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'Path to the SQLite database file. Defaults to ./data/couchcrab.db.',
		schema: optional
	}
});
