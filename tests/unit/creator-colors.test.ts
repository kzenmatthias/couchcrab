import { describe, expect, it } from 'vitest';
import { contrastRatio } from '#lib/color.js';
import {
	INITIALS_MIN_CONTRAST,
	initialsContrast,
	PROFILE_COLORS,
	profileColor
} from '#lib/creator-colors.js';
import { textOn } from '#lib/video.js';

describe('profile colour choices', () => {
	it.each(PROFILE_COLORS.map((c) => [c.key, c.hex]))(
		'%s keeps the avatar initials at 4.5:1 or more',
		(_key, hex) => {
			expect(contrastRatio(hex, textOn(hex))).toBeGreaterThanOrEqual(INITIALS_MIN_CONTRAST);
			expect(initialsContrast(hex)).toBeGreaterThanOrEqual(4.5);
		}
	);

	it('has unique keys and lower-case hex values', () => {
		expect(new Set(PROFILE_COLORS.map((c) => c.key)).size).toBe(PROFILE_COLORS.length);
		for (const c of PROFILE_COLORS) expect(c.hex).toMatch(/^#[0-9a-f]{6}$/);
	});

	it('finds a choice by hex, in any case', () => {
		expect(profileColor('#2EC4B6')?.key).toBe('teal');
		expect(profileColor('#123456')).toBeUndefined();
	});

	it('reports 0 for an invalid colour', () => {
		expect(initialsContrast('nope')).toBe(0);
	});
});
