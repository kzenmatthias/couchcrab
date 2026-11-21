import { expect, test, type Locator, type Page } from '@playwright/test';

/** Presses Tab until `target` has focus (keyboard only, no clicks). */
async function tabTo(page: Page, target: Locator, max = 150) {
	for (let i = 0; i < max; i++) {
		await page.keyboard.press('Tab');
		if (await target.evaluate((el) => el === document.activeElement)) return;
	}
	throw new Error(`Could not reach ${String(target)} with Tab`);
}

/** Waits until the prefs store has read localStorage (it writes the cookie mirror then). */
async function hydrated(page: Page) {
	await page.waitForFunction(() => document.cookie.includes('viewing='));
}

const SEASON = '/series/lanternfall-season-3';
const LIVE = '/series/ember-hearts';

test('who I watch filters home and the series timeline', async ({ page }) => {
	await page.goto('/settings');
	await expect(page).toHaveURL(/\/settings\/creators$/);
	await hydrated(page);
	await expect(page.getByRole('heading', { level: 1, name: 'Who I watch' })).toBeVisible();
	const count = page.getByRole('status').filter({ hasText: 'selected' });
	await expect(count).toHaveText('12 selected');

	await page.getByRole('button', { name: 'Clear all' }).click();
	await expect(count).toHaveText('0 selected');
	const pebblewick = page.getByRole('button', { name: 'Pebblewick', exact: true });
	await expect(pebblewick).toHaveAttribute('aria-pressed', 'false');
	await expect(pebblewick).toContainText('Add');
	await pebblewick.click();
	await expect(pebblewick).toHaveAttribute('aria-pressed', 'true');
	await expect(pebblewick).toContainText('Watching');
	await expect(count).toHaveText('1 selected');

	// The search field narrows the list.
	await page.getByLabel('Find a creator').fill('tide');
	await expect(page.getByRole('button', { name: 'Tidecaller Juno' })).toBeVisible();
	await expect(pebblewick).toBeHidden();

	await page.goto('/');
	const uploads = page.getByRole('region', { name: 'New uploads' }).getByRole('article');
	await expect(uploads.first()).toBeVisible();
	for (const card of await uploads.all()) await expect(card).toContainText('Pebblewick');

	await page.goto(SEASON);
	await expect(page.getByRole('heading', { name: 'Watching 1 of 8 creators' })).toBeVisible();
	await expect(page.getByText('Global list', { exact: true })).toBeVisible();
	const cards = page.getByRole('main').getByRole('article');
	await expect(cards.first()).toBeVisible();
	for (const card of await cards.all()) await expect(card).toContainText('Pebblewick');

	// Select all brings everyone back (also after a reload: the server reads the cookie).
	await page.goto('/settings/creators');
	await page.getByRole('button', { name: 'Select all' }).click();
	await expect(count).toHaveText('12 selected');
	await page.goto(SEASON);
	await expect(page.getByRole('heading', { name: 'Watching 8 of 8 creators' })).toBeVisible();
});

test('a series can use its own list and reset to the global one', async ({ page }) => {
	await page.goto(SEASON);
	await hydrated(page);
	await page.getByRole('link', { name: 'Change creators' }).click();
	await expect(page).toHaveURL(/\/settings\/creators\/lanternfall-season-3$/);
	await expect(page.getByRole('radio', { name: 'Global list' })).toBeChecked();
	await page.getByRole('button', { name: 'Marrowfen', exact: true }).click();
	await expect(page.getByRole('radio', { name: 'Custom' })).toBeChecked();
	await expect(page.getByText('7 of 8 selected')).toBeVisible();

	await page.goto(SEASON);
	await expect(page.getByRole('heading', { name: 'Watching 7 of 8 creators' })).toBeVisible();
	await expect(page.getByText('Custom list', { exact: true })).toBeVisible();
	await expect(
		page.getByRole('main').getByRole('article').filter({ hasText: 'Marrowfen' })
	).toHaveCount(0);
	await page.getByRole('link', { name: 'By creator' }).click();
	await expect(page.getByRole('heading', { level: 2, name: /Marrowfen/ })).toHaveCount(0);

	// Other series still follow the global list.
	await page.goto('/series/skyforge-games-2026');
	await expect(
		page.getByRole('main').getByRole('article').filter({ hasText: 'Marrowfen' })
	).toHaveCount(1);

	// The per-series section of the settings shows the custom choice.
	await page.goto('/settings/creators');
	const row = page.getByRole('group', { name: 'Creators for Lanternfall Season 3' });
	await expect(row.getByRole('radio', { name: 'Custom' })).toBeChecked();

	await page.goto(SEASON);
	await page.getByRole('button', { name: 'Reset to global list' }).click();
	await expect(page.getByRole('heading', { name: 'Watching 8 of 8 creators' })).toBeVisible();
	await expect(
		page.getByRole('main').getByRole('article').filter({ hasText: 'Marrowfen' }).first()
	).toBeVisible();
});

