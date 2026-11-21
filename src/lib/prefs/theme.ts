export const THEMES = ['system', 'dark', 'light', 'contrast'] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_COOKIE = 'theme';
export const DEFAULT_THEME: Theme = 'system';

export function isTheme(value: unknown): value is Theme {
	return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

export function parseTheme(value: string | null | undefined): Theme {
	return isTheme(value) ? value : DEFAULT_THEME;
}
