import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import PosterArt from '#lib/components/PosterArt.svelte';
import { PALETTES, posterArt, random } from '#lib/poster-art.js';

describe('posterArt', () => {
	it('is deterministic for the same palette, seed and size', () => {
		const a = posterArt({ palette: 'meadow', seed: 11, width: 100, height: 150, id: 'x' });
		const b = posterArt({ palette: 'meadow', seed: 11, width: 100, height: 150, id: 'x' });
		expect(a).toBe(b);
	});

	it('changes with the seed and the palette', () => {
		const base = posterArt({ palette: 'ember', seed: 4, id: 'x' });
		expect(posterArt({ palette: 'ember', seed: 5, id: 'x' })).not.toBe(base);
		expect(posterArt({ palette: 'night', seed: 4, id: 'x' })).not.toBe(base);
	});

	it('falls back to the default palette for an unknown name', () => {
		expect(posterArt({ palette: 'nope', seed: 2, id: 'x' })).toBe(
			posterArt({ palette: 'meadow', seed: 2, id: 'x' })
		);
	});

	it('never contains text and ignores a tint that is not a colour', () => {
		for (const palette of Object.keys(PALETTES)) {
			const svg = posterArt({ palette, seed: 3, width: 160, height: 90, id: 'x' });
			expect(svg).not.toMatch(/<text|<foreignObject|<script/i);
		}
		const tinted = posterArt({ seed: 3, id: 'x', tint: '"/><script>' });
		expect(tinted).not.toContain('<script');
	});

	it('uses a seeded random generator', () => {
		const r1 = random(42);
		const r2 = random(42);
		const seq = [r1(), r1(), r1()];
		expect([r2(), r2(), r2()]).toEqual(seq);
		for (const v of seq) expect(v).toBeGreaterThanOrEqual(0);
		for (const v of seq) expect(v).toBeLessThan(1);
	});
});

describe('PosterArt.svelte', () => {
	it('renders the same decorative SVG for the same props', () => {
		const props = { palette: 'tide', seed: 7 };
		const a = render(PosterArt, { props }).body;
		const b = render(PosterArt, { props }).body;
		expect(a).toBe(b);
		expect(a).toContain('aria-hidden="true"');
		expect(a).toContain('focusable="false"');
		expect(a).not.toMatch(/<text/i);
	});
});
