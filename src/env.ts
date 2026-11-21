import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => value || undefined;

/** Comma-separated list, trimmed, empty entries dropped. */
const list = (value: string | undefined) =>
	(value ?? '')
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'Path to the SQLite database file. Defaults to ./data/couchcrab.db.',
		schema: optional
	},
	YOUTUBE_API_KEY: {
		description:
			'YouTube Data API v3 key for `npm run sync`. Optional: without it the sync exits early.',
		schema: optional
	},
	DISCORD_CLIENT_ID: {
		description: 'Discord OAuth client id. Optional: without it Discord sign-in is disabled.',
		schema: optional
	},
	DISCORD_CLIENT_SECRET: {
		description: 'Discord OAuth client secret. Optional: without it Discord sign-in is disabled.',
		schema: optional
	},
	GOOGLE_CLIENT_ID: {
		description: 'Google OAuth client id. Optional: without it Google sign-in is disabled.',
		schema: optional
	},
	GOOGLE_CLIENT_SECRET: {
		description: 'Google OAuth client secret. Optional: without it Google sign-in is disabled.',
		schema: optional
	},
	ADMIN_DISCORD_IDS: {
		description: 'Comma-separated Discord user ids that get the admin role on every sign-in.',
		schema: list
	}
});
