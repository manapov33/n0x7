import { expect, test } from '@playwright/test';
import { site } from '../../src/content/site.ts';

test.describe('без JS', () => {
  test.use({ javaScriptEnabled: false });

  test('запасная страница видна', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#fallback h1')).toContainText('N0X7');
    await expect(page.locator('#fallback a[href^="tel:"]').first()).toBeVisible();
    await expect(page.locator('#fallback #contacts')).toBeVisible();
  });
});

test('текст запасной страницы лежит в исходном HTML (для поисковиков)', async ({ request }) => {
  const res = await request.get('/');
  const html = await res.text();
  const work = site.spreads.find((s) => s.kind === 'work')!;
  expect(html).toContain(work.title);
  expect(html).toContain('концепт');
  expect(html).toContain(`href="${site.telegramUrl}"`);
  expect(html).not.toContain('<!--FALLBACK-->');
});
