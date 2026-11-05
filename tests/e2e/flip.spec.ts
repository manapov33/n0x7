import { expect, test, type Page } from '@playwright/test';

const spread = (page: Page) => page.locator('#counter');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'book');
  await expect(page.locator('#loading')).toHaveCount(0);
});

test('ArrowRight проходит развороты 0 → 4, ArrowLeft возвращает к 0', async ({ page }) => {
  for (let i = 1; i <= 4; i++) {
    await page.keyboard.press('ArrowRight');
    await expect(spread(page)).toHaveAttribute('data-spread', String(i));
  }
  for (let i = 3; i >= 0; i--) {
    await page.keyboard.press('ArrowLeft');
    await expect(spread(page)).toHaveAttribute('data-spread', String(i));
  }
});

test('10 быстрых ArrowRight подряд дают data-spread="4"', async ({ page }) => {
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  await expect(spread(page)).toHaveAttribute('data-spread', '4');
});

test('перетаскивание мышью с правого края влево даёт data-spread="1"', async ({ page }) => {
  test.skip(test.info().project.name === 'phone', 'мышь — только десктоп');
  const box = (await page.locator('canvas').boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 4, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, y, { steps: 12 });
  await page.mouse.move(box.x + box.width * 0.1, y, { steps: 12 });
  await page.mouse.up();
  await expect(spread(page)).toHaveAttribute('data-spread', '1');
});

test('короткое перетаскивание на 10% оставляет data-spread="0"', async ({ page }) => {
  test.skip(test.info().project.name === 'phone', 'мышь — только десктоп');
  const box = (await page.locator('canvas').boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 4, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.9 - 4, y, { steps: 10 });
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.waitForTimeout(900);
  await expect(spread(page)).toHaveAttribute('data-spread', '0');
});
