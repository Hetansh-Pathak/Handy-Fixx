import { test, expect } from '@playwright/test';

test.use({ channel: 'msedge' });

test('provider-login-smoke', async ({ page }) => {
  await page.route("**/*", async route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin === "http://127.0.0.1:3003") {
      await route.continue();
    } else {
      await route.abort("blockedbyclient");
    }
  });
  await page.goto('http://127.0.0.1:3003');
  await page.getByRole('button', { name: 'Provider Login' }).click();
  await expect(page.getByRole('textbox', { name: 'your@email.com' })).toBeVisible();
});
