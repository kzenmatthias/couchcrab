import { crc32, deflateSync } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { signIn, userIdByName } from './auth-helpers.js';
import {
	idOf,
	insertPosterSeries,
	insertUnsorted,
	setSiteText,
	siteText,
	uniqueTag,
	videoByTitle
} from './manage-helpers.js';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const THEMES = ['dark', 'light', 'contrast'] as const;

test.describe('access', () => {
	test('signed out goes to the sign-in page', async ({ page }) => {
		await page.goto('/manage');
		await expect(page).toHaveURL(/\/signin$/);
	});

	test('a viewer gets 403, an editor gets 403 on admin pages', async ({
		page,
		context,
		baseURL
	}) => {
		await signIn(context, baseURL!, userIdByName('Demo Viewer'));
		expect((await page.goto('/manage'))?.status()).toBe(403);
		expect((await page.goto('/manage/series'))?.status()).toBe(403);
		await context.clearCookies();
		await signIn(context, baseURL!, userIdByName('Demo Editor'));
		expect((await page.goto('/manage'))?.status()).toBe(200);
		expect((await page.goto('/manage/users'))?.status()).toBe(403);
		expect((await page.goto('/manage/site'))?.status()).toBe(403);
		// Form actions check the role on the server too.
		const response = await page.request.post('/manage/users?/role', {
			form: { user_id: '1', role: 'admin' },
			headers: { origin: baseURL! }
		});
		expect(response.status()).toBe(403);
	});
});

test('an editor creates a series with a participant and a rule, applies it and places a video by hand', async ({
	page,
	context,
	baseURL
}) => {
	const tag = uniqueTag();
	const ruled = insertUnsorted('quillby', `Mossbound ${tag} Ep 1`);
	const stray = insertUnsorted('quillby', `Stray upload ${tag}`);
	await signIn(context, baseURL!, userIdByName('Demo Editor'));

	// The header inside /manage links to Manage and back to the site.
	await page.goto('/manage');
	await expect(
		page.getByRole('navigation', { name: 'Management' }).getByRole('link', { name: 'Manage' })
	).toBeVisible();
	await expect(page.getByRole('link', { name: 'Back to the site' })).toBeVisible();

	// Create the series with Quillby, by keyboard where it matters.
	await page
		.getByRole('navigation', { name: 'Management sections' })
		.getByRole('link', { name: 'Series' })
		.click();
	await page.getByRole('link', { name: 'New series' }).click();
	await page.getByLabel('Title').fill(`Mossbound ${tag}`);
	await expect(page.getByLabel('Slug')).toHaveValue(`mossbound-${tag}`);
	await page.getByLabel('Kind').selectOption('season');
	await page.getByLabel('Description in English').fill('A season made by the e2e test.');
	await page.getByLabel('Filter the list').fill('quill');
	const quillby = page.getByRole('checkbox', { name: 'Quillby' });
	await quillby.focus();
	await page.keyboard.press('Space');
	await expect(quillby).toBeChecked();
	await expect(page.getByText('Selected: 1')).toBeVisible();
	// A new series has no episodes yet: the poster stays automatic.
	await expect(page.getByRole('radio', { name: 'Automatic (first episode)' })).toBeChecked();
	await page.getByRole('button', { name: 'Create' }).click();
	await expect(page).toHaveURL(/\/manage\/series\/\d+\?saved=1$/);
	await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();

	// A rule, tested first (nothing written), then created.
	await page.getByRole('link', { name: 'Title rules', exact: true }).last().click();
	await page.getByLabel('Pattern').fill(`Mossbound ${tag}`);
	// Limited to the series dates, a series without a start date matches nothing (and says so).
	const dates = page.getByRole('checkbox', { name: 'Only during the series dates' });
	await expect(dates).toHaveAccessibleDescription(/has no start date/);
	await dates.check();
	await page.getByRole('button', { name: 'Test this rule' }).click();
	await expect(page.getByRole('region', { name: 'Test result' })).toBeFocused();
	await expect(
		page.getByRole('region', { name: 'Test result' }).getByRole('rowheader', { name: ruled })
	).toHaveCount(0);
	await expect(dates).toBeChecked();
	await dates.uncheck();
	await page.getByRole('button', { name: 'Test this rule' }).click();
	const result = page.getByRole('region', { name: 'Test result' });
	await expect(result).toBeFocused();
	await expect(result.getByRole('rowheader', { name: ruled })).toBeVisible();
	expect(videoByTitle(ruled).status).toBe('unsorted');
	await page.getByRole('button', { name: 'Create rule' }).click();
	await expect(page).toHaveURL(/\/rules\/\d+\?saved=1$/);

	// Apply the rules to Unsorted: dry run, then confirm.
	await page.goto('/manage/rules');
	await page.getByRole('button', { name: 'Preview (dry run)' }).click();
	const preview = page.getByRole('region', { name: 'Dry run' });
	await expect(preview).toBeFocused();
	await expect(preview.getByRole('rowheader', { name: ruled })).toBeVisible();
	await expect(preview.getByRole('rowheader', { name: stray })).toHaveCount(0);
	expect(videoByTitle(ruled).status).toBe('unsorted');
	await preview.getByRole('button', { name: /^Place these videos/ }).click();
	await expect(page.getByRole('status').filter({ hasText: /^Placed \d+ of \d+/ })).toBeVisible();
	expect(videoByTitle(ruled)).toMatchObject({ status: 'placed', placedBy: 'rule' });

	// Place the other upload by hand.
	await page.goto('/manage/unsorted');
	const card = page.getByRole('article', { name: stray });
	await card.getByLabel('Series').selectOption({ label: `Mossbound ${tag}` });
	await card.getByRole('button', { name: 'Place' }).click();
	await expect(page.getByRole('status').filter({ hasText: `Placed: ${stray}` })).toBeVisible();
	expect(videoByTitle(stray)).toMatchObject({ status: 'placed', placedBy: 'user' });
	expect(videoByTitle(stray).seriesId).toBe(videoByTitle(ruled).seriesId);
});

