import { describe, expect, it } from 'vitest';
import { formatDate, pickTranslation } from '#lib/i18n.js';
import { cookieName, extractLocaleFromRequest } from '#lib/paraglide/runtime.js';

const request = (headers: Record<string, string>) =>
	new Request('http://localhost/', { headers: new Headers(headers) });

describe('locale from the request', () => {
	it('uses the cookie first', () => {
		expect(
			extractLocaleFromRequest(
				request({ cookie: `${cookieName}=nl`, 'accept-language': 'en-GB,en;q=0.9' })
			)
		).toBe('nl');
	});

	it('then Accept-Language', () => {
		expect(
			extractLocaleFromRequest(request({ 'accept-language': 'nl-BE,nl;q=0.9,en;q=0.5' }))
		).toBe('nl');
	});

	it('ignores an unknown cookie value', () => {
		expect(
			extractLocaleFromRequest(request({ cookie: `${cookieName}=xx`, 'accept-language': 'nl' }))
		).toBe('nl');
	});

	it('falls back to English', () => {
		expect(extractLocaleFromRequest(request({ 'accept-language': 'fr-FR,de;q=0.8' }))).toBe('en');
		expect(extractLocaleFromRequest(request({}))).toBe('en');
	});
});

describe('pickTranslation', () => {
	const rows = [
		{ locale: 'en', title: 'About' },
		{ locale: 'nl', title: 'Over' }
	];

	it('returns the requested locale', () => {
		expect(pickTranslation(rows, 'nl')).toEqual({ value: rows[1], isFallback: false });
	});

	it('falls back to English when the locale is missing', () => {
		expect(pickTranslation(rows, 'fr')).toEqual({ value: rows[0], isFallback: true });
	});

	it('falls back to the first row when there is no English', () => {
		expect(pickTranslation([rows[1]], 'fr')).toEqual({ value: rows[1], isFallback: true });
	});

	it('returns null without rows', () => {
		expect(pickTranslation([], 'en')).toBeNull();
	});
});

describe('formatDate', () => {
	it('formats with Intl in the given locale', () => {
		const d = new Date(Date.UTC(2026, 8, 7, 12));
		expect(formatDate(d, 'en', { month: 'long', year: 'numeric', timeZone: 'UTC' })).toBe(
			'September 2026'
		);
		expect(formatDate(d, 'nl', { month: 'long', year: 'numeric', timeZone: 'UTC' })).toBe(
			'september 2026'
		);
	});
});
