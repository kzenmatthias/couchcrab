import { defineConfig, devices } from '@playwright/test';

// E2E_PORT lets two checkouts run their e2e suites at the same time.
const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
	testDir: './tests/e2e',
	testMatch: '**/*.e2e.ts',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['github'], ['list']] : 'list',
	use: {
		baseURL: BASE_URL,
		reducedMotion: 'reduce',
		trace: 'retain-on-failure'
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
	webServer: {
		// A fresh database with the demo data, then the production build.
		command: 'npm run db:migrate -- --fresh && npm run db:seed && npm run build && node build',
		url: BASE_URL,
		timeout: 180_000,
		reuseExistingServer: false,
		env: {
			DATABASE_URL: './data/e2e.db',
			// Build with the "Simulate end of video" button on the demo player (see YouTubePlayer).
			VITE_TEST_HOOKS: '1',
			PORT: String(PORT),
			ORIGIN: BASE_URL
		}
	}
});
