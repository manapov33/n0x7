import { chromium, expect, test, type Page } from '@playwright/test';
import { buildScenes } from '../../src/film/scenes.ts';
import { totalScreens } from '../../src/film/timeline.ts';
import { site } from '../../src/content/site.ts';

// Прокрутка до доли прогресса фильма; ждём два кадра, чтобы сцена применилась.
async function scrollToProgress(page: Page, p: number) {
  await page.evaluate(async (p) => {
    const spacer = document.getElementById('film-spacer')!;
    window.scrollTo(0, p * (spacer.offsetHeight - window.innerHeight));
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  }, p);
}
const scene = (page: Page) => page.locator('html').getAttribute('data-scene');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'book');
  await expect(page.locator('#loading')).toHaveCount(0);
});

test('сцена следует за прокруткой и обратно', async ({ page }) => {
  await scrollToProgress(page, 0);
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'table');
  await scrollToProgress(page, 0.25);
  await expect(page.locator('html')).toHaveAttribute('data-scene', /dive|play|surface|turn/);
  await scrollToProgress(page, 1);
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'contacts');
  await scrollToProgress(page, 0);
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'table');
});

test('высота спейсера равна числу экранов фильма', async ({ page }) => {
  const r = await page.evaluate(() => ({
    h: document.getElementById('film-spacer')!.offsetHeight,
    ih: innerHeight,
    fixed: getComputedStyle(document.getElementById('scene')!).position,
  }));
  expect(r.h / r.ih).toBeCloseTo(totalScreens(buildScenes(site.spreads.filter((x) => x.kind === 'work').length)), 1);
  expect(r.fixed).toBe('fixed');
});

test('перезагрузка посередине: сцена сразу соответствует позиции', async ({ page }) => {
  await scrollToProgress(page, 0.5);
  const before = await scene(page);
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.scene);
  expect(await scene(page)).toBe(before);
});

test('resize посередине: сцена та же', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'размер окна задаётся в тесте');
  await scrollToProgress(page, 0.5);
  const before = await scene(page);
  await page.setViewportSize({ width: 900, height: 1200 });
  await page.waitForTimeout(200);
  expect(await scene(page)).toBe(before);
});

test('подпись canvas следует за работой', async ({ page }) => {
  const canvas = page.locator('canvas');
  await scrollToProgress(page, 0);
  const cover = await canvas.getAttribute('aria-label');
  await scrollToProgress(page, 0.25);
  const work = await canvas.getAttribute('aria-label');
  expect(cover).toBeTruthy();
  expect(work).toBeTruthy();
  expect(work).not.toBe(cover);
});

test('счётчика, подсказки и листания жестами нет', async ({ page }) => {
  await expect(page.locator('#counter')).toHaveCount(0);
  await expect(page.getByText('листайте')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  expect(await scene(page)).toBe('table');
});

test('перерисовка идёт при смене прогресса, в покое нет', async ({ page }) => {
  await page.evaluate(() => {
    const w = window as unknown as { __draws: number };
    w.__draws = 0;
    const proto = WebGL2RenderingContext.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    const orig = proto.drawElements!;
    proto.drawElements = function (this: unknown, ...a: unknown[]) {
      w.__draws++;
      return orig.apply(this, a);
    };
  });
  const draws = () => page.evaluate(() => (window as unknown as { __draws: number }).__draws);
  await page.waitForTimeout(1500);
  await page.evaluate(() => ((window as unknown as { __draws: number }).__draws = 0));
  await page.waitForTimeout(800);
  expect(await draws()).toBe(0);
  await scrollToProgress(page, 0.1);
  await expect.poll(draws).toBeGreaterThan(0);
});

test('перезагрузка посередине: экран загрузки ждёт текстуры соседних разворотов', async ({ page }) => {
  await scrollToProgress(page, 0.5);
  let finished = 0;
  page.on('requestfinished', (r) => {
    if (/\/pages\/.*\.webp/.test(r.url())) finished++;
  });
  // Обложка и разворот 1 приходят сразу, остальные с задержкой: загрузка не должна кончиться раньше них.
  const fast = new Set([0, 1].flatMap((i) => [site.spreads[i]!.left, site.spreads[i]!.right]).filter(Boolean));
  await page.route('**/pages/*.webp', async (r) => {
    const name = new URL(r.request().url()).pathname;
    if (![...fast].some((u) => name.endsWith(u!.replace(/^.*\//, '')))) await new Promise((res) => setTimeout(res, 1500));
    await r.continue();
  });
  await page.reload();
  await expect(page.locator('#loading')).toHaveCount(1);
  await page.waitForTimeout(800);
  await expect(page.locator('#loading')).toHaveCount(1); // текстуры ещё не пришли
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: 15000 });
  await page.waitForTimeout(100);
  // сцена play второй работы: разворот 2, соседние 1 и 3 = 6 страниц
  expect(finished).toBeGreaterThanOrEqual(6);
});

test('canvas совпадает с областью без полосы прокрутки', async () => {
  test.skip(test.info().project.name !== 'desktop', 'свой браузер и размер окна');
  // Headless по умолчанию прячет полосы: включаем настоящие.
  const browser = await chromium.launch({
    ignoreDefaultArgs: ['--hide-scrollbars'],
    args: ['--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  // Своя полоса через ::-webkit-scrollbar всегда классическая (занимает место).
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style');
      st.textContent = 'html::-webkit-scrollbar{width:16px}html::-webkit-scrollbar-thumb{background:#999}html::-webkit-scrollbar-track{background:#333}';
      document.head.append(st);
    });
  });
  await page.goto('http://localhost:4173/');
  await expect(page.locator('#loading')).toHaveCount(0);
  const m = await page.evaluate(() => {
    const c = document.querySelector('canvas')!;
    const r = c.getBoundingClientRect();
    return {
      gap: innerWidth - document.documentElement.clientWidth,
      cw: document.documentElement.clientWidth,
      ch: document.documentElement.clientHeight,
      bw: c.width,
      bh: c.height,
      rw: r.width,
      dpr: devicePixelRatio,
    };
  });
  expect(m.gap).toBeGreaterThanOrEqual(10); // предусловие: полоса настоящая
  expect(m.rw).toBe(m.cw);
  expect(m.bw / m.bh).toBeCloseTo(m.cw / m.ch, 2);
  await ctx.close();
  await browser.close();
});

test('текстуры следующего разворота запрашиваются заранее', async ({ browser }) => {
  const page = await browser.newPage();
  const seen = new Set<string>();
  page.on('request', (r) => {
    const m = /\/pages\/([^/?]+\.webp)/.exec(r.url());
    if (m) seen.add(m[1]!);
  });
  const files = (i: number) =>
    [site.spreads[i]!.left, site.spreads[i]!.right].filter(Boolean).map((u) => u!.replace(/^.*\//, ''));
  await page.goto('http://localhost:4173/');
  await expect(page.locator('#loading')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'table'); // разворот 0
  for (const f of files(1)) expect(seen.has(f), f).toBe(true);
  // Работа 2 (play): разворот 2 текущий, разворот 3 уже запрошен, хотя фильм до него не дошёл.
  await scrollToProgress(page, 0.5);
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'play');
  await expect.poll(() => files(3).every((f) => seen.has(f))).toBe(true);
  await page.close();
});