test('spoiler-free mode hides titles, also from the HTML', async ({ page }) => {
	await page.goto(LIVE);
	await hydrated(page);
	await expect(page.getByRole('main')).toContainText('Ember Hearts #1:');
	const sw = page.getByRole('switch', { name: 'Spoiler-free mode' });
	await expect(sw).toHaveAttribute('aria-checked', 'false');
	await sw.click();
	await expect(sw).toHaveAttribute('aria-checked', 'true');
	await expect(sw).toContainText('On');
	await expect(page.getByText('Title hidden').first()).toBeVisible();
	await expect(page.getByRole('main')).not.toContainText('Ember Hearts #');
	await expect(page.getByRole('heading', { level: 3, name: 'Episode 1' }).first()).toBeVisible();

	// Server render after a reload: the real titles are not in the HTML at all.
	await page.reload();
	const html = await page.content();
	expect(html).not.toContain('Ember Hearts #');
	await expect(page.getByRole('switch', { name: 'Spoiler-free mode' })).toHaveAttribute(
		'aria-checked',
		'true'
	);

	// Watch page: a neutral heading, and "Show real title" reveals it.
	await page
		.getByRole('heading', { level: 3, name: 'Episode 1' })
		.first()
		.getByRole('link')
		.click();
	await expect(page).toHaveURL(/\/watch\//);
	const h1 = page.getByRole('heading', { level: 1 });
	await expect(h1).toHaveText(/^Ember Hearts, Session 1: .+, Episode 1$/);
	await expect(page.getByText('Title hidden (spoiler-free)')).toBeVisible();
	expect(await page.content()).not.toContain('Ember Hearts #');
	await page.getByRole('button', { name: 'Show real title' }).click();
	await expect(h1).toHaveText(/^Ember Hearts #1: /);
	await page.getByRole('button', { name: 'Hide real title' }).click();
	await expect(h1).toHaveText(/^Ember Hearts, Session 1/);
});

test('mark as watched shows on the cards, and reveals the title in spoiler-free mode', async ({
	page,
	context,
	baseURL
}) => {
	await context.addCookies([{ name: 'viewing', value: '1~s1', url: baseURL! }]);
	await page.goto('/watch/demo0000001');
	await hydrated(page);
	const mark = page.getByRole('button', { name: 'Mark as watched' });
	await expect(mark).toHaveAttribute('aria-pressed', 'false');
	await mark.click();
	await expect(mark).toHaveAttribute('aria-pressed', 'true');
	await expect(
		page
			.getByRole('main')
			.getByText(/^✓ ?Watched$/)
			.first()
	).toBeVisible();
	// Watched: the real title comes back.
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Lanternfall 3: /);

	await page.goto(SEASON);
	const card = page.getByRole('article').filter({ hasText: /Lanternfall 3: .*\(Ep 1\)/ });
	await expect(card).toHaveCount(1);
	await expect(card).toContainText('Watched');
	await expect(page.getByText('Title hidden').first()).toBeVisible();

	// Unmark again with the keyboard shortcut M.
	await page.goto('/watch/demo0000001');
	await hydrated(page);
	await expect(mark).toHaveAttribute('aria-pressed', 'true');
	await page.keyboard.press('m');
	await expect(mark).toHaveAttribute('aria-pressed', 'false');
});

test.describe('autoplay countdown', () => {
	test('counts down, pauses on focus and plays now with the keyboard', async ({ page }) => {
		await page.goto('/watch/demo0000001');
		await hydrated(page);
		const startUrl = page.url();
		await tabTo(page, page.getByRole('button', { name: 'Simulate end of video' }));
		await page.keyboard.press('Enter');

		const box = page.getByRole('region', { name: /Up next/ });
		await expect(box).toBeVisible();
		await expect(box).toContainText(/Up next in 1[0-5] s:/);
		// Announced once through the polite live region.
		await expect(
			page.locator('[aria-live="polite"]').filter({ hasText: 'Up next in 15 seconds' })
		).toHaveCount(1);
		// It counts while not focused or hovered.
		await expect(box).toContainText('Up next in 13 s:', { timeout: 5000 });

		await tabTo(page, box.getByRole('button', { name: 'Play now' }));
		await expect(box).toContainText('Countdown paused');
		const frozen = (await box.locator('p').first().textContent())!.replace('Countdown paused', '');
		await page.waitForTimeout(2500);
		expect((await box.locator('p').first().textContent())!.replace('Countdown paused', '')).toBe(
			frozen
		);

		await page.keyboard.press('Enter');
		await expect(page).not.toHaveURL(startUrl);
		await expect(page).toHaveURL(/\/watch\/demo/);
		await expect(page.getByRole('region', { name: /Up next/ })).toHaveCount(0);
	});

	test('can be cancelled with the keyboard', async ({ page }) => {
		await page.goto('/watch/demo0000001');
		await hydrated(page);
		await tabTo(page, page.getByRole('button', { name: 'Simulate end of video' }));
		await page.keyboard.press('Enter');
		const box = page.getByRole('region', { name: /Up next/ });
		await tabTo(page, box.getByRole('button', { name: 'Cancel' }));
		await page.keyboard.press('Enter');
		await expect(box).toHaveCount(0);
		await expect(page).toHaveURL(/\/watch\/demo0000001$/);
		// Ending a video marks it watched.
		await expect(page.getByRole('button', { name: 'Mark as watched' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
	});

	test('"wait for me" shows the next episode without counting', async ({ page }) => {
		await page.goto('/settings/display');
		await hydrated(page);
		await page.getByRole('radio', { name: 'Wait for me' }).check();
		await page.goto('/watch/demo0000001');
		await page.getByRole('button', { name: 'Simulate end of video' }).click();
		const box = page.getByRole('region', { name: /Up next/ });
		await expect(box).toContainText('Up next:');
		await expect(box).not.toContainText(/\d+ s:/);
	});

	test('nothing plays next when autoplay is off', async ({ page }) => {
		await page.goto('/settings/display');
		await hydrated(page);
		await page.getByRole('switch', { name: 'Autoplay next episode' }).click();
		await page.goto('/watch/demo0000001');
		await page.getByRole('button', { name: 'Simulate end of video' }).click();
		await expect(page.getByRole('button', { name: 'Mark as watched' })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		await expect(page.getByRole('region', { name: /Up next/ })).toHaveCount(0);
	});
});

test('continue watching shows started episodes on home', async ({ page }) => {
	await page.goto('/');
	await hydrated(page);
	await expect(page.getByRole('region', { name: 'Continue watching' })).toHaveCount(0);
	await page.evaluate(() =>
		localStorage.setItem(
			'couchcrab:progress',
			JSON.stringify({ demo0000002: { seconds: 600, watched: false, updatedAt: Date.now() } })
		)
	);
	await page.reload();
	const row = page.getByRole('region', { name: 'Continue watching' });
	await expect(row.getByRole('article')).toHaveCount(1);
	await expect(row.getByRole('article')).toContainText('% watched');
});

test('display settings persist and apply to the page', async ({ page }) => {
	await page.goto('/settings/display');
	await hydrated(page);
	const html = page.locator('html');
	await page.getByRole('radio', { name: 'Larger' }).check();
	await expect(html).toHaveAttribute('data-text-size', 'larger');
	await page.getByRole('switch', { name: 'Underline all links' }).click();
	await expect(html).toHaveAttribute('data-underline-links', 'on');
	await page.getByRole('radio', { name: 'Reduce' }).check();
	await page.getByRole('switch', { name: 'Turn captions on when a video starts' }).click();
	await page.getByLabel('Preferred caption language').selectOption('nl');

	await page.reload();
	// Applied before first paint by the inline script, and the controls show the saved values.
	await expect(html).toHaveAttribute('data-text-size', 'larger');
	await expect(html).toHaveAttribute('data-motion', 'reduce');
	expect(await html.evaluate((el) => getComputedStyle(el).fontSize)).toBe('20px');
	await expect(page.getByRole('radio', { name: 'Larger' })).toBeChecked();
	await expect(page.getByRole('switch', { name: 'Underline all links' })).toHaveAttribute(
		'aria-checked',
		'true'
	);
	await expect(
		page.getByRole('switch', { name: 'Turn captions on when a video starts' })
	).toHaveAttribute('aria-checked', 'true');
	await expect(page.getByLabel('Preferred caption language')).toHaveValue('nl');
	const navLink = page
		.getByRole('navigation', { name: 'Main' })
		.getByRole('link', { name: 'Series' });
	expect(await navLink.evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe('underline');
});

test('text-only lists replace the thumbnails, also in the server render', async ({ page }) => {
	await page.goto('/settings/display');
	await hydrated(page);
	await page.getByRole('switch', { name: 'Text-only lists' }).click();
	await page.goto(SEASON);
	await expect(page.locator('main .thumb')).toHaveCount(0);
	await expect(page.locator('main ul.text-list').first()).toBeVisible();
	const html = await (await page.request.get(SEASON)).text();
	expect(html).toContain('text-list');
	expect(html).not.toContain('class="card-grid');
});

test('shortcut keys can be changed and turned off', async ({ page }) => {
	await page.goto('/settings/display');
	await hydrated(page);
	const change = page.getByRole('button', { name: 'Change: Mark as watched' });
	await change.click();
	await expect(page.getByRole('status').filter({ hasText: 'Press the new key' })).toBeVisible();
	await page.keyboard.press('n');
	await expect(page.getByText('N is already used for Next episode on the timeline')).toBeVisible();
	await page.keyboard.press('w');
	await expect(page.getByText('Mark as watched: key W.')).toBeVisible();

	await page.goto('/watch/demo0000001');
	await hydrated(page);
	const mark = page.getByRole('button', { name: 'Mark as watched' });
	await page.keyboard.press('m');
	await expect(mark).toHaveAttribute('aria-pressed', 'false');
	await page.keyboard.press('w');
	await expect(mark).toHaveAttribute('aria-pressed', 'true');
	// Ignored while typing in a field.
	await page.getByRole('searchbox').first().fill('w');
	await expect(mark).toHaveAttribute('aria-pressed', 'true');

	await page.goto('/settings/display');
	await page.getByRole('switch', { name: 'Single-key shortcuts' }).click();
	await page.goto('/watch/demo0000001');
	await hydrated(page);
	await page.keyboard.press('w');
	await expect(mark).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByText('Shortcuts:')).toHaveCount(0);
});

test('N plays the next episode on the timeline', async ({ page }) => {
	await page.goto('/watch/demo0000001');
	await hydrated(page);
	const next = page.getByRole('link', { name: /^Next: / });
	const href = await next.getAttribute('href');
	await page.keyboard.press('n');
	await expect(page).toHaveURL(new RegExp(`${href}$`));
});

test('the Who I watch link leads to the creator settings', async ({ page }) => {
	await page.goto('/who-i-watch');
	await expect(page).toHaveURL(/\/settings\/creators$/);
});
