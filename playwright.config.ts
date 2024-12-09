import { defineConfig, devices } from '@playwright/test'

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */

const deviceList = ['Desktop Firefox', 'Desktop Chrome', 'Desktop Safari']

const adminTests = deviceList.map((device) => {
  return {
    name: `Admin tests: ${device}`,
    use: {
      ...devices[device],
      storageState: '__playwright__/.auth/adminUser.json',
    },
    testMatch: 'admin.spec.ts',
    dependencies: ['adminSetup'],
  }
})

const circularsTests = deviceList.map((device) => {
  return {
    name: `Circulars Tests: ${device}`,
    use: {
      ...devices[device],
      storageState: '__playwright__/.auth/user.json',
    },
    testMatch: 'circulars/*',
    dependencies: ['setup'],
  }
})

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './__playwright__',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: Boolean(process.env.CI),
  /* Retry on CI only */
  retries: 3,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3333',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    { name: 'setup', testMatch: 'auth.setup.ts' },
    { name: 'adminSetup', testMatch: 'admin.setup.ts' },
    ...adminTests,
    ...circularsTests,
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3333',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000, // 120 Seconds timeout on webServer
  },
})
