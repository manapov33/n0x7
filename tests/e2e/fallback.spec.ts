import { expect, test } from '@playwright/test';

test.use({ javaScriptEnabled: false });

test('без JS запасная страница видна', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#fallback h1')).toContainText('N0X7');
  await expect(page.locator('#fallback a[href^="tel:"]').first()).toBeVisible();
  await expect(page.locator('#fallback #contacts')).toBeVisible();
});
