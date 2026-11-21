// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Theme } from '#lib/prefs/theme.js';

declare global {
	namespace App {
		interface Locals {
			theme: Theme;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
