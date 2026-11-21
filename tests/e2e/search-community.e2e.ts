import { expect, type Page, test } from '@playwright/test';
import { signIn, userIdByName } from './auth-helpers.js';
import { insertPlacedVideo, insertPlacementEntry, pageBody } from './community-helpers.js';
import { uniqueTag } from './manage-helpers.js';

/** The first-visit notice covers part of the page; dismiss it before clicking around. */
async function hideNotice(page: Page) {
	await page.addInitScript(() => localStorage.setItem('couchcrab:notice-dismissed', '1'));
}

const SEARCH = { name: 'Search series, creators and episodes' };

test.describe('search', () => {
	test.beforeEach(async ({ page }) => hideNotice(page));

	test('searching from the header with the keyboard shows three labelled sections', async ({
		page
	}) => {
		await page.goto('/');
		// Tab from the top of the page until the search field has focus.
		const field = page.getByRole('searchbox', SEARCH);
		for (let i = 0; i < 20 && !(await field.evaluate((el) => el === document.activeElement)); i++) {
			await page.keyboard.press('Tab');
		}
		await expect(field).toBeFocused();
		await page.keyboard.type('TIDECALLER');
		await page.keyboard.press('Enter');

		await expect(page).toHaveURL(/\/search\?q=TIDECALLER$/);
		await expect(page).toHaveTitle(/TIDECALLER/);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Results for “TIDECALLER”');
		await expect(page.getByRole('status')).toContainText('results for “TIDECALLER”');
		await expect(page.getByRole('searchbox', SEARCH)).toHaveValue('TIDECALLER');

		await expect(page.getByRole('region', { name: 'Series (0)' })).toContainText(
			'No series match.'
		);
		const creators = page.getByRole('region', { name: 'Creators (1)' });
		await expect(creators.getByRole('link', { name: 'Tidecaller Juno' })).toBeVisible();
		const episodes = page.getByRole('region', { name: /^Episodes \(\d+\)$/ });
		await expect(episodes.getByRole('article').first()).toContainText('Tidecaller Juno');
	});

	test('accents and case do not matter, and Show all expands a section', async ({ page }) => {
		await page.goto('/search?q=lant%C3%89rnfall');
		const episodes = page.getByRole('region', { name: /^Episodes \(\d+\)$/ });
		await expect(episodes.getByRole('article')).toHaveCount(12);
		await episodes.getByRole('link', { name: /^Show all \d+ episodes$/ }).click();
		await expect(page).toHaveURL(/more=episodes/);
		const expanded = page.getByRole('region', { name: /^Episodes \(\d+\)$/ });
		expect(await expanded.getByRole('article').count()).toBeGreaterThan(12);
		await expanded.getByRole('link', { name: 'Show fewer' }).click();
		await expect(page.getByRole('region', { name: /^Episodes/ }).getByRole('article')).toHaveCount(
			12
		);
	});

	test('no results and an empty query explain what to do', async ({ page }) => {
		await page.goto('/search?q=zzqxv');
		await expect(page.getByRole('status')).toHaveText('Nothing found for “zzqxv”.');
		const tips = page.getByRole('region', { name: 'Try this' });
		await expect(tips).toContainText('Check the spelling');
		await expect(tips.getByRole('link', { name: 'Browse all series' })).toBeVisible();

		await page.goto('/search');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Search');
		await expect(page.getByText('Type a series title')).toBeVisible();
	});

	test('a hidden spoiler-free title cannot be found and is not shown', async ({
		page,
		context,
		baseURL
	}) => {
		await context.addCookies([{ name: 'viewing', value: '1~s1', url: baseURL! }]);
		// The server answer itself, before anything runs in the browser.
		const html = await (await page.request.get('/search?q=deep+dark')).text();
		expect(html).not.toContain('Into the Deep Dark');
		await page.goto('/search?q=deep+dark');
		await expect(page.getByRole('status')).toHaveText('Nothing found for “deep dark”.');

		// Found by the creator instead, as "Episode N".
		const byCreator = await (await page.request.get('/search?q=tidecaller')).text();
		expect(byCreator).not.toContain('Lanternfall 3:');
		await page.goto('/search?q=tidecaller');
		const episodes = page.getByRole('region', { name: /^Episodes/ });
		await expect(episodes.getByRole('link', { name: /^Episode \d+$/ }).first()).toBeVisible();
		await expect(episodes).not.toContainText('Lanternfall 3:');
	});

	test('works without JavaScript', async ({ browser, baseURL }) => {
		const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
		const page = await context.newPage();
		await page.goto('/');
		await page.getByRole('searchbox', SEARCH).fill('ember');
		await page.getByRole('searchbox', SEARCH).press('Enter');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Results for “ember”');
		await expect(page.getByRole('region', { name: 'Series (1)' })).toBeVisible();
		await context.close();
	});
});

