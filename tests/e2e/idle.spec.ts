import { expect, test, type Page } from '@playwright/test';

// Считаем вызовы отрисовки WebGL: в покое книга не должна перерисовываться.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __draws: number };
    w.__draws = 0;
    for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'] as const) {
      const proto = WebGL2RenderingContext.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
      const orig = proto[name]!;
      proto[name] = function (this: unknown, ...a: unknown[]) {
        w.__draws++;
        return orig.apply(this, a);
      };
    }
  });
});

const draws = (page: Page) => page.evaluate(() => (window as unknown as { __draws: number }).__draws);
const reset = (page: Page) => page.evaluate(() => ((window as unknown as { __draws: number }).__draws = 0));

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'book');
  await expect(page.locator('#loading')).toHaveCount(0);
  await page.waitForTimeout(3000); // камера доехала, текстуры пришли
}

test('в покое отрисовок нет', async ({ page }) => {
  await ready(page);
  await reset(page);
  await page.waitForTimeout(2000);
  expect(await draws(page)).toBe(0);
});

test('листание перерисовывает, потом снова покой', async ({ page }) => {
  await ready(page);
  await reset(page);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => draws(page)).toBeGreaterThan(0);
  await page.waitForTimeout(3000);
  await reset(page);
  await page.waitForTimeout(1000);
  expect(await draws(page)).toBe(0);
});

test('свет за курсором перерисовывает', async ({ page }) => {
  test.skip(test.info().project.name === 'phone', 'свет за курсором — только устройства с hover');
  await ready(page);
  await reset(page);
  await page.mouse.move(300, 200);
  await page.mouse.move(900, 600, { steps: 5 });
  await expect.poll(() => draws(page)).toBeGreaterThan(0);
});

test('изменение размера окна перерисовывает', async ({ page }) => {
  await ready(page);
  await reset(page);
  const vp = page.viewportSize()!;
  await page.setViewportSize({ width: vp.width - 40, height: vp.height - 40 });
  await expect.poll(() => draws(page)).toBeGreaterThan(0);
  await page.waitForTimeout(3000);
  await reset(page);
  await page.waitForTimeout(1000);
  expect(await draws(page)).toBe(0);
});

test('приход текстуры перерисовывает', async ({ page }) => {
  let hold = false;
  const held: (() => void)[] = [];
  await page.route('**/pages/*.webp', async (r) => {
    if (hold) await new Promise<void>((res) => held.push(res));
    await r.continue();
  });
  await ready(page);
  hold = true; // текстуры разворота 2 грузятся, когда книга дошла до разворота 1
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => held.length).toBeGreaterThan(0);
  await page.waitForTimeout(3000); // переворот и камера успокоились, текстуры придержаны
  await reset(page);
  await page.waitForTimeout(500);
  expect(await draws(page)).toBe(0);
  held.splice(0).forEach((res) => res()); // текстуры приходят
  await expect.poll(() => draws(page), { timeout: 4000 }).toBeGreaterThan(0);
});
