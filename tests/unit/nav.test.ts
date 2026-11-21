import { describe, expect, it } from 'vitest';
import { navCurrent } from '#lib/nav.js';

const at = (path: string) => new URL(`http://localhost${path}`);

describe('navCurrent', () => {
	it('matches the relative hrefs of the server render', () => {
		expect(navCurrent('../creator/channels', at('/creator/channels'))).toBe('page');
		expect(navCurrent('../creator', at('/creator/channels'), { exact: true })).toBeUndefined();
		expect(navCurrent('./series', at('/series'))).toBe('page');
	});

	it('marks a section, but never for the root or an exact link', () => {
		expect(navCurrent('/creators', at('/creators/juno'))).toBe('true');
		expect(navCurrent('/', at('/creators'))).toBeUndefined();
		expect(navCurrent('/manage', at('/manage/review'), { exact: true })).toBeUndefined();
		expect(navCurrent('/series', at('/seriesx'))).toBeUndefined();
	});
});
