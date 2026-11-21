/** Colour contrast helpers (WCAG 2.x relative luminance), used by the creator colour preview. */

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value: string): boolean {
	return HEX_RE.test(value.trim());
}

/** Relative luminance of a hex colour, or null when it is not one. */
export function luminance(hex: string): number | null {
	const m = HEX_RE.exec(hex.trim());
	if (!m) return null;
	const full = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
	const channel = (i: number) => {
		const v = parseInt(full.slice(i, i + 2), 16) / 255;
		return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** Contrast ratio between two hex colours (1 to 21), or null for an invalid colour. */
export function contrastRatio(a: string, b: string): number | null {
	const la = luminance(a);
	const lb = luminance(b);
	if (la === null || lb === null) return null;
	const [hi, lo] = la > lb ? [la, lb] : [lb, la];
	return (hi + 0.05) / (lo + 0.05);
}
