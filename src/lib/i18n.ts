/** Helpers for translated community content and locale-aware formatting. */

export const CONTENT_FALLBACK_LOCALE = 'en';

export type Translated = { locale: string };

/**
 * Picks the translation for `locale`, falling back to English, then to the first row.
 * Returns null when there are no rows at all.
 */
export function pickTranslation<T extends Translated>(
	rows: readonly T[],
	locale: string,
	fallback: string = CONTENT_FALLBACK_LOCALE
): { value: T; isFallback: boolean } | null {
	const exact = rows.find((r) => r.locale === locale);
	if (exact) return { value: exact, isFallback: false };
	const base = rows.find((r) => r.locale === fallback) ?? rows[0];
	return base ? { value: base, isFallback: true } : null;
}

export function formatDate(
	date: Date,
	locale: string,
	options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }
): string {
	return new Intl.DateTimeFormat(locale, options).format(date);
}

/** A localised date range like "14–20 Sept 2026" (both ends inclusive). */
export function formatDateRange(
	start: Date,
	end: Date,
	locale: string,
	options: Intl.DateTimeFormatOptions = {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	}
): string {
	return new Intl.DateTimeFormat(locale, options).formatRange(start, end);
}
