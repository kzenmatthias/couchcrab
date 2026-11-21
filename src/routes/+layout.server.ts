import { getLocale } from '#lib/paraglide/runtime.js';
import { MIRROR_COOKIE } from '#lib/prefs/mirror.js';
import { db } from '#lib/server/db/index.js';
import { readSiteTexts } from '#lib/server/manage/site.js';
import type { LayoutServerLoad } from './$types';

/**
 * The viewing prefs cookie mirror, so the prefs store renders the same on server and client,
 * the signed-in user's id, so the store can sync with the account,
 * and the site texts managed in the app (read by the first-visit notice and the footer).
 */
export const load: LayoutServerLoad = ({ cookies, locals }) => ({
	viewingCookie: cookies.get(MIRROR_COOKIE) ?? null,
	syncUserId: locals.user?.id ?? null,
	siteTexts: readSiteTexts(db, getLocale())
});
