import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const THEMES = ['dark', 'light', 'contrast'] as const;
const PAGES = [
	{ name: 'home', path: '/' },
	{ name: 'about', path: '/about' },
	{ name: 'series (week)', path: '/series/lanternfall-season-3' },
	{ name: 'series (session)', path: '/series/ember-hearts' },
	{ name: 'series extras', path: '/series/lanternfall-season-3/extras' },
	{ name: 'creator', path: '/creators/tidecaller-juno' },
	{ name: 'watch', path: '/watch/demo0000001' }
];
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

for (const theme of THEMES) {
	test.describe(`${theme} theme`, () => {
		test.beforeEach(async ({ context, baseURL }) => {
			await context.addCookies([{ name: 'theme', value: theme, url: baseURL! }]);
		});

		for (const { name, path } of PAGES) {
			test(`${name} has no WCAG 2.2 AA violations`, async ({ page }) => {
				await page.goto(path);
				await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
				const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
				expect(results.violations).toEqual([]);
			});
		}
	});
}

test.describe('reflow at 320 px', () => {
	test.use({ viewport: { width: 320, height: 640 } });

	for (const { name, path } of PAGES) {
		test(`${name} has no horizontal scroll`, async ({ page }) => {
			await page.goto(path);
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			);
			expect(overflow).toBeLessThanOrEqual(0);
		});
	}
});
