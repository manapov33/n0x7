import { expect, test } from '@playwright/test';

const button = (page: import('@playwright/test').Page) => page.getByRole('button', { name: 'Обсудить проект' });

test('обложка: подпись, кнопка, подсказка, счётчик 1 / 5', async ({ page }) => {
  await page.goto('/');
  await expect(button(page)).toBeVisible();
  await expect(page.locator('#ui-root').getByText('сайты и приложения на заказ')).toBeVisible();
  await expect(page.getByText('листайте')).toBeVisible();
  await expect(page.locator('#counter')).toHaveText('1 / 5');
  await expect(page.locator('#loading')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('листайте')).toBeHidden();
  await expect(page.locator('#counter')).toHaveText('2 / 5');
  await expect(page.locator('#counter')).toHaveAttribute('data-spread', '1');
});

test('кнопка с любого разворота: панель контактов и последний разворот', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#counter')).toHaveAttribute('data-spread', '1');
  await button(page).click();
  const panel = page.locator('#contact-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('a[href^="tel:"]')).toBeVisible();
  await expect(panel.locator('a[href^="https://t.me/"]')).toBeVisible();
  await expect(page.locator('#counter')).toHaveAttribute('data-spread', '4');
  await expect(page.locator('#counter')).toHaveText('5 / 5');
});

test('Escape и кнопка закрытия закрывают панель, фокус возвращается на кнопку', async ({ page }) => {
  await page.goto('/');
  await button(page).click();
  const panel = page.locator('#contact-panel');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(button(page)).toBeFocused();
  await button(page).click();
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Закрыть' }).click();
  await expect(panel).toBeHidden();
  await expect(button(page)).toBeFocused();
});

test('клик по панели и кнопкам не листает журнал', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toHaveCount(0);
  await button(page).click();
  await expect(page.locator('#counter')).toHaveAttribute('data-spread', '4');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#counter')).toHaveAttribute('data-spread', '3');
  // правая половина экрана на canvas листает вперёд; в панели и на кнопках — нет
  await page.locator('#contact-panel h2').click();
  await page.locator('#contact-panel').click({ position: { x: 150, y: 120 } });
  await page.waitForTimeout(400);
  await expect(page.locator('#counter')).toHaveAttribute('data-spread', '3');
  await page.locator('#contact-panel').getByRole('button', { name: 'Закрыть' }).click();
  await page.waitForTimeout(400);
  await expect(page.locator('#counter')).toHaveAttribute('data-spread', '3');
});

test('кнопка работает во время загрузки: панель открывается без книги, потом ведёт на последний разворот', async ({ page }) => {
  // Чанк сцены (three.js) приходит позже главного: модели ещё нет.
  await page.route('**/assets/*.js', async (r) => {
    if (!/\/index-[^/]*\.js/.test(r.request().url())) await new Promise((res) => setTimeout(res, 1500));
    await r.continue();
  });
  await page.goto('/');
  await expect(page.locator('#loading')).toHaveCount(1);
  await expect(button(page)).toBeVisible();
  await button(page).click();
  await expect(page.locator('#contact-panel a[href^="tel:"]')).toBeVisible();
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: 15000 });
  await expect(page.locator('#counter')).toHaveAttribute('data-spread', '0');
  await button(page).click();
  await expect(page.locator('#counter')).toHaveAttribute('data-spread', '4');
});

test('размеры: цели касания не меньше 44 px, нет горизонтального переполнения', async ({ page }) => {
  await page.goto('/');
  await button(page).click();
  const panel = page.locator('#contact-panel');
  await expect(panel).toBeVisible();
  for (const loc of [button(page), panel.getByRole('button', { name: 'Закрыть' }), panel.locator('a')]) {
    for (const el of await loc.all()) {
      const b = (await el.boundingBox())!;
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.width).toBeGreaterThanOrEqual(44);
    }
  }
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(over).toBeLessThanOrEqual(0);
  const pb = (await panel.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(pb.x).toBeGreaterThanOrEqual(0);
  expect(pb.x + pb.width).toBeLessThanOrEqual(vp.width);
  expect(pb.y + pb.height).toBeLessThanOrEqual(vp.height);
});

