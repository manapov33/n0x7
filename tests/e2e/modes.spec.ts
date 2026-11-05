import { expect, test } from '@playwright/test';

test('обычная загрузка: книга, canvas виден, запасная страница скрыта', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'book');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#fallback')).toBeHidden();
  await expect(page.locator('#counter')).toHaveAttribute('data-spread', '0');
});

test('getContext возвращает null: запасная страница, canvas нет', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  await page.goto('/');
  await expect(page.locator('#fallback')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-mode', 'book');
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('reduced motion: запасная страница', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#fallback')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('не загрузились страницы: запасная страница', async ({ page }) => {
  await page.route('**/pages/**', (r) => r.abort());
  await page.goto('/');
  await expect(page.locator('#fallback')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('потеря контекста WebGL: запасная страница', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#counter')).toHaveAttribute('data-spread', '0');
  await expect(page.locator('#loading')).toHaveCount(0);
  await page.evaluate(() => {
    const c = document.querySelector('canvas')!;
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGL2RenderingContext;
    gl.getExtension('WEBGL_lose_context')!.loseContext();
  });
  await expect(page.locator('#fallback')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('изменение размера окна меняет буфер canvas по соотношению сторон', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const size = () =>
    canvas.evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height, dpr: devicePixelRatio }));
  const before = await size();
  expect(before.w).toBe(Math.round(1440 * Math.min(before.dpr, 2)));
  expect(before.h).toBe(Math.round(900 * Math.min(before.dpr, 2)));

  await page.setViewportSize({ width: 800, height: 1000 });
  await expect.poll(async () => (await size()).w).toBe(Math.round(800 * Math.min(before.dpr, 2)));
  const after = await size();
  expect(after.h).toBe(Math.round(1000 * Math.min(before.dpr, 2)));
  expect(after.w / after.h).toBeCloseTo(0.8, 2);

  // Буфер и показанный бокс должны браться из одного размера (не 100vh: на мобильных он выше innerHeight).
  const box = await canvas.evaluate((c: HTMLCanvasElement) => {
    const r = c.getBoundingClientRect();
    return { w: r.width, h: r.height, iw: innerWidth, ih: innerHeight, cssH: getComputedStyle(c).height };
  });
  expect(box.w / box.h).toBeCloseTo(after.w / after.h, 2);
  expect(box.w / box.h).toBeCloseTo(box.iw / box.ih, 2);
});

test('CSS canvas не использует единицы vh', async ({ request }) => {
  const html = await (await request.get('/')).text();
  const href = /href="(\/assets\/[^"]+\.css)"/.exec(html)![1]!;
  const css = await (await request.get(href)).text();
  const rule = /#scene\{[^}]*\}/.exec(css)![0];
  expect(rule).not.toMatch(/v[hw]|dvh|svh|lvh/);
});

test('главный чанк не загрузился (обрыв): запасная страница, не чёрный экран', async ({ page }) => {
  await page.route('**/assets/index-*.js', (r) => r.abort());
  await page.goto('/');
  await expect(page.locator('#fallback')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-mode', 'book');
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('главный чанк завис: через 8 с сторожевой таймер возвращает запасную страницу', async ({ page }) => {
  await page.route('**/assets/index-*.js', () => {}); // запрос не отвечает и не завершается
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'book'); // до таймера экран скрыт
  await expect(page.locator('#fallback')).toBeVisible({ timeout: 12000 });
  await expect(page.locator('html')).not.toHaveAttribute('data-mode', 'book');
});

// Виртуальные часы: ждать настоящие 25 с не нужно, таймеры страницы прокручиваются вручную.
test('запрос текстуры повис: после таймаута и повтора загрузка кончается запасной страницей', async ({ page }) => {
  await page.route('**/pages/*.webp', () => {}); // ни ответа, ни ошибки
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('#loading')).toHaveCount(1);
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(300);
    await page.clock.fastForward(26000); // таймаут первой попытки, затем повтора
  }
  await expect(page.locator('#fallback')).toBeVisible();
  await expect(page.locator('#loading')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('чанк сцены завис: после таймаута запасная страница', async ({ page }) => {
  await page.route('**/assets/scene-*.js', () => {});
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('#loading')).toHaveCount(1);
  await page.waitForTimeout(300);
  await page.clock.fastForward(26000);
  await expect(page.locator('#fallback')).toBeVisible();
  await expect(page.locator('#loading')).toHaveCount(0);
});
