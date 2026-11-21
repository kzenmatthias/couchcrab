/** Provider settings from the environment. A provider without both keys is disabled. */
import {
	ADMIN_DISCORD_IDS,
	DISCORD_CLIENT_ID,
	DISCORD_CLIENT_SECRET,
	GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET
} from '$app/env/private';
import type { ProviderConfig } from './discord.js';
import type { Provider } from './oauth.js';

export function providerConfig(provider: Provider, origin: string): ProviderConfig | null {
	const [clientId, clientSecret] =
		provider === 'discord'
			? [DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET]
			: [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET];
	if (!clientId || !clientSecret) return null;
	return { clientId, clientSecret, redirectUri: `${origin}/auth/${provider}/callback` };
}

export function providersEnabled(): Record<Provider, boolean> {
	return {
		discord: Boolean(DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET),
		google: Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)
	};
}

export const adminDiscordIds: readonly string[] = ADMIN_DISCORD_IDS ?? [];
