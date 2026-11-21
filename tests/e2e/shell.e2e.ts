import { expect, test } from '@playwright/test';

test('home lists the demo series as posters', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	const series = page.getByRole('region', { name: 'Series' });
	// By name, not by count: the management e2e test may add a series at the same time.
	for (const title of ['Lanternfall Season 3', 'Ember Hearts', 'Skyforge Games 2026']) {
		await expect(series.getByRole('heading', { level: 3, name: title })).toBeVisible();
	}
	await expect(page.getByRole('link', { name: 'Home', exact: true })).toHaveAttribute(
		'aria-current',
		'page'
	);
});

test('shell has skip link, unofficial label and footer disclaimer', async ({ page }) => {
	await page.goto('/about');
	await page.keyboard.press('Tab');
	const skip = page.getByRole('link', { name: 'Skip to content' });
	await expect(skip).toBeFocused();
	await expect(page.getByText('Unofficial', { exact: true })).toBeVisible();
	await expect(page.getByRole('contentinfo')).toContainText('independent fan project');
	await expect(page.getByRole('heading', { level: 1, name: 'About Couchcrab' })).toBeVisible();
});

test('the first-visit notice stays dismissed', async ({ page }) => {
	await page.goto('/');
	const notice = page.getByRole('complementary', { name: 'Unofficial project notice' });
	await expect(notice).toBeVisible();
	await notice.getByRole('button', { name: 'Dismiss notice' }).click();
	await expect(notice).toBeHidden();
	await page.reload();
	await expect(page.getByRole('complementary', { name: 'Unofficial project notice' })).toBeHidden();
});

test('the language switch changes the interface and html lang', async ({ page }) => {
	await page.goto('/about');
	await page.getByLabel('Language').selectOption('nl');
	await page.getByRole('button', { name: 'Apply' }).first().click();
	await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
	await expect(page.getByRole('heading', { level: 1, name: 'Over Couchcrab' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Naar de inhoud' })).toBeAttached();
});

test('Accept-Language picks Dutch without a cookie', async ({ browser, baseURL }) => {
	const context = await browser.newContext({ baseURL, locale: 'nl-BE' });
	const page = await context.newPage();
	await page.goto('/');
	await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
	await context.close();
});

test('an unknown page is a 404 inside the shell', async ({ page }) => {
	const response = await page.goto('/does-not-exist');
	expect(response?.status()).toBe(404);
	await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
	await expect(page.getByRole('contentinfo')).toBeVisible();
});
