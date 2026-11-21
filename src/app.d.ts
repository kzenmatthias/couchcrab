// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Theme } from '#lib/prefs/theme.js';
import type { SessionUser } from '#lib/server/auth/session.js';

declare global {
	namespace App {
		interface Locals {
			theme: Theme;
			/** The signed-in user, or null. Set in hooks.server.ts. */
			user: SessionUser | null;
			/** Hash of the session token (`sessions.id`), or null when signed out. */
			sessionId: string | null;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