test('запасная страница: интерфейса нет', async ({ page }) => {
  await page.route('**/pages/**', (r) => r.abort());
  await page.goto('/');
  await expect(page.locator('#fallback')).toBeVisible();
  await expect(page.locator('#ui-root')).toHaveCount(0);
  await expect(page.locator('#counter')).toHaveCount(0);
});

test('запасная страница после потери контекста: интерфейс убран', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toHaveCount(0);
  await page.evaluate(() => {
    const c = document.querySelector('canvas')!;
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGL2RenderingContext;
    gl.getExtension('WEBGL_lose_context')!.loseContext();
  });
  await expect(page.locator('#fallback')).toBeVisible();
  await expect(page.locator('#ui-root')).toHaveCount(0);
});

test('оверлей не перехватывает указатель вне кнопки и панели', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toHaveCount(0);
  // что лежит под точкой: 'scene' или ближайший интерактивный предок оверлея
  const hit = (point: { x: number; y: number } | { sel: string; fx: number; fy: number }) =>
    page.evaluate((p) => {
      let x: number, y: number;
      if ('sel' in p) {
        const r = document.querySelector(p.sel)!.getBoundingClientRect();
        x = r.left + r.width * p.fx;
        y = r.top + r.height * p.fy;
      } else ({ x, y } = p);
      const el = document.elementFromPoint(x, y)!;
      if (el.id === 'scene') return 'scene';
      return el.closest('#contact-panel') ? 'panel' : el.closest('.ui-cta') ? 'cta' : el.tagName;
    }, point);
  const vw = page.viewportSize()!.width;
  expect(await hit({ x: vw - 10, y: 20 })).toBe('scene'); // полоса шапки, подальше от кнопки
  expect(await hit({ sel: '.ui-brand', fx: 0.95, fy: 0.5 })).toBe('scene');
  expect(await hit({ sel: '.ui-hint', fx: 0.5, fy: 0.5 })).toBe('scene');
  expect(await hit({ sel: '#counter', fx: 0.5, fy: 0.5 })).toBe('scene');
  expect(await hit({ sel: '.ui-cta', fx: 0.5, fy: 0.5 })).toBe('cta');
  await button(page).click();
  expect(await hit({ sel: '#contact-panel', fx: 0.5, fy: 0.9 })).toBe('panel');
});

test('дойти листанием до последнего разворота: панель открывается сама, фокус не уходит', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toHaveCount(0);
  const panel = page.locator('#contact-panel');
  await expect(panel).toBeHidden();
  const before = await page.evaluate(() => document.activeElement?.tagName);
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  await expect(page.locator('#counter')).toHaveAttribute('data-spread', '4');
  await expect(panel).toBeVisible();
  await expect(panel).not.toBeFocused();
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe(before);
});

test('закрытая посетителем панель не возвращается, пока он на последнем развороте; после ухода открывается снова', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toHaveCount(0);
  const panel = page.locator('#contact-panel');
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await page.keyboard.press('ArrowRight'); // на последнем развороте дальше некуда, но он тот же
  await page.waitForTimeout(500);
  await expect(page.locator('#counter')).toHaveAttribute('data-spread', '4');
  await expect(panel).toBeHidden();
  // уходим с последнего разворота (на телефоне первое нажатие может сменить только страницу)
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(150);
    if ((await page.locator('#counter').getAttribute('data-spread')) === '3') break;
  }
  await expect(page.locator('#counter')).toHaveAttribute('data-spread', '3');
  await expect(panel).toBeHidden();
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
    if ((await page.locator('#counter').getAttribute('data-spread')) === '4') break;
  }
  await expect(page.locator('#counter')).toHaveAttribute('data-spread', '4');
  await expect(panel).toBeVisible();
});
