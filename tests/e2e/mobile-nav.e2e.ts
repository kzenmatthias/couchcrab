import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const SIZES = [
	{ width: 390, height: 844 },
	{ width: 320, height: 640 }
];
const THEMES = ['dark', 'light', 'contrast'] as const;
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const TABBAR = { name: 'Main (bottom bar)', exact: true };
const DESKTOP_NAV = { name: 'Main', exact: true };
const SERIES = '/series/lanternfall-season-3';

/** Presses Tab until `target` has focus (keyboard only, no clicks). */
async function tabTo(page: Page, target: Locator, max = 60) {
	for (let i = 0; i < max; i++) {
		await page.keyboard.press('Tab');
		if (await target.evaluate((el) => el === document.activeElement)) return;
	}
	throw new Error(`Could not reach ${String(target)} with Tab`);
}

/** Bottom of `el` is at or above the top of the tab bar (both in viewport coordinates). */
async function expectAboveTabBar(page: Page, el: Locator) {
	const box = await el.boundingBox();
	const bar = await page.getByRole('navigation', TABBAR).boundingBox();
	expect(box).not.toBeNull();
	expect(bar).not.toBeNull();
	expect(box!.y + box!.height).toBeLessThanOrEqual(bar!.y + 0.5);
	expect(box!.y).toBeGreaterThanOrEqual(0);
}

for (const size of SIZES) {
	test.describe(`mobile navigation at ${size.width}x${size.height}`, () => {
		test.use({ viewport: size });

		test('the tab bar replaces the header links and marks the current page', async ({ page }) => {
			const cases = [
				{ path: '/', tab: 'Home', current: 'page' },
				{ path: '/series', tab: 'Series', current: 'page' },
				{ path: SERIES, tab: 'Series', current: 'true' },
				{ path: '/creators', tab: 'Creators', current: 'page' },
				{ path: '/creators/brassmoth', tab: 'Creators', current: 'true' },
				{ path: '/who-i-watch', tab: 'Who I watch', current: 'page' },
				{ path: '/settings/creators/lanternfall-season-3', tab: 'Who I watch', current: 'true' },
				{ path: '/search', tab: '', current: '' }
			];
			for (const { path, tab, current } of cases) {
				await page.goto(path);
				const bar = page.getByRole('navigation', TABBAR);
				await expect(bar).toBeVisible();
				// Only one main navigation: the header links are display: none.
				await expect(page.getByRole('navigation', DESKTOP_NAV)).toHaveCount(0);
				await expect(page.locator('nav.main-nav')).toBeHidden();
				// The header field is hidden; only /search has its own search form.
				await expect(page.getByRole('search')).toHaveCount(path === '/search' ? 1 : 0);
				const links = bar.getByRole('link');
				await expect(links).toHaveText(['Home', 'Series', 'Creators', 'Who I watch']);
				if (tab) {
					await expect(bar.getByRole('link', { name: tab, exact: true })).toHaveAttribute(
						'aria-current',
						current
					);
				}
				await expect(bar.locator('[aria-current]')).toHaveCount(tab ? 1 : 0);
				// Text labels are visible, icons are hidden from assistive tech, targets are 44 px.
				for (const link of await links.all()) {
					await expect(link.locator('svg')).toHaveAttribute('aria-hidden', 'true');
					await expect(link.locator('span')).toBeVisible();
					const box = (await link.boundingBox())!;
					expect(box.height).toBeGreaterThanOrEqual(44);
					expect(box.width).toBeGreaterThanOrEqual(44);
					// Not clipped: the label fits inside its link.
					const clipped = await link
						.locator('span')
						.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
					expect(clipped).toBe(false);
				}
			}
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			);
			expect(overflow).toBeLessThanOrEqual(0);
		});

		test('the top bar is compact and keeps the label, search and menu', async ({ page }) => {
			await page.goto('/');
			const header = page.getByRole('banner');
			await expect(header.getByText('Unofficial', { exact: true })).toBeVisible();
			await expect(header.getByRole('link', { name: 'Search', exact: true })).toBeVisible();
			await expect(header.getByText('Menu', { exact: true })).toBeVisible();
			const box = (await header.boundingBox())!;
			expect(box.height).toBeLessThanOrEqual(80);
			// Community is in the menu on narrow screens.
			await header.getByText('Menu', { exact: true }).click();
			await header.getByRole('link', { name: 'Community' }).click();
			await expect(page).toHaveURL(/\/community$/);
		});

		test('search is reachable by keyboard and the field gets focus', async ({ page }) => {
			await page.goto('/');
			const link = page.getByRole('banner').getByRole('link', { name: 'Search', exact: true });
			await tabTo(page, link);
			await page.keyboard.press('Enter');
			await expect(page).toHaveURL(/\/search$/);
			const field = page.getByRole('searchbox', { name: 'Search series, creators and episodes' });
			await expect(field).toBeFocused();
			await page.keyboard.type('ember');
			await page.keyboard.press('Enter');
			await expect(page.getByRole('heading', { level: 1 })).toHaveText('Results for “ember”');
			await expect(field).toHaveValue('ember');
			await expect(link).toHaveAttribute('aria-current', 'page');
		});

		test('the last footer link is reachable and not covered by the tab bar', async ({ page }) => {
			await page.goto('/about');
			const last = page.getByRole('contentinfo').getByRole('link').last();
			await expect(last).toHaveText('Creator requests');
			await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
			await expectAboveTabBar(page, page.getByRole('contentinfo').getByRole('button').last());
			await expectAboveTabBar(page, last);
			// Keyboard focus scrolls it into view above the bar as well.
			await page.evaluate(() => window.scrollTo(0, 0));
			await tabTo(page, last);
			await expectAboveTabBar(page, last);
		});

		test('the autoplay countdown and the player are not covered', async ({ page }) => {
			await page.goto('/watch/demo0000001');
			await page.waitForFunction(() => document.cookie.includes('viewing='));
			const simulate = page.getByRole('button', { name: 'Simulate end of video' });
			await expectAboveTabBar(page, simulate);
			await simulate.click();
			const box = page.getByRole('region', { name: /Up next/ });
			await expect(box).toBeVisible();
			await expectAboveTabBar(page, box);
			// The player stays reachable above the bar too.
			await page.evaluate(() => window.scrollTo(0, 0));
			await expectAboveTabBar(page, page.locator('.stage .video'));
		});
	});
}

