import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createClaimCheck, createGoogleUser, mainChannelOf, signIn } from './auth-helpers.js';

const THEMES = ['dark', 'light', 'contrast'] as const;
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

type Setup = (page: Page, context: BrowserContext, baseURL: string) => Promise<void>;

/** A signed-in user with a claim check: one claimable, one claimed, one unknown channel. */
async function openClaim(page: Page, context: BrowserContext, baseURL: string) {
	const userId = createGoogleUser('Axe Creator');
	const session = await signIn(context, baseURL, userId);
	createClaimCheck(session.id, userId, [
		{ id: mainChannelOf('pebblewick'), title: 'Pebblewick' },
		{ id: mainChannelOf('tidecaller-juno'), title: 'Tidecaller Juno' },
		{ id: 'UCe2eAxeUnknown000000001', title: 'A channel with a rather long name for reflow' }
	]);
	await page.goto('/claim');
	await expect(page.getByRole('button', { name: 'Claim Pebblewick' })).toBeVisible();
}

async function openMenu(page: Page, context: BrowserContext, baseURL: string) {
	await signIn(context, baseURL, createGoogleUser('Axe Viewer With A Long Display Name'));
	await page.goto('/');
	await page.locator('summary', { hasText: 'Account menu' }).click();
	await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

async function openSignedOutMenu(page: Page) {
	await page.goto('/');
	await page.locator('summary', { hasText: 'Menu' }).click();
	await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
}

const PAGES: { name: string; setup: Setup }[] = [
	{ name: 'sign-in', setup: async (page) => void (await page.goto('/signin')) },
	{
		name: 'sign-in with an error',
		setup: async (page) => void (await page.goto('/signin?error=state'))
	},
	{ name: 'claim', setup: openClaim },
	{ name: 'open account menu', setup: openMenu },
	{ name: 'open signed-out menu', setup: openSignedOutMenu }
];

for (const theme of THEMES) {
	test.describe(`${theme} theme`, () => {
		test.beforeEach(async ({ context, baseURL }) => {
			await context.addCookies([{ name: 'theme', value: theme, url: baseURL! }]);
		});

		for (const { name, setup } of PAGES) {
			test(`${name} has no WCAG 2.2 AA violations`, async ({ page, context, baseURL }) => {
				await setup(page, context, baseURL!);
				await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
				const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
				expect(results.violations).toEqual([]);
			});
		}
	});
}

test.describe('reflow at 320 px', () => {
	test.use({ viewport: { width: 320, height: 640 } });

	for (const { name, setup } of PAGES) {
		test(`${name} has no horizontal scroll`, async ({ page, context, baseURL }) => {
			await setup(page, context, baseURL!);
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			);
			expect(overflow).toBeLessThanOrEqual(0);
		});
	}
});
