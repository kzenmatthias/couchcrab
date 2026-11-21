import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { signIn, userIdByName } from './auth-helpers.js';
import { videoIdOf, videoPlacement } from './creator-helpers.js';
import { idOf, insertUnsorted, uniqueTag } from './manage-helpers.js';

const THEMES = ['dark', 'light', 'contrast'] as const;
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const JUNO = 'Tidecaller Juno';

async function expectNoAxeViolations(page: Page) {
	const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
	expect(results.violations).toEqual([]);
}

async function expectNoHorizontalScroll(page: Page) {
	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBeLessThanOrEqual(0);
}

test('a viewer without a claimed profile gets a 403 that explains how to claim', async ({
	page,
	context,
	baseURL
}) => {
	await signIn(context, baseURL!, userIdByName('Demo Viewer'));
	const response = await page.goto('/creator');
	expect(response?.status()).toBe(403);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'Only for creators who claimed their profile'
	);
	await expect(
		page.getByRole('link', { name: 'Go to sign in and claim your profile' })
	).toHaveAttribute('href', '/signin');
	for (const path of ['/creator/channels', '/creator/videos']) {
		expect((await page.goto(path))?.status()).toBe(403);
	}
});

test('signed out, the dashboard sends you to sign in', async ({ page }) => {
	await page.goto('/creator');
	await expect(page).toHaveURL(/\/signin$/);
});

test('the claimed creator edits their bio and sees it on their public page', async ({
	page,
	context,
	baseURL
}) => {
	await signIn(context, baseURL!, userIdByName(JUNO));
	await page.goto('/creator');
	await expect(page.getByText('Verified creator')).toBeVisible();
	const bio = `Tide pools and lighthouses ${uniqueTag()}.`;
	await page.getByLabel('Short bio').fill(bio);
	await page.getByRole('radio', { name: 'Teal' }).check();
	await page.getByLabel('Links').fill('https://example.org/juno');
	await page.getByRole('button', { name: 'Save profile' }).click();
	await expect(page.getByRole('status')).toContainText('Your profile was saved.');

	await page.goto('/creators/tidecaller-juno');
	await expect(page.getByText(bio)).toBeVisible();
	await expect(page.getByRole('link', { name: /example\.org\/juno/ })).toBeVisible();

	// An invalid link comes back with an error summary that takes focus.
	await page.goto('/creator');
	await page.getByLabel('Links').fill('not a link');
	await page.getByRole('button', { name: 'Save profile' }).click();
	const summary = page.getByRole('heading', { name: /Please fix these fields/ });
	await expect(summary).toBeVisible();
	await expect(page.locator('.summary')).toBeFocused();
	await expect(page.getByLabel('Links')).toHaveAttribute('aria-invalid', 'true');
});

test('the creator places an unsorted video of their own and it shows in the series', async ({
	page,
	context,
	baseURL
}) => {
	const title = insertUnsorted('tidecaller-juno', `Juno unsorted ${uniqueTag()}`);
	await signIn(context, baseURL!, userIdByName(JUNO));
	await page.goto('/creator/videos?status=unsorted');
	const card = page.getByRole('article', { name: title });
	await expect(card).toBeVisible();
	await card.getByLabel('Series').selectOption({ label: 'Lanternfall Season 3' });
	await card.getByRole('button', { name: /^Place\b/ }).click();
	await expect(page.getByRole('status')).toContainText(title);
	expect(videoPlacement(title)).toMatchObject({
		status: 'placed',
		placedBy: 'user',
		seriesId: idOf('series', 'lanternfall-season-3')
	});

	await page.goto('/series/lanternfall-season-3');
	await expect(page.getByRole('link', { name: new RegExp(title) }).first()).toBeVisible();
});

