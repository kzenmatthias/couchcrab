import { error, redirect } from '@sveltejs/kit';
import { cookieMaxAge, cookieName, isLocale } from '#lib/paraglide/runtime.js';
import { isTheme, THEME_COOKIE } from '#lib/prefs/theme.js';
import type { RequestHandler } from './$types';

/** Only same-site paths, never `//host` or a full URL. */
function safeRedirect(value: FormDataEntryValue | null): string {
	return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
		? value
		: '/';
}

/** Saves the language or theme from the footer forms. Works without JavaScript. */
export const POST: RequestHandler = async ({ request, cookies }) => {
	const form = await request.formData();
	const locale = form.get('locale');
	const theme = form.get('theme');
	if (locale instanceof File || theme instanceof File) error(400, 'Invalid form');
	const options = { path: '/', maxAge: cookieMaxAge, sameSite: 'lax', httpOnly: false } as const;

	if (locale !== null) {
		if (!isLocale(locale)) error(400, 'Unknown locale');
		cookies.set(cookieName, locale, options);
	}
	if (theme !== null) {
		if (!isTheme(theme)) error(400, 'Unknown theme');
		cookies.set(THEME_COOKIE, theme, options);
	}
	redirect(303, safeRedirect(form.get('redirect_to')));
};
