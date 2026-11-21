import { expect, test } from '@playwright/test';
import {
	createClaimCheck,
	createGoogleUser,
	mainChannelOf,
	sessionExists,
	signIn,
	userIdByName
} from './auth-helpers.js';

const UNKNOWN_CHANNEL = 'UCe2eNotOnCouchcrab00001';

test.describe('signed out', () => {
	test('the header menu links to the sign-in page', async ({ page }) => {
		await page.goto('/');
		await page.locator('summary', { hasText: 'Menu' }).click();
		await page.getByRole('link', { name: 'Sign in', exact: true }).click();
		await expect(page).toHaveURL(/\/signin$/);
		await expect(
			page.getByRole('heading', { level: 1, name: 'Sign in to Couchcrab' })
		).toBeVisible();
	});

	test('sign-in explains both paths and disables providers without keys', async ({ page }) => {
		await page.goto('/signin');
		const discord = page.getByRole('button', { name: 'Continue with Discord' });
		const google = page.getByRole('button', { name: 'Continue with Google' });
		await expect(discord).toBeDisabled();
		await expect(google).toBeDisabled();
		await expect(discord).toHaveAccessibleDescription(/not set up on this server/);
		await expect(google).toHaveAccessibleDescription(/GOOGLE_CLIENT_ID/);
		await expect(page.getByRole('region', { name: 'Are you a creator?' })).toContainText(
			"We only ask YouTube which channels you own. We don't post anything and we don't keep your Google token."
		);
		await page.getByText('What Couchcrab asks YouTube and keeps').click();
		await expect(page.getByText(/^Never keeps: your Google token/)).toBeVisible();
		// The start routes do not break without keys either.
		await page.goto('/auth/google');
		await expect(page).toHaveURL(/\/signin\?error=not_configured$/);
		await expect(page.getByRole('alert')).toHaveText(
			'This sign-in method is not set up on this server.'
		);
	});

	test('the claim page asks to sign in first', async ({ page }) => {
		await page.goto('/claim');
		await expect(page).toHaveURL(/\/signin$/);
	});

	test('sign out only accepts same-site posts', async ({ request }) => {
		const response = await request.post('/auth/signout', {
			headers: {
				origin: 'https://evil.example',
				'content-type': 'application/x-www-form-urlencoded'
			},
			data: 'redirect_to=/',
			maxRedirects: 0
		});
		expect(response.status()).toBe(403);
	});
});

test.describe('account menu', () => {
	test('opens and closes with the keyboard and returns focus', async ({
		page,
		context,
		baseURL
	}) => {
		await signIn(context, baseURL!, userIdByName('Demo Viewer'));
		await page.goto('/');
		await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0);

		const toggle = page.locator('summary', { hasText: 'Account menu' });
		await expect(toggle).toHaveAccessibleName('Account menu, Demo Viewer');
		await toggle.focus();
		await page.keyboard.press('Enter');
		const panel = page.locator('details.account');
		await expect(panel).toHaveAttribute('open', '');
		await expect(panel.getByText('Signed in as Demo Viewer')).toBeVisible();
		await expect(panel.getByRole('group', { name: 'Theme' })).toBeVisible();
		for (const name of ['System', 'Dark', 'Light', 'High contrast']) {
			await expect(panel.getByRole('radio', { name })).toBeVisible();
		}
		await expect(panel.getByRole('link', { name: 'Who I watch' })).toHaveAttribute(
			'href',
			'/settings/creators'
		);
		await expect(panel.getByRole('link', { name: 'Display & accessibility' })).toHaveAttribute(
			'href',
			'/settings/display'
		);
		await expect(panel.getByRole('link', { name: 'Creator dashboard' })).toHaveCount(0);

		// Tab moves into the panel; Escape closes it and puts focus back on the toggle.
		await page.keyboard.press('Tab');
		await expect(panel.getByRole('radio', { name: 'System' })).toBeFocused();
		await page.keyboard.press('Escape');
		await expect(panel).not.toHaveAttribute('open', '');
		await expect(toggle).toBeFocused();
	});

	test('changes the theme from the menu', async ({ page, context, baseURL }) => {
		await signIn(context, baseURL!, userIdByName('Demo Viewer'));
		await page.goto('/about');
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
		await page.locator('summary', { hasText: 'Account menu' }).click();
		const group = page.getByRole('group', { name: 'Theme' });
		await group.getByRole('radio', { name: 'System' }).focus();
		await page.keyboard.press('ArrowDown');
		await expect(group.getByRole('radio', { name: 'Dark' })).toBeChecked();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
		await group.getByRole('radio', { name: 'High contrast' }).check();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'contrast');
		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'contrast');
		// The footer no longer has a theme switch.
		await expect(page.getByRole('contentinfo').getByLabel('Theme')).toHaveCount(0);
	});

	test('works without JavaScript', async ({ browser, baseURL }) => {
		const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
		await signIn(context, baseURL!, userIdByName('Demo Viewer'));
		const page = await context.newPage();
		await page.goto('/about');
		await page.locator('summary', { hasText: 'Account menu' }).click();
		await page.getByRole('radio', { name: 'Light' }).check();
		await page.getByRole('button', { name: 'Apply theme' }).click();
		await expect(page).toHaveURL(/\/about$/);
		await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
		await context.close();
	});

	test('shows the creator dashboard link for a claimed creator', async ({
		page,
		context,
		baseURL
	}) => {
		await signIn(context, baseURL!, userIdByName('Tidecaller Juno'));
		await page.goto('/');
		await page.locator('summary', { hasText: 'Account menu' }).click();
		await expect(page.getByRole('link', { name: 'Creator dashboard' })).toHaveAttribute(
			'href',
			'/creator'
		);
	});

	test('signs out', async ({ page, context, baseURL }) => {
		const session = await signIn(context, baseURL!, createGoogleUser('Leaving Viewer'));
		await page.goto('/series');
		await page.locator('summary', { hasText: 'Account menu' }).click();
		await page.getByRole('button', { name: 'Sign out' }).click();
		await expect(page).toHaveURL(/\/series$/);
		await page.locator('summary', { hasText: 'Menu' }).click();
		await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
		expect(sessionExists(session.id)).toBe(false);
		const cookies = await context.cookies();
		expect(cookies.find((c) => c.name === 'couchcrab_session')).toBeUndefined();
	});
});