test("a crafted form post for another creator's video gets a 403", async ({
	page,
	context,
	baseURL
}) => {
	await signIn(context, baseURL!, userIdByName(JUNO));
	await page.goto('/creator/videos');
	const response = await page.request.post('/creator/videos?/place', {
		form: {
			video_id: String(videoIdOf('pebblewick')),
			series_id: String(idOf('series', 'lanternfall-season-3'))
		},
		headers: { origin: baseURL! }
	});
	expect(response.status()).toBe(403);
	const ignore = await page.request.post('/creator/videos?/ignore', {
		form: { video_id: String(videoIdOf('pebblewick')) },
		headers: { origin: baseURL! }
	});
	expect(ignore.status()).toBe(403);
});

test('the account menu shows Creator dashboard to creators and Manage to editors', async ({
	page,
	context,
	baseURL
}) => {
	await signIn(context, baseURL!, userIdByName(JUNO));
	await page.goto('/');
	await page.locator('details.account summary').click();
	await expect(page.locator('details.account summary')).toContainText(`Account menu, ${JUNO}`);
	const dashboard = page.getByRole('link', { name: 'Creator dashboard' });
	await expect(dashboard).toBeVisible();
	await expect(page.getByRole('link', { name: 'Manage', exact: true })).toHaveCount(0);
	await dashboard.click();
	await expect(page).toHaveURL(/\/creator$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(JUNO);

	await context.clearCookies();
	await signIn(context, baseURL!, userIdByName('Demo Editor'));
	await page.goto('/');
	// Keyboard: open the menu with Enter, close it with Escape.
	const summary = page.locator('details.account summary');
	await summary.focus();
	await page.keyboard.press('Enter');
	const manage = page.getByRole('link', { name: 'Manage', exact: true });
	await expect(manage).toBeVisible();
	await expect(page.getByRole('link', { name: 'Creator dashboard' })).toHaveCount(0);
	await page.keyboard.press('Escape');
	await expect(manage).toBeHidden();
	await expect(summary).toBeFocused();
	await summary.press('Enter');
	await manage.click();
	await expect(page).toHaveURL(/\/manage$/);
});

test('the dashboard works at 320 px without horizontal scrolling', async ({
	page,
	context,
	baseURL
}) => {
	await page.setViewportSize({ width: 320, height: 800 });
	await signIn(context, baseURL!, userIdByName(JUNO));
	for (const path of ['/creator', '/creator/channels', '/creator/videos']) {
		await page.goto(path);
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await expectNoHorizontalScroll(page);
	}
});

const PAGES = [
	{ name: 'profile', path: '/creator' },
	{ name: 'channels', path: '/creator/channels' },
	{ name: 'my videos', path: '/creator/videos' }
];

for (const theme of THEMES) {
	test.describe(`creator dashboard, ${theme} theme`, () => {
		test.beforeEach(async ({ context, baseURL }) => {
			await context.addCookies([{ name: 'theme', value: theme, url: baseURL! }]);
			await signIn(context, baseURL!, userIdByName(JUNO));
		});

		for (const { name, path } of PAGES) {
			test(`${name} has no WCAG 2.2 AA violations`, async ({ page }) => {
				await page.goto(path);
				await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
				await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
				await expectNoAxeViolations(page);
			});
		}

		test('unlink confirmation and the error summary have no violations', async ({ page }) => {
			await page.goto('/creator/channels');
			await page.getByRole('button', { name: /^Unlink/ }).click();
			await expect(page.getByRole('region', { name: /^Unlink/ })).toBeFocused();
			await expectNoAxeViolations(page);

			await page.goto('/creator');
			await page.getByLabel('Links').fill('not a url');
			await page.getByRole('button', { name: 'Save profile' }).click();
			await expect(page.locator('.summary')).toBeFocused();
			await expectNoAxeViolations(page);
		});

		test('the 403 page has no violations', async ({ page, context, baseURL }) => {
			await context.clearCookies();
			await context.addCookies([{ name: 'theme', value: theme, url: baseURL! }]);
			await signIn(context, baseURL!, userIdByName('Demo Viewer'));
			await page.goto('/creator');
			await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
			await expectNoAxeViolations(page);
		});
	});
}