test('errors are summarised at the top, linked to the field, and get focus', async ({
	page,
	context,
	baseURL
}) => {
	await signIn(context, baseURL!, userIdByName('Demo Editor'));
	await page.goto('/manage/creators/new');
	await page.getByLabel('Name').fill('Bad Slug Person');
	await page.getByLabel('Slug').fill('Bad Slug');
	await page.getByRole('button', { name: 'Create' }).click();
	const summary = page.locator('.summary');
	await expect(summary).toBeFocused();
	await expect(summary).toContainText('Use lowercase letters, digits and single dashes.');
	await expect(page.getByLabel('Slug')).toHaveAttribute('aria-invalid', 'true');
	await expect(page.getByLabel('Slug')).toHaveAccessibleDescription(/single dashes/);
	await summary.getByRole('link', { name: /Slug/ }).click();
	await expect(page).toHaveURL(/#f-slug$/);
	const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
	expect(results.violations).toEqual([]);
});

test('an admin edits the Dutch footer disclaimer and sees it on the site', async ({
	page,
	context,
	baseURL
}) => {
	const original = siteText('footer_disclaimer', 'nl') ?? '';
	const text = `Couchcrab is een fanproject, niet verbonden met Hermitcraft (${uniqueTag()}).`;
	await signIn(context, baseURL!, userIdByName('Demo Admin'));
	try {
		await page.goto('/manage/site');
		await page.getByLabel('Footer disclaimer (Nederlands)').fill(text);
		await page.getByRole('button', { name: 'Save texts' }).click();
		await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
		await context.addCookies([{ name: 'PARAGLIDE_LOCALE', value: 'nl', url: baseURL! }]);
		await page.goto('/about');
		await expect(page.getByRole('contentinfo')).toContainText(text);
	} finally {
		setSiteText('footer_disclaimer', 'nl', original);
	}
});

/** A plain grey PNG, wider than YouTube's 120 px placeholder. */
function png(width = 320, height = 180): Buffer {
	const chunk = (type: string, data: Buffer) => {
		const body = Buffer.concat([Buffer.from(type), data]);
		const out = Buffer.alloc(body.length + 8);
		out.writeUInt32BE(data.length, 0);
		body.copy(out, 4);
		out.writeUInt32BE(crc32(body), body.length + 4);
		return out;
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header.set([8, 0, 0, 0, 0], 8); // 8-bit greyscale
	const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width, 0x80)]);
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
		chunk('IEND', Buffer.alloc(0))
	]);
}

/** Answers YouTube image requests: only the files in `available` exist. */
async function fakeYouTubeImages(page: Page, available: (file: string) => boolean) {
	await page.route('https://i.ytimg.com/**', (route) => {
		const file = new URL(route.request().url()).pathname.split('/').pop()!;
		return available(file)
			? route.fulfill({ contentType: 'image/png', body: png() })
			: route.fulfill({ status: 404, body: '' });
	});
}

