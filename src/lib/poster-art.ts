/**
 * Generated poster art, ported from the `art()` generator on the design board.
 *
 * Deterministic: the same palette, seed and size always give the same SVG.
 * The art never contains text; titles are real text placed on top of it.
 */

export type Motif = 'tree' | 'heart' | 'hearts2' | 'hearts3' | 'crown' | 'hourglass' | 'card';

export type Palette = {
	sky: [string, string];
	sun: string;
	far: string;
	near: string;
	motif: Motif;
	acc: string;
	moon?: boolean;
};

/** Named palettes an admin can pick for a series poster. Names describe the look only. */
export const PALETTES = {
	meadow: {
		sky: ['#8fd6ea', '#e3f6cf'],
		sun: '#fff3b0',
		far: '#5aa564',
		near: '#2f6b3a',
		motif: 'tree',
		acc: '#245a2c'
	},
	dusk: {
		sky: ['#2e2160', '#c77fa3'],
		sun: '#ffe9c7',
		far: '#5a3d7a',
		near: '#24183a',
		motif: 'tree',
		acc: '#1a1230',
		moon: true
	},
	ember: {
		sky: ['#22070e', '#b03a46'],
		sun: '#ffd1d1',
		far: '#6b1d2a',
		near: '#2c0a12',
		motif: 'heart',
		acc: '#ff6b7f',
		moon: true
	},
	tide: {
		sky: ['#0b1f3a', '#5b92d0'],
		sun: '#e6f2ff',
		far: '#24507f',
		near: '#0d2644',
		motif: 'hourglass',
		acc: '#ffd166'
	},
	amber: {
		sky: ['#33190a', '#e0974f'],
		sun: '#fff0d6',
		far: '#7a4a1e',
		near: '#341d0a',
		motif: 'hearts2',
		acc: '#ff6b6b'
	},
	gold: {
		sky: ['#3f2700', '#f3c85f'],
		sun: '#fff7da',
		far: '#a8741f',
		near: '#4f3306',
		motif: 'crown',
		acc: '#ffe08a'
	},
	night: {
		sky: ['#080c26', '#3c4f9c'],
		sun: '#c9d4ff',
		far: '#2a3570',
		near: '#0f1638',
		motif: 'card',
		acc: '#8ff0e0',
		moon: true
	},
	forest: {
		sky: ['#0c3324', '#62b984'],
		sun: '#f6ffe0',
		far: '#2f7a4f',
		near: '#123a26',
		motif: 'hearts3',
		acc: '#ff5d73'
	},
	violet: {
		sky: ['#0f0a18', '#5e3c72'],
		sun: '#e8d7ff',
		far: '#3b2650',
		near: '#170e22',
		motif: 'heart',
		acc: '#c792ff',
		moon: true
	}
} satisfies Record<string, Palette>;

export type PaletteName = keyof typeof PALETTES;

export const DEFAULT_PALETTE: PaletteName = 'meadow';

export function isPaletteName(name: string): name is PaletteName {
	return Object.hasOwn(PALETTES, name);
}

