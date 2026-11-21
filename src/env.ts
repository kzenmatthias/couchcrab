import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => value || undefined;

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'Path to the SQLite database file. Defaults to ./data/couchcrab.db.',
		schema: optional
	},
	YOUTUBE_API_KEY: {
		description:
			'YouTube Data API v3 key for `npm run sync`. Optional: without it the sync exits early.',
		schema: optional
	}
});
