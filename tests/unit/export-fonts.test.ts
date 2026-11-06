import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assertFontsLoaded } from '../../scripts/export-pages.ts';

let browser: Browser;
let page: Page;
beforeAll(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
});
afterAll(async () => {
  await browser.close();
});

describe('assertFontsLoaded', () => {
  it('проходит, если макет подключает _base.css и шрифты загрузились', async () => {
    await page.goto(pathToFileURL(join(process.cwd(), 'pages/cover-right.html')).href);
    await page.evaluate(() => document.fonts.ready);
    await expect(assertFontsLoaded(page, 'cover-right')).resolves.toBeUndefined();
  }, 30_000);

  it('падает с понятной ошибкой, если шрифт назван, но не подключён', async () => {
    await page.setContent('<div style="font: 500 40px Cormorant, serif">Лилея</div>');
    await page.evaluate(() => document.fonts.ready);
    await expect(assertFontsLoaded(page, 'broken')).rejects.toThrow(/broken.*Cormorant/);
  }, 30_000);

  it('падает, если подключён шрифт, но не та насыщенность', async () => {
    await page.goto(pathToFileURL(join(process.cwd(), 'pages/cover-right.html')).href);
    await page.addStyleTag({ content: '.name { font-weight: 700 !important; }' });
    await page.evaluate(() => document.fonts.ready);
    await expect(assertFontsLoaded(page, 'weight')).rejects.toThrow(/Cormorant/);
  }, 30_000);
});