const PIXELS: Record<'heart' | 'crown' | 'hourglass' | 'card' | 'tree', string[]> = {
	heart: ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
	crown: ['X..X..X', 'XX.X.XX', 'XXXXXXX', 'XXXXXXX', 'XXXXXXX'],
	hourglass: ['XXXXXXX', '.XXXXX.', '..XXX..', '...X...', '..XXX..', '.XXXXX.', 'XXXXXXX'],
	card: ['XXXXX', 'X...X', 'X.X.X', 'X...X', 'X.X.X', 'X...X', 'XXXXX'],
	tree: ['..XXX..', '.XXXXX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '...X...', '...X...']
};

/** Small deterministic pseudo-random generator (LCG), seeded per poster. */
export function random(seed: number): () => number {
	let x = (seed * 2654435761) % 4294967296;
	return () => {
		x = (x * 1664525 + 1013904223) % 4294967296;
		return x / 4294967296;
	};
}

const n1 = (v: number) => v.toFixed(1);

function pixels(pattern: string[], x: number, y: number, u: number, color: string): string {
	let out = '';
	pattern.forEach((row, j) => {
		[...row].forEach((c, i) => {
			if (c === 'X') {
				out += `<rect x="${n1(x + i * u)}" y="${n1(y + j * u)}" width="${n1(u + 0.3)}" height="${n1(u + 0.3)}" fill="${color}"/>`;
			}
		});
	});
	return out;
}

function hill(
	w: number,
	h: number,
	base: number,
	amp: number,
	bw: number,
	r: () => number,
	color: string
): string {
	let d = `M0 ${h}`;
	for (let x = 0; x < w + bw; x += bw) {
		const y = n1(h * base - r() * h * amp);
		d += ` L${n1(x)} ${y} L${n1(x + bw)} ${y}`;
	}
	return `<path d="${d} L${w} ${h} Z" fill="${color}"/>`;
}

export type ArtOptions = {
	palette?: string;
	seed?: number;
	width?: number;
	height?: number;
	/** Optional colour for the sun or moon, e.g. a creator colour. Must be a hex colour. */
	tint?: string | null;
	/** Prefix for the gradient id, unique per page. */
	id: string;
};

const HEX = /^#[0-9a-f]{3,8}$/i;

/**
 * Returns the inner SVG markup (no `<svg>` wrapper) for a poster.
 * All values are numbers or colours from the palette table, so the markup is safe to inline.
 */
export function posterArt(options: ArtOptions): string {
	const { seed = 1, width: w = 100, height: h = 150, id } = options;
	const key: PaletteName =
		options.palette && isPaletteName(options.palette) ? options.palette : DEFAULT_PALETTE;
	const p: Palette = PALETTES[key];
	const tint = options.tint && HEX.test(options.tint) ? options.tint : null;
	const gid = `${id.replace(/[^\w-]/g, '')}-sky`;
	const r = random(seed * 7 + key.length);
	const m = Math.min(w, h);
	const wide = w > h;

	let g = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset="1" stop-color="${p.sky[1]}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#${gid})"/>`;

	const sx = w * (wide ? 0.55 + r() * 0.3 : 0.25 + r() * 0.5);
	const sy = h * (0.16 + r() * 0.1);
	const sr = m * 0.13;
	const sun = tint ?? p.sun;
	if (p.moon) {
		for (let i = 0; i < 14; i++) {
			const size = (m * 0.012).toFixed(2);
			g += `<rect x="${n1(r() * w)}" y="${n1(r() * h * 0.45)}" width="${size}" height="${size}" fill="#fff" opacity=".8"/>`;
		}
		g += `<circle cx="${n1(sx)}" cy="${n1(sy)}" r="${n1(sr)}" fill="${sun}"/><circle cx="${n1(sx + sr * 0.45)}" cy="${n1(sy - sr * 0.2)}" r="${n1(sr * 0.85)}" fill="${p.sky[0]}"/>`;
	} else {
		g += `<rect x="${n1(sx - sr)}" y="${n1(sy - sr)}" width="${n1(sr * 2)}" height="${n1(sr * 2)}" fill="${sun}" opacity=".95"/>`;
	}

	g += hill(w, h, 0.66, 0.12, w / 14, r, p.far);

	const u = m * (wide ? 0.045 : 0.06);
	const pattern = PIXELS[p.motif === 'hearts2' || p.motif === 'hearts3' ? 'heart' : p.motif];
	const count = p.motif === 'hearts2' ? 2 : p.motif === 'hearts3' ? 3 : 1;
	const pw = pattern[0].length * u;
	const gap = u * 1.5;
	const total = count * pw + (count - 1) * gap;
	const mx = wide ? w * 0.72 - total / 2 : w / 2 - total / 2;
	const my = h * (wide ? 0.2 : 0.3);

	if (p.motif === 'tree') {
		for (let t = 0; t < 5; t++) {
			const tu = u * (0.5 + r() * 0.5);
			const tx = wide ? w * (0.4 + r() * 0.58) : r() * w;
			const ty = h * (0.6 + r() * 0.08);
			g += pixels(pattern, tx, ty - pattern.length * tu, tu, p.acc);
		}
	} else {
		for (let i = 0; i < count; i++) g += pixels(pattern, mx + i * (pw + gap), my, u, p.acc);
	}

	g += hill(w, h, 0.82, 0.1, w / 10, r, p.near);
	return g;
}