test.describe('claim', () => {
	test('claims a matching creator and then shows it as verified', async ({
		page,
		context,
		baseURL
	}) => {
		const userId = createGoogleUser('Marrow Test');
		const session = await signIn(context, baseURL!, userId);
		createClaimCheck(session.id, userId, [
			{ id: mainChannelOf('marrowfen'), title: 'Marrowfen' },
			{ id: UNKNOWN_CHANNEL, title: 'Marrowfen Plays' }
		]);

		await page.goto('/claim');
		await expect(
			page.getByRole('heading', { level: 1, name: 'Claim your creator profile' })
		).toBeVisible();
		await expect(page.getByText('This account owns 2 YouTube channels.')).toBeVisible();
		const list = page.getByRole('list', { name: 'Your YouTube channels' });
		await expect(list.getByRole('listitem').nth(0)).toContainText('Matches the creator Marrowfen');
		await expect(list.getByRole('listitem').nth(1)).toContainText('Needs review');

		await page.getByRole('button', { name: 'Claim Marrowfen' }).click();
		await expect(page.getByText('You claimed Marrowfen.')).toBeFocused();
		await expect(list.getByRole('listitem').nth(0)).toContainText('Verified');
		await expect(page.getByRole('button', { name: 'Claim Marrowfen' })).toHaveCount(0);

		// The creator page now shows the badge, and the menu links the dashboard.
		await page.getByRole('link', { name: 'View your creator profile' }).click();
		await expect(page.getByText('Verified creator').first()).toBeVisible();
		await page.locator('summary', { hasText: 'Account menu' }).click();
		await expect(page.getByRole('link', { name: 'Creator dashboard' })).toBeVisible();
	});

	test('shows a creator claimed by someone else as not claimable', async ({
		page,
		context,
		baseURL
	}) => {
		const userId = createGoogleUser('Not Juno');
		const session = await signIn(context, baseURL!, userId);
		createClaimCheck(session.id, userId, [{ id: mainChannelOf('tidecaller-juno'), title: 'Juno' }]);
		await page.goto('/claim');
		await expect(page.getByText('Already claimed', { exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: /^Claim / })).toHaveCount(0);
	});

	test('"This isn\'t me" signs out', async ({ page, context, baseURL }) => {
		const userId = createGoogleUser('Wrong Account');
		const session = await signIn(context, baseURL!, userId);
		createClaimCheck(session.id, userId, [{ id: UNKNOWN_CHANNEL, title: 'Someone' }]);
		await page.goto('/claim');
		await page.getByRole('button', { name: "This isn't me" }).click();
		await expect(page).toHaveURL(/\/$/);
		await expect(page.locator('summary', { hasText: 'Menu' })).toBeVisible();
		expect(sessionExists(session.id)).toBe(false);
	});
});
