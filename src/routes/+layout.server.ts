import { MIRROR_COOKIE } from '#lib/prefs/mirror.js';
import type { LayoutServerLoad } from './$types';

/** The viewing prefs cookie mirror, so the prefs store renders the same on server and client. */
export const load: LayoutServerLoad = ({ cookies }) => ({
	viewingCookie: cookies.get(MIRROR_COOKIE) ?? null
});
