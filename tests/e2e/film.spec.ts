import { expect, test, type Page } from '@playwright/test';

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
  expect(r.h / r.ih).toBeCloseTo(10.4, 1);
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
