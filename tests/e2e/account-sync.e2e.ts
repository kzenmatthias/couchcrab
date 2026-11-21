import { expect, test, type Page } from '@playwright/test';
import {
	accountCreatorIds,
	accountProgress,
	accountSettings,
	addSessionCookie,
	createGoogleUser,
	creatorIdBySlug,
	signIn
} from './auth-helpers.js';

/** Waits until the prefs store has read localStorage (it writes the cookie mirror then). */
async function hydrated(page: Page) {
	await page.waitForFunction(() => document.cookie.includes('viewing='));
}

test('the signed-out menu works with the keyboard and changes the theme', async ({ page }) => {
	await page.goto('/about');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
	const toggle = page.locator('summary', { hasText: 'Menu' });
	await expect(toggle).toHaveAccessibleName('Menu');
	const search = page.getByRole('searchbox', { name: 'Search series, creators and episodes' });
	await search.focus();
	await page.keyboard.press('Tab');
	await expect(toggle).toBeFocused();
	await page.keyboard.press('Enter');
	const panel = page.locator('details.account');
	await expect(panel).toHaveAttribute('open', '');
	await expect(panel.getByRole('link', { name: 'Who I watch' })).toHaveAttribute(
		'href',
		'/settings/creators'
	);
	await expect(panel.getByRole('link', { name: 'Display & accessibility' })).toHaveAttribute(
		'href',
		'/settings/display'
	);
	await expect(panel.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute(
		'href',
		'/signin'
	);
	await expect(panel.getByRole('button', { name: 'Sign out' })).toHaveCount(0);

	await page.keyboard.press('Tab');
	await expect(panel.getByRole('radio', { name: 'System' })).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(panel.getByRole('radio', { name: 'Dark' })).toBeChecked();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await page.keyboard.press('Escape');
	await expect(panel).not.toHaveAttribute('open', '');
	await expect(toggle).toBeFocused();

	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	// One theme switch only: none in the footer or on the settings pages.
	const themeRadios = page.locator('input[type="radio"][name="theme"]');
	await expect(themeRadios).toHaveCount(4);
	await page.goto('/settings/display');
	await expect(themeRadios).toHaveCount(4);
});

test('the signed-out menu keeps working without JavaScript', async ({ browser, baseURL }) => {
	const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
	const page = await context.newPage();
	await page.goto('/about');
	await page.locator('summary', { hasText: 'Menu' }).click();
	await page.getByRole('radio', { name: 'High contrast' }).check();
	await page.getByRole('button', { name: 'Apply theme' }).click();
	await expect(page).toHaveURL(/\/about$/);
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'contrast');
	await context.close();
});

test('prefs chosen while signed out survive sign-in and reach the account', async ({
	page,
	context,
	baseURL
}) => {
	await page.goto('/settings/creators');
	await hydrated(page);
	await page.getByRole('button', { name: 'Clear all' }).click();
	await page.getByRole('button', { name: 'Pebblewick', exact: true }).click();
	const count = page.getByRole('status').filter({ hasText: 'selected' });
	await expect(count).toHaveText('1 selected');

	const userId = createGoogleUser('Sync Newcomer');
	await signIn(context, baseURL!, userId);
	await page.reload();
	await expect(page.locator('summary', { hasText: 'Account menu' })).toBeVisible();
	await expect(count).toHaveText('1 selected');

	const pebblewick = creatorIdBySlug('pebblewick');
	await expect.poll(() => accountCreatorIds(userId)).toEqual([pebblewick]);
	expect(accountSettings(userId)).toMatchObject({ creatorsMode: 'list' });

	// A later change is pushed too (debounced).
	await page.getByRole('button', { name: 'Marrowfen', exact: true }).click();
	await expect(count).toHaveText('2 selected');
	await expect
		.poll(() => accountCreatorIds(userId))
		.toEqual([pebblewick, creatorIdBySlug('marrowfen')].sort((a, b) => a - b));

	// Signing out keeps the local copy.
	await page.locator('summary', { hasText: 'Account menu' }).click();
	await page.getByRole('button', { name: 'Sign out' }).click();
	await page.goto('/settings/creators');
	await expect(count).toHaveText('2 selected');
});

test('progress from the watch page lands in the account', async ({ page, context, baseURL }) => {
	const userId = createGoogleUser('Sync Watcher');
	await signIn(context, baseURL!, userId);
	await page.goto('/watch/demo0000001');
	await hydrated(page);
	await page.getByRole('button', { name: 'Simulate end of video' }).click();
	await expect(page.getByRole('button', { name: 'Mark as watched' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect
		.poll(() => accountProgress(userId).find((r) => r.youtubeId === 'demo0000001')?.watchedAt)
		.toBeGreaterThan(0);
});

test('another browser with the same account gets the synced prefs', async ({
	browser,
	page,
	context,
	baseURL
}) => {
	const userId = createGoogleUser('Sync Two Devices');
	const session = await signIn(context, baseURL!, userId);
	await page.goto('/settings/display');
	await hydrated(page);
	await page.getByRole('switch', { name: 'Text-only lists' }).click();
	await page.getByRole('radio', { name: 'Larger' }).check();
	await page.goto('/watch/demo0000002');
	await hydrated(page);
	await page.getByRole('button', { name: 'Mark as watched' }).click();
	await expect
		.poll(() => accountSettings(userId)?.prefs as { display?: { textOnly?: boolean } })
		.toMatchObject({ display: { textOnly: true, textSize: 'larger' } });
	await expect.poll(() => accountProgress(userId).length).toBe(1);

	const other = await browser.newContext({ baseURL });
	await addSessionCookie(other, baseURL!, session.token);
	const second = await other.newPage();
	await second.goto('/series/lanternfall-season-3');
	// After the pull the server render follows the account (text-only lists, larger text).
	await expect(second.locator('main ul.text-list').first()).toBeVisible();
	await expect(second.locator('html')).toHaveAttribute('data-text-size', 'larger');
	await second.goto('/watch/demo0000002');
	await expect(second.getByRole('button', { name: 'Mark as watched' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await other.close();
});
