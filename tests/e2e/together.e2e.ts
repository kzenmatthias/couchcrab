import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/*
 * Watch together with the demo data: the Skyforge Games streams are live VODs whose streams
 * started 0, 97, 194 and 291 seconds after the first one on day 1. Demo videos play in a
 * simulated player that shows its position, so the shared clock can be checked.
 */
const EXTRAS = '/series/skyforge-games-2026/extras';
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

const povs = (page: Page) => page.getByTestId('pov');
const timeOf = (page: Page, creator: string) =>
	povs(page).filter({ hasText: creator }).getByTestId('demo-time');

async function openDay1(page: Page) {
	await page.goto(EXTRAS);
	await page.getByRole('link', { name: 'Watch Day 1 together: 4 POVs' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Watch together' })).toBeVisible();
	await expect(povs(page)).toHaveCount(4);
}

async function seek(page: Page, seconds: number) {
	await page.getByRole('slider', { name: 'Position in the stream' }).fill(String(seconds));
}

test('a session links to all its POVs, lined up by their stream start', async ({ page }) => {
	await openDay1(page);
	await expect(
		page.getByRole('link', { name: 'Skyforge Games 2026 Streams, Day 1' })
	).toBeVisible();
	const names = await povs(page).getByRole('heading', { level: 2 }).allInnerTexts();
	expect(names).toHaveLength(4);

	// At the start only the first stream has begun; the others count down.
	await expect(povs(page).filter({ hasText: 'Starts in 1:37' })).toHaveCount(1);
	await expect(povs(page).filter({ hasText: 'Starts in 4:51' })).toHaveCount(1);

	await seek(page, 300);
	await expect(page.getByTestId('clock')).toContainText('5:00 /');
	const times = await povs(page).getByTestId('demo-time').allInnerTexts();
	expect(times.sort()).toEqual(['0:09', '1:46', '3:23', '5:00']);
});

test('plays all POVs on one clock, with a shift per POV', async ({ page }) => {
	await openDay1(page);
	await seek(page, 300);
	const first = await povs(page).nth(0).getByRole('heading', { level: 2 }).innerText();
	const firstTime = timeOf(page, first);
	const before = await firstTime.innerText();

	await page.getByRole('button', { name: 'Play all' }).click();
	await expect(page.getByRole('button', { name: 'Pause all' })).toBeVisible();
	await expect(firstTime).not.toHaveText(before);
	await page.getByRole('button', { name: 'Pause all' }).click();

	// Every POV moved by the same amount: the differences stay the same.
	const toS = (t: string) => t.split(':').reduce((a, b) => a * 60 + Number(b), 0);
	const times = (await povs(page).getByTestId('demo-time').allInnerTexts())
		.map(toS)
		.sort((a, b) => a - b);
	expect(times[3] - times[0]).toBeGreaterThanOrEqual(290);
	expect(times[3] - times[0]).toBeLessThanOrEqual(292);

	// A positive shift plays that POV later.
	const at = toS(await firstTime.innerText());
	await page.getByRole('spinbutton', { name: `Shift ${first} in seconds` }).fill('10');
	await page.getByRole('spinbutton', { name: `Shift ${first} in seconds` }).press('Enter');
	await expect(firstTime).toHaveText(new RegExp(`^${Math.floor((at - 10) / 60)}:`));
	await expect(page).toHaveURL(/n=[\w-]{11}:10/);
});

test('sound follows one POV, and POVs can be removed and added again', async ({ page }) => {
	await openDay1(page);
	const sound = page.getByRole('button', { name: /^Play sound/ });
	await expect(sound.nth(0)).toHaveAttribute('aria-pressed', 'true');
	await sound.nth(2).click();
	await expect(sound.nth(2)).toHaveAttribute('aria-pressed', 'true');
	await expect(sound.nth(0)).toHaveAttribute('aria-pressed', 'false');
	await expect(page.getByText('Sound on')).toHaveCount(1);

	const second = await povs(page).nth(1).getByRole('heading', { level: 2 }).innerText();
	await page.getByRole('button', { name: `Remove: ${second}` }).click();
	await expect(povs(page)).toHaveCount(3);
	await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
	await page.getByRole('button', { name: `Add ${second}` }).click();
	await expect(povs(page)).toHaveCount(4);
	await expect(page.getByText('No other POVs of this stream.')).toBeVisible();

	// The address keeps the choice, so a reload shows the same.
	await page.reload();
	await expect(povs(page)).toHaveCount(4);
	await expect(page.getByRole('button', { name: /^Play sound/ }).nth(2)).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});

test('keyboard shortcuts play and seek', async ({ page }) => {
	await openDay1(page);
	await page.getByRole('heading', { level: 1 }).click();
	await page.keyboard.press('l');
	await expect(page.getByTestId('clock')).toContainText('0:10 /');
	await page.keyboard.press('k');
	await expect(page.getByRole('button', { name: 'Pause all' })).toBeVisible();
	await page.keyboard.press('k');
	await expect(page.getByRole('button', { name: 'Play all' })).toBeVisible();
});

test('the watch page of a stream links to the other POVs', async ({ page }) => {
	await page.goto(EXTRAS);
	await page.getByRole('main').getByRole('article').first().getByRole('link').first().click();
	await page.getByRole('link', { name: 'Watch together with the other POVs: 3' }).click();
	await expect(povs(page)).toHaveCount(4);
});

test('an unknown or ordinary video cannot join', async ({ page }) => {
	await page.goto('/together?v=demo0000001');
	await expect(page.getByText(/There is nothing to watch together here yet/)).toBeVisible();
	await expect(page.getByText(/could not join.*: 1$/)).toBeVisible();
});

for (const theme of ['dark', 'light', 'contrast'] as const) {
	test(`watch together has no WCAG 2.2 AA violations (${theme})`, async ({
		page,
		context,
		baseURL
	}) => {
		await context.addCookies([{ name: 'theme', value: theme, url: baseURL! }]);
		await openDay1(page);
		await seek(page, 120);
		await page.getByRole('radio', { name: 'Large POV with sound' }).check();
		const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
		expect(results.violations).toEqual([]);
	});
}
