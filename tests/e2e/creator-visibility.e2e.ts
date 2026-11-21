/**
 * Creator dashboard tests that add a creator to the demo data and change what the public pages
 * show. They run in the `after-all` project, once the other tests are done, so the creator
 * counts those tests check never change under them (see playwright.config.ts).
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { signIn, userIdByName } from './auth-helpers.js';
import { createClaimedCreator } from './creator-helpers.js';
import { idOf } from './manage-helpers.js';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

async function expectNoAxeViolations(page: Page) {
	const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
	expect(results.violations).toEqual([]);
}

test('opting out hides the profile and videos everywhere, and undo brings them back', async ({
	page,
	context,
	baseURL
}) => {
	const creator = createClaimedCreator('lanternfall-season-3');
	await signIn(context, baseURL!, creator.userId);

	await page.goto(`/creators/${creator.slug}`);
	await expect(page.getByRole('heading', { level: 1, name: creator.name })).toBeVisible();
	await page.goto('/series/lanternfall-season-3');
	await expect(page.getByText(creator.videoTitle).first()).toBeVisible();

	await page.goto('/creator');
	await page.getByRole('button', { name: 'Hide my videos…' }).click();
	const panel = page.getByRole('region', { name: 'Hide your profile and all your videos?' });
	await expect(panel).toBeFocused();
	await expectNoAxeViolations(page);
	await panel.getByRole('button', { name: 'Yes, hide my videos' }).click();
	await expect(page.getByRole('status')).toContainText('hidden from Couchcrab');
	await expect(page.getByRole('button', { name: 'Show my videos again' })).toBeVisible();

	expect((await page.goto(`/creators/${creator.slug}`))?.status()).toBe(404);
	expect((await page.goto(`/watch/${creator.youtubeId}`))?.status()).toBe(404);
	await page.goto('/');
	await expect(page.getByText(creator.videoTitle)).toHaveCount(0);
	await page.goto('/series/lanternfall-season-3');
	await expect(page.getByText(creator.videoTitle)).toHaveCount(0);
	await page.goto('/creators');
	await expect(page.getByRole('main').getByText(creator.name)).toHaveCount(0);

	await page.goto('/creator');
	await page.getByRole('button', { name: 'Show my videos again' }).click();
	await expect(page.getByRole('status')).toContainText('back on Couchcrab');
	expect((await page.goto(`/creators/${creator.slug}`))?.status()).toBe(200);
	await page.goto('/series/lanternfall-season-3');
	await expect(page.getByText(creator.videoTitle).first()).toBeVisible();
});

test('the admin sees when the creator edited their own profile', async ({
	page,
	context,
	baseURL
}) => {
	const creator = createClaimedCreator('lanternfall-season-3');
	await signIn(context, baseURL!, creator.userId);
	await page.goto('/creator');
	await page.getByLabel('Short bio').fill('Edited by the creator');
	await page.getByRole('button', { name: 'Save profile' }).click();
	await expect(page.getByRole('status')).toContainText('Your profile was saved.');

	await context.clearCookies();
	await signIn(context, baseURL!, userIdByName('Demo Admin'));
	await page.goto(`/manage/creators/${idOf('creators', creator.slug)}`);
	await expect(page.getByText(/The creator last edited their own profile on/)).toBeVisible();
});
