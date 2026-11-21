import { MIRROR_COOKIE } from '#lib/prefs/mirror.js';
import type { LayoutServerLoad } from './$types';

/**
 * The viewing prefs cookie mirror, so the prefs store renders the same on server and client,
 * and the signed-in user's id, so the store can sync with the account.
 */
export const load: LayoutServerLoad = ({ cookies, locals }) => ({
	viewingCookie: cookies.get(MIRROR_COOKIE) ?? null,
	syncUserId: locals.user?.id ?? null
});
