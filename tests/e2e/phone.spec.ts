import { expect, test, type Page } from '@playwright/test';

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'phone', 'постраничный режим — только телефон');
});

const counter = (page: Page) => page.locator('#counter');
const cta = (page: Page) => page.getByRole('button', { name: 'Обсудить проект' });

/** Настоящий свайп пальцем (CDP), потому что у touchscreen в Playwright есть только tap. */
async function swipe(page: Page, from: [number, number], to: [number, number], steps = 10) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await send('touchStart', [{ x: from[0], y: from[1] }]);
  for (let i = 1; i <= steps; i++) {
    const x = from[0] + ((to[0] - from[0]) * i) / steps;
    const y = from[1] + ((to[1] - from[1]) * i) / steps;
    await send('touchMove', [{ x, y }]);
    await page.waitForTimeout(16);
  }
  await send('touchEnd', []);
  await cdp.detach();
}

async function settle(page: Page) {
  await page.waitForTimeout(1500);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'book');
  await expect(page.locator('#loading')).toHaveCount(0);
});

test('свайп влево открывает журнал: data-spread становится 1', async ({ page }) => {
  await settle(page);
  await swipe(page, [320, 420], [60, 420]);
  await expect(counter(page)).toHaveAttribute('data-spread', '1');
});

test('свайп влево на левой странице показывает правую, затем следующий разворот; свайп вправо возвращает', async ({ page }) => {
  await page.keyboard.press('ArrowRight'); // разворот 1, левая страница
  await expect(counter(page)).toHaveAttribute('data-spread', '1');
  await settle(page);
  await swipe(page, [320, 420], [60, 420]); // левая → правая, разворот тот же
  await page.waitForTimeout(500);
  await expect(counter(page)).toHaveAttribute('data-spread', '1');
  await swipe(page, [320, 420], [60, 420]); // правая: тянем лист
  await expect(counter(page)).toHaveAttribute('data-spread', '2');
  await settle(page);
  await swipe(page, [60, 420], [320, 420]); // назад: правая страница разворота 1
  await expect(counter(page)).toHaveAttribute('data-spread', '1');
});

test('вертикальный свайп не листает', async ({ page }) => {
  await settle(page);
  await swipe(page, [195, 300], [195, 600]);
  await page.waitForTimeout(500);
  await expect(counter(page)).toHaveAttribute('data-spread', '0');
});

test('кнопка «Обсудить проект» видна на каждой странице', async ({ page }) => {
  await expect(cta(page)).toBeVisible();
  for (let i = 0; i < 8; i++) {
    await page.mouse.click(370, 400); // правый край страницы
    await page.waitForTimeout(400);
    await expect(cta(page)).toBeVisible();
  }
  await expect(counter(page)).toHaveAttribute('data-spread', '4');
});

test('касание края: вперёд до последней правой страницы и ни шагом дальше, назад по левому краю', async ({ page }) => {
  for (let i = 0; i < 12; i++) {
    await page.mouse.click(370, 400);
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(800);
  await expect(counter(page)).toHaveAttribute('data-spread', '4');
  await page.mouse.click(20, 400); // правая → левая того же разворота
  await page.waitForTimeout(500);
  await expect(counter(page)).toHaveAttribute('data-spread', '4');
  await page.mouse.click(20, 400); // левая → правая страница разворота 3
  await expect(counter(page)).toHaveAttribute('data-spread', '3');
});

test('поворот экрана: разворот сохраняется, canvas вписан в окно', async ({ page }) => {
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight'); // обложка, левая, правая, разворот 2
  await expect(counter(page)).toHaveAttribute('data-spread', '2');
  const fits = async () => {
    const [b, vp] = await page.evaluate(() => {
      const r = document.querySelector('canvas')!.getBoundingClientRect();
      return [{ w: r.width, h: r.height }, { w: innerWidth, h: innerHeight }];
    });
    expect(Math.abs(b!.w - vp!.w)).toBeLessThanOrEqual(1);
    expect(Math.abs(b!.h - vp!.h)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  };
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(300);
  await expect(counter(page)).toHaveAttribute('data-spread', '2');
  await fits();
  await expect(cta(page)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await expect(counter(page)).toHaveAttribute('data-spread', '2');
  await fits();
});
