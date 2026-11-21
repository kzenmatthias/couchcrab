import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { signIn, userIdByName } from './auth-helpers.js';
import { insertPlacedVideo, sessionOf } from './community-helpers.js';
import { uniqueTag } from './manage-helpers.js';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const THEMES = ['dark', 'light', 'contrast'] as const;

/** The first-visit notice covers part of the page; dismiss it before clicking around. */
async function hideNotice(page: Page) {
	await page.addInitScript(() => localStorage.setItem('couchcrab:notice-dismissed', '1'));
}

test('a viewer suggests a new session, an editor approves it, an admin reverts it', async ({
	page,
	context,
	baseURL
}) => {
	const tag = uniqueTag();
	const title = `Ember Hearts #1: Community ${tag}`;
	const youtubeId = insertPlacedVideo('quillby', 'ember-hearts', 1, title);
	await hideNotice(page);

	// Signed out, "Suggest an edit" leads to the sign-in page with a way back.
	await page.goto(`/watch/${youtubeId}`);
	await page.getByRole('link', { name: 'Suggest an edit' }).click();
	await expect(page).toHaveURL(/\/signin\?redirect_to=%2Fsuggest%3Fvideo%3D/);

	// The viewer suggests session 2, with the keyboard where it matters.
	await signIn(context, baseURL!, userIdByName('Demo Viewer'));
	await page.goto(`/watch/${youtubeId}`);
	await page.getByRole('link', { name: 'Suggest an edit' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Suggest an edit' })).toBeVisible();
	// Sending without a choice lists the error and moves focus to the summary.
	await page.getByRole('button', { name: 'Send suggestion' }).click();
	const summary = page.getByRole('heading', { name: 'There is a problem' });
	await expect(summary).toBeVisible();
	await expect(page.locator('.summary')).toBeFocused();
	const radio = page.getByRole('radio', { name: 'Wrong session or week' });
	await radio.focus();
	await page.keyboard.press('Space');
	await expect(radio).toBeChecked();
	await page.getByLabel('Correct session or week').selectOption({ label: 'Session 2' });
	await page.getByLabel(/Note for reviewers/).fill(`Session 2 per the description ${tag}`);
	await page.getByRole('button', { name: 'Send suggestion' }).click();
	await expect(
		page.getByRole('heading', { name: 'Thanks, your suggestion was sent' })
	).toBeVisible();

	await page.getByRole('link', { name: 'My suggestions' }).first().click();
	const mine = page.getByRole('article').filter({ hasText: tag });
	await expect(mine).toContainText('Status: Waiting for review');
	await expect(mine).toContainText('Before: Session 1');
	await expect(mine).toContainText('After: Session 2');

	// The editor approves it from the review queue.
	await context.clearCookies();
	await signIn(context, baseURL!, userIdByName('Demo Editor'));
	await page.goto('/manage');
	await page
		.getByRole('navigation', { name: 'Management sections' })
		.getByRole('link', { name: 'Review queue' })
		.click();
	const item = page.getByRole('article').filter({ hasText: tag });
	await expect(item).toContainText('From Demo Viewer');
	await expect(item.locator('del')).toHaveText('Session 1');
	await expect(item.locator('ins')).toHaveText('Session 2');
	await item.getByRole('button', { name: `Approve: Quillby · “${title}”` }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Approved:' })).toBeVisible();
	expect(sessionOf(youtubeId)).toBe(2);

	// The history shows the change with the suggestion it came from.
	await page.goto('/manage/history?entity=video');
	const entry = page.getByRole('article').filter({ hasText: title }).first();
	await expect(entry).toContainText(`Demo Editor changed Video “${title}”`);
	await expect(entry).toContainText('From suggestion');

	// The public history of the series shows it too, without the viewer's name.
	await page.goto('/series/ember-hearts/about');
	const history = page.getByRole('region', { name: 'Recent history' });
	await expect(history).toContainText(title);
	await expect(history).toContainText('suggested by the community');
	await expect(history).not.toContainText('Demo Viewer');

	// The admin reverts it, after a confirmation step.
	await context.clearCookies();
	await signIn(context, baseURL!, userIdByName('Demo Admin'));
	await page.goto('/manage/history?entity=video');
	await page
		.getByRole('article')
		.filter({ hasText: title })
		.first()
		.getByRole('link', { name: /^Revert: Video/ })
		.click();
	const confirm = page.getByRole('region', { name: 'Revert this change?' });
	await expect(confirm).toBeFocused();
	await confirm.getByRole('button', { name: 'Yes, revert' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Reverted.' })).toBeVisible();
	expect(sessionOf(youtubeId)).toBe(1);
	await expect(page.getByRole('article').filter({ hasText: title }).first()).toContainText(
		'Reverts entry'
	);

	// The viewer sees the outcome.
	await context.clearCookies();
	await signIn(context, baseURL!, userIdByName('Demo Viewer'));
	await page.goto('/me/suggestions');
	await expect(page.getByRole('article').filter({ hasText: tag })).toContainText(
		'Status: Approved'
	);
});

test('a creator request without an account is on top of the review queue', async ({
	page,
	context,
	baseURL
}) => {
	const tag = uniqueTag();
	await hideNotice(page);
	await page.goto('/');
	await page.getByRole('contentinfo').getByRole('link', { name: 'Creator requests' }).click();
	await expect(page.getByRole('heading', { level: 1, name: 'Creator requests' })).toBeVisible();
	await page.getByRole('radio', { name: 'A correction' }).check();
	await page.getByLabel(/Your name or channel name/).fill(`Request ${tag}`);
	await page.getByLabel(/What should we change/).fill('My channel title is spelled wrong.');
	await page.getByLabel(/Email address/).fill('not-an-email');
	await page.getByRole('button', { name: 'Send request' }).click();
	await expect(page.locator('.summary')).toBeFocused();
	await expect(page.locator('.summary')).toContainText('Enter an email address');
	await page.getByLabel(/Email address/).fill(`creator-${tag}@example.org`);
	await page.getByRole('button', { name: 'Send request' }).click();
	await expect(page.getByRole('heading', { name: /your request was sent/ })).toBeVisible();

	await signIn(context, baseURL!, userIdByName('Demo Editor'));
	await page.goto('/manage/review');
	const articles = page.getByRole('article');
	await expect(articles.first()).toContainText('Creator request');
	const mine = articles.filter({ hasText: `Request ${tag}` });
	await expect(mine).toContainText('Creator request');
	await expect(mine).toContainText(`creator-${tag}@example.org`);
	// Every creator request comes before every other suggestion.
	const flags = await articles.evaluateAll((els) =>
		els.map((el) => el.classList.contains('creatorreq'))
	);
	expect(flags.indexOf(false) === -1 || flags.slice(flags.indexOf(false)).every((f) => !f)).toBe(
		true
	);
});

const SIGNED_IN_PAGES = [
	{ name: 'suggest form', path: '/suggest?series=ember-hearts', user: 'Demo Viewer' },
	{ name: 'my suggestions', path: '/me/suggestions', user: 'Demo Viewer' },
	{ name: 'review queue', path: '/manage/review', user: 'Demo Admin' },
	{ name: 'history', path: '/manage/history', user: 'Demo Admin' },
	{ name: 'series about and history', path: '/series/ember-hearts/about', user: null },
	{ name: 'creator requests', path: '/creator-requests', user: null }
];

for (const theme of THEMES) {
	test.describe(`community, ${theme} theme`, () => {
		for (const { name, path, user } of SIGNED_IN_PAGES) {
			test(`${name} has no WCAG 2.2 AA violations`, async ({ page, context, baseURL }) => {
				await context.addCookies([{ name: 'theme', value: theme, url: baseURL! }]);
				if (user) await signIn(context, baseURL!, userIdByName(user));
				await page.goto(path);
				await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
				await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
				const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
				expect(results.violations).toEqual([]);
			});
		}
	});
}
