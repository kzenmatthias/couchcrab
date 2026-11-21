import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
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
			PORT: String(PORT),
			ORIGIN: BASE_URL
		}
	}
});
