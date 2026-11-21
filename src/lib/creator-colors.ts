/**
 * The profile colours a claimed creator can pick on the creator dashboard. Every choice keeps
 * the avatar initials (black or white, see `textOn`) at a contrast of at least 4.5:1, which the
 * unit tests check. Admins can still set any colour in the management tool.
 */
import { contrastRatio } from './color.js';
import { textOn } from './video.js';

export const PROFILE_COLORS = [
	{ key: 'teal', hex: '#2ec4b6' },
	{ key: 'green', hex: '#7bd389' },
	{ key: 'sky', hex: '#5fb3ff' },
	{ key: 'violet', hex: '#9b7bff' },
	{ key: 'pink', hex: '#ff8fab' },
	{ key: 'coral', hex: '#ff7a59' },
	{ key: 'red', hex: '#e05d5d' },
	{ key: 'gold', hex: '#f2c14e' },
	{ key: 'plum', hex: '#8e3b7a' },
	{ key: 'forest', hex: '#1f6f4a' },
	{ key: 'navy', hex: '#1e3a8a' },
	{ key: 'slate', hex: '#3b4a6b' }
] as const;

export type ProfileColorKey = (typeof PROFILE_COLORS)[number]['key'];

/** The minimum contrast between a profile colour and its avatar initials. */
export const INITIALS_MIN_CONTRAST = 4.5;

/** Contrast of the avatar initials on this colour (1 to 21), or 0 for an invalid colour. */
export function initialsContrast(hex: string): number {
	return contrastRatio(hex, textOn(hex)) ?? 0;
}

/** The choice for a hex colour, or undefined when the colour is not one of the choices. */
export function profileColor(hex: string) {
	const value = hex.trim().toLowerCase();
	return PROFILE_COLORS.find((c) => c.hex === value);
}
