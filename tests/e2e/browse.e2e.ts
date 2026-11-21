import { expect, test, type Locator, type Page } from '@playwright/test';

/** Presses Tab until `target` has focus (keyboard only, no clicks). */
async function tabTo(page: Page, target: Locator, max = 150) {
	for (let i = 0; i < max; i++) {
		await page.keyboard.press('Tab');
		if (await target.evaluate((el) => el === document.activeElement)) return;
	}
	throw new Error(`Could not reach ${String(target)} with Tab`);
}

test('keyboard only: home, series, watch, creator', async ({ page }) => {
	await page.goto('/');
	const seriesRail = page.getByRole('region', { name: 'Series' });
	await tabTo(page, seriesRail.getByRole('link', { name: 'Lanternfall Season 3' }));
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/series\/lanternfall-season-3$/);
	await expect(page.getByRole('heading', { level: 1, name: 'Lanternfall Season 3' })).toBeVisible();

	const week1 = page.getByRole('region', { name: /Week 1/ });
	const first = week1.getByRole('link').first();
	const title = (await first.textContent())!.trim();
	await tabTo(page, first);
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/watch\//);
	await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();

	const creatorLink = page.getByRole('main').getByRole('link', { name: 'Pebblewick', exact: true });
	await tabTo(page, creatorLink);
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/creators\/pebblewick$/);
	await expect(page.getByRole('heading', { level: 1, name: 'Pebblewick' })).toBeVisible();
});

test('rails are lists with labelled scroll buttons', async ({ page }) => {
	await page.goto('/');
	const uploads = page.getByRole('region', { name: 'New uploads' });
	await expect(uploads.getByRole('list')).toBeVisible();
	await expect(uploads.getByRole('button', { name: 'Scroll New uploads forward' })).toBeVisible();
	await expect(uploads.getByRole('button', { name: 'Scroll New uploads back' })).toBeVisible();
});

test('series page has sub-pages with aria-current and week headings', async ({ page }) => {
	await page.goto('/series/lanternfall-season-3');
	const subnav = page.getByRole('navigation', { name: 'Series sections' });
	await expect(subnav.getByRole('link', { name: 'Mixed timeline' })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await expect(page.getByRole('heading', { level: 2, name: /^Week 1/ })).toContainText(
		'September 7'
	);
	await subnav.getByRole('link', { name: /Extras/ }).click();
	await expect(page.getByRole('heading', { level: 2, name: 'Extras' })).toBeVisible();
	await subnav.getByRole('link', { name: 'About' }).click();
	await expect(page.getByText('Eight builders, one new world')).toBeVisible();
	await expect(subnav.getByRole('link', { name: 'About' })).toHaveAttribute('aria-current', 'page');
});

test('a live series is grouped per session', async ({ page }) => {
	await page.goto('/series/ember-hearts');
	await expect(page.getByRole('heading', { level: 2, name: /^Session \d/ })).toHaveCount(3);
	await expect(
		page.getByRole('navigation', { name: 'Series sections' }).getByRole('link', { name: /Extras/ })
	).toHaveCount(0);
	expect((await page.goto('/series/ember-hearts/extras'))?.status()).toBe(404);
});

test('episode cards speak duration and creator captions', async ({ page }) => {
	await page.goto('/series/lanternfall-season-3');
	const card = page.getByRole('article').filter({ hasText: 'The Big Reveal (Ep 1)' });
	await expect(card).toContainText('Duration: 25 minutes');
	await expect(card).toContainText('Creator captions');
});

test('creator page shows channels and the verified badge', async ({ page }) => {
	await page.goto('/creators/tidecaller-juno');
	await expect(page.getByText('Verified creator')).toBeVisible();
	await expect(
		page.getByRole('link', { name: 'YouTube: Tidecaller Juno (opens YouTube)' })
	).toHaveAttribute('href', /^https:\/\/www\.youtube\.com\/channel\//);
	await page.goto('/creators/pebblewick');
	await expect(page.getByText('Verified creator')).toHaveCount(0);
});

test('watch page: placeholder for demo ids, queue with the current item', async ({ page }) => {
	await page.goto('/watch/demo0000001');
	await expect(page.getByText('Demo episode')).toBeVisible();
	await expect(page.locator('iframe')).toHaveCount(0);
	const queue = page.getByRole('complementary', { name: /Week 1/ }).getByRole('list');
	await expect(queue).toHaveJSProperty('tagName', 'OL');
	await expect(queue.locator('[aria-current="page"]')).toHaveCount(1);
	await expect(
		page.getByRole('link', { name: 'Watch on YouTube (opens YouTube)' })
	).toHaveAttribute('href', 'https://www.youtube.com/watch?v=demo0000001');
});

test('opted-out creators and unsorted videos never appear', async ({ page }) => {
	for (const path of [
		'/',
		'/creators',
		'/series/lanternfall-season-3',
		'/series/lanternfall-season-3/by-creator'
	]) {
		await page.goto(path);
		await expect(page.getByText('Vesper Moss')).toHaveCount(0);
		await expect(page.getByText('Hidden Hollow')).toHaveCount(0);
		await expect(page.getByText('My new texture pack')).toHaveCount(0);
	}
	expect((await page.goto('/creators/vesper-moss'))?.status()).toBe(404);
	await page.goto('/creators/quillby');
	await expect(page.getByText('My new texture pack')).toHaveCount(0);
});

test('unknown slugs and ids are 404 inside the shell', async ({ page }) => {
	for (const path of ['/series/nope', '/creators/nope', '/watch/nope']) {
		const response = await page.goto(path);
		expect(response?.status()).toBe(404);
		await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
	}
});

test('header links go to the series and creator lists', async ({ page }) => {
	await page.goto('/');
	const nav = page.getByRole('navigation', { name: 'Main' });
	await nav.getByRole('link', { name: 'Series' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Series' })).toBeVisible();
	await expect(nav.getByRole('link', { name: 'Series' })).toHaveAttribute('aria-current', 'page');
	await nav.getByRole('link', { name: 'Creators' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Creators' })).toBeVisible();
	await page.goto('/creators/brassmoth');
	await expect(nav.getByRole('link', { name: 'Creators' })).toHaveAttribute('aria-current', 'true');
});

test('the Dutch interface translates the browse pages', async ({ browser, baseURL }) => {
	const context = await browser.newContext({ baseURL, locale: 'nl-BE' });
	const page = await context.newPage();
	await page.goto('/series/lanternfall-season-3');
	await expect(page.getByRole('link', { name: 'Gemengde tijdlijn' })).toBeVisible();
	await expect(page.getByRole('heading', { level: 2, name: /^Week 1/ })).toContainText('september');
	await context.close();
});
