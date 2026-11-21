import { resolve } from '$app/paths';
import { m } from '#lib/paraglide/messages.js';

export type NavIcon = 'home' | 'series' | 'creators' | 'who';

export type MainNavItem = {
	href: string;
	label: string;
	/** The path that counts as this item's page when `href` redirects there. */
	current?: string;
	/** Set for the items of the bottom tab bar on narrow screens; Community is in the menu there. */
	icon?: NavIcon;
};

/** The main navigation: header links on wide screens, the bottom tab bar on narrow ones. */
export function mainNav(): MainNavItem[] {
	return [
		{ href: resolve('/(site)'), label: m.nav_home(), icon: 'home' },
		{ href: resolve('/(site)/series'), label: m.nav_series(), icon: 'series' },
		{ href: resolve('/(site)/creators'), label: m.nav_creators(), icon: 'creators' },
		{
			href: resolve('/(site)/[page]', { page: 'who-i-watch' }),
			label: m.nav_who_i_watch(),
			// /who-i-watch redirects to the creator settings.
			current: resolve('/(site)/settings/creators'),
			icon: 'who'
		},
		{ href: resolve('/(site)/community'), label: m.nav_community() }
	];
}