test('an editor chooses an episode and a frame as the poster, with a fallback to smaller sizes', async ({
	page,
	context,
	baseURL
}) => {
	const tag = uniqueTag();
	const { slug, ids } = insertPosterSeries(tag);
	// No maxres images: the posters fall back to sd, as for many real videos.
	await fakeYouTubeImages(page, (file) => !file.startsWith('maxres'));
	await signIn(context, baseURL!, userIdByName('Demo Editor'));

	// Automatic: the thumbnail of the first episode, lazy in the list.
	await page.goto('/series');
	const poster = page.locator('article.poster', {
		has: page.getByRole('heading', { name: `Poster ${tag}` })
	});
	const img = poster.locator('img');
	await img.scrollIntoViewIfNeeded();
	await expect(img).toHaveAttribute('src', `https://i.ytimg.com/vi/${ids[0]}/sddefault.jpg`);
	await expect(img).toHaveAttribute('alt', '');
	await expect(img).toHaveAttribute('loading', 'lazy');

	await page.goto(`/manage/series/${idOf('series', slug)}`);
	const auto = page.getByRole('radio', { name: 'Automatic (first episode)' });
	await expect(auto).toBeChecked();
	const choose = page.getByRole('radio', { name: 'Choose an episode' });
	await choose.focus();
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('ArrowDown');
	await expect(choose).toBeChecked();
	const episode = page.getByRole('combobox', { name: 'Episode', exact: true });
	await expect(episode.locator('option')).toHaveText([
		`Poster ${tag} episode 1 (Quillby)`,
		`Poster ${tag} episode 2 (Quillby)`
	]);
	await episode.selectOption(ids[1]);
	const frames = page.getByRole('group', { name: 'Image from the episode' });
	await expect(frames.getByRole('radio')).toHaveCount(4);
	await expect(frames.getByRole('radio', { name: 'Thumbnail' })).toBeChecked();
	await frames.getByRole('radio', { name: 'Frame 2' }).check();
	// The previews are decorative; the preview poster shows the chosen frame.
	await expect(frames.locator('img').nth(2)).toHaveAttribute('src', /\/sd2\.jpg$/);
	await expect(page.locator('figure.preview img')).toHaveAttribute(
		'src',
		`https://i.ytimg.com/vi/${ids[1]}/sd2.jpg`
	);

	for (const theme of THEMES) {
		await context.addCookies([{ name: 'theme', value: theme, url: baseURL! }]);
		await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
		const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
		expect(results.violations).toEqual([]);
	}

	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('radio', { name: 'Choose an episode' })).toBeChecked();
	await expect(page.getByRole('combobox', { name: 'Episode', exact: true })).toHaveValue(ids[1]);
	await expect(page.getByRole('radio', { name: 'Frame 2' })).toBeChecked();

	// The header is not lazy and shows the chosen frame.
	await page.goto(`/series/${slug}`);
	const header = page.locator('.art-wrap img');
	await expect(header).toHaveAttribute('src', `https://i.ytimg.com/vi/${ids[1]}/sd2.jpg`);
	await expect(header).not.toHaveAttribute('loading', 'lazy');

	// When no size loads at all, the plain surface with the title is left.
	await page.unroute('https://i.ytimg.com/**');
	await fakeYouTubeImages(page, () => false);
	await page.goto(`/series/${slug}`);
	await expect(page.locator('.art-wrap img')).toHaveCount(0);
	await expect(page.getByRole('heading', { level: 1, name: `Poster ${tag}` })).toBeVisible();

	// Back to automatic.
	await page.goto(`/manage/series/${idOf('series', slug)}`);
	await page.getByRole('radio', { name: 'Automatic (first episode)' }).check();
	await expect(page.getByRole('combobox', { name: 'Episode', exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
});

const PAGES = [
	{ name: 'dashboard', path: () => '/manage' },
	{ name: 'creators', path: () => '/manage/creators' },
	{ name: 'new creator', path: () => '/manage/creators/new' },
	{
		name: 'claimed creator',
		path: () => `/manage/creators/${idOf('creators', 'tidecaller-juno')}`
	},
	{ name: 'series', path: () => '/manage/series' },
	{ name: 'new series', path: () => '/manage/series/new' },
	{
		name: 'series details',
		path: () => `/manage/series/${idOf('series', 'lanternfall-season-3')}`
	},
	{ name: 'series groups', path: () => `/manage/series/${idOf('series', 'ember-hearts')}/groups` },
	{
		name: 'series rules',
		path: () => `/manage/series/${idOf('series', 'lanternfall-season-3')}/rules`
	},
	{ name: 'title rules', path: () => '/manage/rules' },
	{ name: 'unsorted', path: () => '/manage/unsorted' },
	{ name: 'site texts', path: () => '/manage/site' },
	{ name: 'site page', path: () => '/manage/site/pages/about' },
	{ name: 'users', path: () => '/manage/users' },
	{ name: 'claims', path: () => '/manage/claims' },
	{ name: 'sync', path: () => '/manage/sync' }
];

for (const theme of THEMES) {
	test.describe(`manage, ${theme} theme`, () => {
		test.beforeEach(async ({ context, baseURL }) => {
			await context.addCookies([{ name: 'theme', value: theme, url: baseURL! }]);
			await signIn(context, baseURL!, userIdByName('Demo Admin'));
		});

		for (const { name, path } of PAGES) {
			test(`${name} has no WCAG 2.2 AA violations`, async ({ page }) => {
				await page.goto(path());
				await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
				await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
				const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
				expect(results.violations).toEqual([]);
			});
		}
	});
}
