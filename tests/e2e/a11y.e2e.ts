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
	{ name: 'watch', path: '/watch/demo0000001' },
	{ name: 'settings: who I watch', path: '/settings/creators' },
	{ name: 'settings: series creators', path: '/settings/creators/lanternfall-season-3' },
	{ name: 'settings: display', path: '/settings/display' }
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

		test('series in spoiler-free mode with text-only lists off and on', async ({
			page,
			context,
			baseURL
		}) => {
			await context.addCookies([{ name: 'viewing', value: '1~s1', url: baseURL! }]);
			await page.goto('/series/ember-hearts');
			await expect(page.getByText('Title hidden').first()).toBeVisible();
			let results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
			expect(results.violations).toEqual([]);
			// localStorage wins over the cookie once it exists, so start over without it.
			await page.evaluate(() => localStorage.clear());
			await context.addCookies([{ name: 'viewing', value: '1~s1~t1', url: baseURL! }]);
			await page.goto('/series/lanternfall-season-3');
			await expect(page.locator('main ul.text-list').first()).toBeVisible();
			results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
			expect(results.violations).toEqual([]);
		});

		test('watch page with the autoplay countdown', async ({ page }) => {
			await page.goto('/watch/demo0000001');
			await page.waitForFunction(() => document.cookie.includes('viewing='));
			await page.getByRole('button', { name: 'Simulate end of video' }).click();
			await expect(page.getByRole('region', { name: /Up next/ })).toBeVisible();
			const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
			expect(results.violations).toEqual([]);
		});
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
