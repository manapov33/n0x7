import { expect, test, type Page } from '@playwright/test';
import { site } from '../../src/content/site.ts';
import { buildScenes } from '../../src/film/scenes.ts';
import { sceneStart } from '../../src/film/timeline.ts';

const scenes = buildScenes(site.spreads.filter((x) => x.kind === 'work').length);

const html = (page: Page) => page.locator('html');
const settled = (page: Page) =>
  page.waitForFunction(() => document.documentElement.dataset.settled === 'true');
const filmProgress = (page: Page) =>
  page.evaluate(() => {
    const spacer = document.getElementById('film-spacer')!;
    return scrollY / (spacer.offsetHeight - innerHeight);
  });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(html(page)).toHaveAttribute('data-mode', 'book');
  await expect(page.locator('#loading')).toHaveCount(0);
});

test('клик по метке «Лилея» ведёт к сцене play', async ({ page }) => {
  await page.getByRole('button', { name: 'Лилея' }).click();
  await expect(html(page)).toHaveAttribute('data-scene', 'play', { timeout: 3000 });
  await expect(page.getByRole('button', { name: 'Лилея' })).toHaveAttribute('aria-current', 'true');
});

test('метка «Контакты» ведёт к сцене contacts', async ({ page }) => {
  await page.getByRole('button', { name: 'Контакты' }).click();
  await settled(page);
  await expect(html(page)).toHaveAttribute('data-scene', 'contacts');
  // метка приводит к готовым контактам, а не к кроссфейду с услугами
  await expect(page.locator('.ov-contacts')).toBeVisible();
  await expect(page.locator('.ov-services')).toBeHidden();
  await expect(page.getByRole('link', { name: 'Написать в Telegram' }).first()).toBeVisible();
});

test('метки: три работы и контакты, в порядке фильма', async ({ page }) => {
  const names = await page.locator('.film-rail button').allTextContents();
  expect(names).toEqual(['Лилея', 'Зерно и Дым', 'Резиденция Север', 'Контакты']);
});

test('метки доступны с клавиатуры', async ({ page }) => {
  const btn = page.getByRole('button', { name: 'Зерно и Дым' });
  await btn.focus();
  await expect(btn).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(html(page)).toHaveAttribute('data-scene', 'play', { timeout: 3000 });
});

test('кнопки и подписи рейки не пересекают «Обсудить проект» в начале, в play и в contacts', async ({ page }) => {
  const hit = async () => {
    const cta = (await page.locator('.ui-cta').boundingBox())!;
    const boxes = await page.evaluate(() =>
      [...document.querySelectorAll('.film-rail-mark')].flatMap((b) => {
        const r = (e: Element) => {
          const { x, y, width, height } = e.getBoundingClientRect();
          return { x, y, width, height };
        };
        const label = b.querySelector('.film-rail-label')!;
        const out = [r(b)];
        if (getComputedStyle(label).opacity !== '0') out.push(r(label));
        return out;
      }),
    );
    expect(boxes.length).toBeGreaterThanOrEqual(4);
    for (const r of boxes) {
      const apart = r.x + r.width <= cta.x || cta.x + cta.width <= r.x || r.y + r.height <= cta.y || cta.y + cta.height <= r.y;
      expect(apart, JSON.stringify({ r, cta })).toBe(true);
    }
  };
  await hit();
  await page.getByRole('button', { name: 'Лилея' }).click();
  await expect(html(page)).toHaveAttribute('data-scene', 'play', { timeout: 3000 });
  await hit();
  await page.getByRole('button', { name: 'Контакты' }).click();
  await expect(html(page)).toHaveAttribute('data-scene', 'contacts', { timeout: 3000 });
  await hit();
});

test('клавиши: PageDown к следующей сцене, PageUp обратно, Space без двойной прокрутки', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'клавиатура');
  await page.keyboard.press('PageDown');
  await expect(html(page)).toHaveAttribute('data-scene', 'open', { timeout: 3000 });
  await settled(page);
  await page.keyboard.press('PageUp');
  await expect(html(page)).toHaveAttribute('data-scene', 'table', { timeout: 3000 });
  await settled(page);
  await page.keyboard.press('Space');
  await settled(page);
  const p = await filmProgress(page);
  expect(p).toBeCloseTo(sceneStart(scenes, 1), 3); // ровно одна сцена, браузер не доложил прокрутку
});

test('клавиши: PageDown доходит до контактов и ссылки Telegram', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'клавиатура');
  test.setTimeout(90_000); // 16 прыжков по ~1 с
  // последний шаг должен быть прыжком фильма, а не нативной прокруткой браузера
  await page.evaluate(() => {
    (window as unknown as { __prevented: boolean[] }).__prevented = [];
    window.addEventListener('keydown', (e) => (window as unknown as { __prevented: boolean[] }).__prevented.push(e.defaultPrevented));
  });
  for (let i = 0; i < scenes.length; i++) {
    await page.keyboard.press('PageDown');
    await settled(page);
  }
  const prevented = await page.evaluate(() => (window as unknown as { __prevented: boolean[] }).__prevented);
  expect(prevented).toEqual(new Array(scenes.length).fill(true));
  expect(await filmProgress(page)).toBeCloseTo(1, 3);
  await expect(page.locator('.ov-contacts')).toBeVisible();
  await expect(page.locator('.ov-services')).toBeHidden();
  await expect(page.getByRole('link', { name: 'Написать в Telegram' }).first()).toBeVisible();
});

test('клавиши не работают в панели контактов', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'клавиатура');
  await page.locator('.ui-cta').click();
  await expect(page.locator('#contact-panel')).toBeVisible();
  await page.locator('#contact-panel').focus();
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(300);
  expect(await html(page).getAttribute('data-scene')).toBe('table');
});

test('телефон: изменение высоты окна на 60 px не двигает сцену и прогресс', async ({ page }) => {
  test.skip(test.info().project.name !== 'phone', 'только телефон');
  await page.evaluate(() => {
    const spacer = document.getElementById('film-spacer')!;
    window.scrollTo(0, 0.5 * (spacer.offsetHeight - innerHeight));
  });
  await page.waitForFunction(() => document.documentElement.dataset.scene !== 'table');
  await settled(page);
  const h0 = await page.evaluate(() => document.getElementById('film-spacer')!.offsetHeight);
  const p0 = await filmProgress(page);
  const s0 = await html(page).getAttribute('data-scene');
  for (const h of [784, 844, 904, 844]) {
    await page.setViewportSize({ width: 390, height: h });
    await page.waitForTimeout(150);
    await settled(page);
    expect(Math.abs((await filmProgress(page)) - p0)).toBeLessThan(0.01);
    expect(await html(page).getAttribute('data-scene')).toBe(s0);
  }
  const h1 = await page.evaluate(() => document.getElementById('film-spacer')!.offsetHeight);
  expect(h1).toBeGreaterThanOrEqual(h0); // защёлка не укорачивает фильм
});

test('рейка видна и внутри окна на обоих размерах', async ({ page }) => {
  const box = await page.locator('.film-rail').boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
});

test('запасная страница: рейки нет', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4173/');
  await expect(page.locator('html')).not.toHaveAttribute('data-mode', 'book');
  await expect(page.locator('.film-rail')).toHaveCount(0);
  await ctx.close();
});
