import { expect, test, type Page } from '@playwright/test';

const spread = (page: Page) => page.locator('#counter');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'book');
  await expect(page.locator('#loading')).toHaveCount(0);
});

test('ArrowRight проходит развороты 0 → 4, ArrowLeft возвращает к 0', async ({ page }) => {
  // На телефоне стрелка листает по странице: на разворот уходит до двух нажатий.
  const phone = test.info().project.name === 'phone';
  const stepTo = async (key: string, want: number) => {
    for (let n = 0; n < (phone ? 2 : 1); n++) {
      await page.keyboard.press(key);
      await page.waitForTimeout(phone ? 150 : 0);
      if ((await spread(page).getAttribute('data-spread')) === String(want)) break;
    }
    await expect(spread(page)).toHaveAttribute('data-spread', String(want));
  };
  for (let i = 1; i <= 4; i++) await stepTo('ArrowRight', i);
  for (let i = 3; i >= 0; i--) await stepTo('ArrowLeft', i);
});

test('10 быстрых ArrowRight подряд дают data-spread="4"', async ({ page }) => {
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  await expect(spread(page)).toHaveAttribute('data-spread', '4');
});

// Геометрия закрытой книги: страница-обложка по центру, камера из fitCamera ('page', FOV 35, поля 8%).
async function pageEdge(page: Page) {
  const box = (await page.locator('canvas').boundingBox())!;
  const halfTan = Math.tan((35 * Math.PI) / 360);
  const aspect = box.width / box.height;
  const camH = Math.max((4 * 1.16) / 2 / halfTan, (3 * 1.16) / 2 / (halfTan * aspect));
  const pxPerUnit = box.height / 2 / (camH * halfTan);
  return {
    y: box.y + box.height / 2,
    edgeX: box.x + box.width / 2 + 1.5 * pxPerUnit, // правый край обложки
    spreadPx: 6 * pxPerUnit,
  };
}

test('перетаскивание от края страницы на 60% разворота листает', async ({ page }) => {
  test.skip(test.info().project.name === 'phone', 'мышь — только десктоп');
  await page.waitForTimeout(1500); // камера доехала до цели
  const g = await pageEdge(page);
  await page.mouse.move(g.edgeX - 6, g.y);
  await page.mouse.down();
  await page.mouse.move(g.edgeX - 6 - g.spreadPx * 0.3, g.y, { steps: 12 });
  await page.mouse.move(g.edgeX - 6 - g.spreadPx * 0.6, g.y, { steps: 12 });
  await page.waitForTimeout(300);
  await page.mouse.up();
  await expect(spread(page)).toHaveAttribute('data-spread', '1');
});

test('короткое перетаскивание на 10% разворота оставляет data-spread="0"', async ({ page }) => {
  test.skip(test.info().project.name === 'phone', 'мышь — только десктоп');
  await page.waitForTimeout(1500);
  const g = await pageEdge(page);
  await page.mouse.move(g.edgeX - 6, g.y);
  await page.mouse.down();
  await page.mouse.move(g.edgeX - 6 - g.spreadPx * 0.1, g.y, { steps: 10 });
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.waitForTimeout(900);
  await expect(spread(page)).toHaveAttribute('data-spread', '0');
});

test('клик по левой половине закрытой обложки открывает журнал', async ({ page }) => {
  await page.waitForTimeout(500);
  await page.mouse.click(60, 400); // левая половина экрана, обложка стоит по центру
  await expect(spread(page)).toHaveAttribute('data-spread', '1');
});

test('клик по левой половине на развороте 1 по-прежнему листает назад', async ({ page }) => {
  test.skip(test.info().project.name === 'phone', 'на телефоне левый край ведёт по страницам');
  await page.keyboard.press('ArrowRight');
  await expect(spread(page)).toHaveAttribute('data-spread', '1');
  await page.waitForTimeout(900);
  await page.mouse.click(60, 400);
  await expect(spread(page)).toHaveAttribute('data-spread', '0');
});