test.describe('community page', () => {
	test('shows the managed text from the database and how to take part', async ({ page }) => {
		await page.goto('/');
		await page
			.getByRole('navigation', { name: 'Main' })
			.getByRole('link', { name: 'Community' })
			.click();
		await expect(page).toHaveURL(/\/community$/);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Community');
		const firstParagraph = pageBody('community').split('\n')[0];
		const prose = page.locator('.prose');
		await expect(prose.locator('p').first()).toHaveText(firstParagraph);
		await expect(prose.getByRole('link', { name: 'GitHub', exact: true })).toHaveAttribute(
			'href',
			'https://github.com/kzenmatthias/couchcrab'
		);
		await expect(prose.getByRole('link', { name: 'creator request', exact: true })).toHaveAttribute(
			'href',
			'/creator-requests'
		);
		await expect(page.getByRole('link', { name: 'Sign in to suggest an edit' })).toBeVisible();
		await expect(
			page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Community' })
		).toHaveAttribute('aria-current', 'page');
	});

	test('signed in, it links to My suggestions, and reviewers also to the review queue', async ({
		page,
		context,
		baseURL
	}) => {
		await signIn(context, baseURL!, userIdByName('Demo Viewer'));
		await page.goto('/community');
		const you = page.getByRole('region', { name: 'Your part' });
		await expect(you.getByRole('link', { name: 'My suggestions' })).toBeVisible();
		await expect(you.getByRole('link', { name: 'Review queue' })).toHaveCount(0);

		await signIn(context, baseURL!, userIdByName('Demo Editor'));
		await page.goto('/community');
		await expect(you.getByRole('link', { name: 'Review queue' })).toHaveAttribute(
			'href',
			/\/manage\/review$/
		);
	});

	test('recent changes name reviewers and hide spoiler-free titles', async ({
		page,
		context,
		baseURL
	}) => {
		const title = `Community recent ${uniqueTag()}`;
		const youtubeId = insertPlacedVideo('marrowfen', 'ember-hearts', 1, title);
		insertPlacementEntry(youtubeId, 'Demo Editor');

		await page.goto('/community');
		const recent = page.getByRole('region', { name: 'Recent changes' });
		const item = recent.getByRole('listitem').filter({ hasText: title });
		await expect(item).toContainText('Demo Editor changed');
		await expect(item.getByRole('link', { name: 'Ember Hearts' })).toHaveAttribute(
			'href',
			/\/series\/ember-hearts\/about$/
		);

		await context.addCookies([{ name: 'viewing', value: '1~s1', url: baseURL! }]);
		const html = await (await page.request.get('/community')).text();
		expect(html).not.toContain(title);
		expect(html).toContain('“an episode”');
	});
});

test.describe('creator dashboard navigation', () => {
	test('marks the current page with aria-current, also without JavaScript', async ({
		browser,
		baseURL
	}) => {
		const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
		await signIn(context, baseURL!, userIdByName('Tidecaller Juno'));
		const page = await context.newPage();
		await page.goto('/creator/channels');
		const nav = page.getByRole('navigation', { name: 'Creator dashboard' });
		await expect(nav.getByRole('link', { name: 'Channels' })).toHaveAttribute(
			'aria-current',
			'page'
		);
		await expect(nav.getByRole('link', { name: 'Profile' })).not.toHaveAttribute(
			'aria-current',
			/.*/
		);
		const style = await nav
			.getByRole('link', { name: 'Channels' })
			.evaluate((el) => getComputedStyle(el).fontWeight);
		expect(Number(style)).toBeGreaterThanOrEqual(700);
		await context.close();
	});
});