test.describe('mobile search without JavaScript', () => {
	test.use({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });

	test('the search link opens a working search form', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('banner').getByRole('link', { name: 'Search', exact: true }).click();
		await expect(page).toHaveURL(/\/search$/);
		const field = page.getByRole('searchbox', { name: 'Search series, creators and episodes' });
		await expect(field).toBeFocused();
		await field.fill('lanternfall');
		await page.getByRole('button', { name: 'Search', exact: true }).click();
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Results for “lanternfall”');
		await expect(page.getByRole('region', { name: /^Series \(/ })).toBeVisible();
	});
});

test.describe('desktop keeps the header navigation', () => {
	test.use({ viewport: { width: 1280, height: 800 } });

	test('header links and field are shown, the tab bar is not', async ({ page }) => {
		await page.goto('/search');
		await expect(page.getByRole('navigation', DESKTOP_NAV)).toBeVisible();
		await expect(page.getByRole('navigation', TABBAR)).toHaveCount(0);
		await expect(page.locator('nav.tabbar')).toBeHidden();
		// One search landmark: the header field (the field on the page is for narrow screens).
		await expect(page.getByRole('search')).toHaveCount(1);
		await expect(page.getByRole('banner').getByRole('searchbox')).toBeVisible();
	});
});

for (const theme of THEMES) {
	test.describe(`mobile ${theme} theme`, () => {
		test.use({ viewport: { width: 390, height: 844 } });
		test.beforeEach(async ({ context, baseURL }) => {
			await context.addCookies([{ name: 'theme', value: theme, url: baseURL! }]);
		});

		for (const path of [
			'/',
			'/series',
			SERIES,
			'/watch/demo0000001',
			'/search',
			'/search?q=ember'
		]) {
			test(`${path} has no WCAG 2.2 AA violations`, async ({ page }) => {
				await page.goto(path);
				await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
				await expect(page.getByRole('navigation', TABBAR)).toBeVisible();
				// The sticky bar overlaps whatever scrolls under it, which axe reports as obscured
				// targets. Check the page with the bar where it rests at the end of the page (after
				// the footer); the bounding-box tests above cover what the sticky bar may cover.
				await page.addStyleTag({ content: 'nav.tabbar { position: static !important; }' });
				const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
				expect(results.violations).toEqual([]);
			});
		}

		test('menu open has no WCAG 2.2 AA violations', async ({ page }) => {
			await page.goto('/');
			await page.getByRole('banner').getByText('Menu', { exact: true }).click();
			await page.addStyleTag({ content: 'nav.tabbar { position: static !important; }' });
			const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
			expect(results.violations).toEqual([]);
		});
	});
}

test.describe('200% zoom', () => {
	// A 1280 px wide window at 200% zoom lays out like a 640 px wide one.
	test.use({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });

	test('uses the tab bar without horizontal scroll', async ({ page }) => {
		for (const path of ['/', SERIES, '/watch/demo0000001', '/search?q=ember']) {
			await page.goto(path);
			await expect(page.getByRole('navigation', TABBAR)).toBeVisible();
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			);
			expect(overflow).toBeLessThanOrEqual(0);
		}
	});
});
