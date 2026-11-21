import type { Handle } from '@sveltejs/kit/hooks';
import { getTextDirection } from '#lib/paraglide/runtime.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';
import { parseTheme, THEME_COOKIE } from '#lib/prefs/theme.js';
import { db } from '#lib/server/db/index.js';
import {
	deleteSessionCookie,
	SESSION_COOKIE,
	setSessionCookie,
	validateSessionToken
} from '#lib/server/auth/session.js';

export const handle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		const theme = parseTheme(event.cookies.get(THEME_COOKIE));
		event.locals.theme = theme;

		event.locals.user = null;
		event.locals.sessionId = null;
		const token = event.cookies.get(SESSION_COOKIE);
		if (token) {
			const session = validateSessionToken(db, token);
			if (session) {
				event.locals.user = session.user;
				event.locals.sessionId = session.sessionId;
				if (session.renewed) setSessionCookie(event.cookies, event.url, token, session.expiresAt);
			} else {
				deleteSessionCookie(event.cookies, event.url);
			}
		}

		return resolve(
			{ ...event, request },
			{
				transformPageChunk: ({ html }) =>
					html
						.replace('%paraglide.lang%', locale)
						.replace('%paraglide.dir%', getTextDirection(locale))
						.replace('%couchcrab.theme%', theme)
			}
		);
	});
