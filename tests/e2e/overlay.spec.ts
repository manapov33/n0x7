import { expect, test, type Page } from '@playwright/test';
import { buildScenes, SCREENS } from '../../src/film/scenes.ts';
import { sceneStart } from '../../src/film/timeline.ts';
import { site } from '../../src/content/site.ts';

async function scrollToProgress(page: Page, p: number) {
  await page.evaluate(async (p) => {
    const spacer = document.getElementById('film-spacer')!;
    window.scrollTo(0, p * (spacer.offsetHeight - window.innerHeight));
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  }, p);
  await page.waitForFunction(() => document.documentElement.dataset.settled === 'true');
}

const scenes = buildScenes(site.spreads.filter((s) => s.kind === 'work').length);
/** Середина play работы k и её table-начало. */
const playMid = (k: number) => {
  const i = scenes.findIndex((s) => s.id === 'play' && s.work === k);
  return sceneStart(scenes, i) + (SCREENS.play / scenes.reduce((a, s) => a + s.screens, 0)) * 0.6;
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'book');
  await expect(page.locator('#loading')).toHaveCount(0);
});

test('первый экран: N0X7, подпись и «скролльте»', async ({ page }) => {
  await scrollToProgress(page, 0);
  await expect(page.getByText('скролльте')).toBeVisible();
  await expect(page.locator('[data-ov="hero"]').getByText('сайты и приложения на заказ')).toBeVisible();
  await expect(page.locator('[data-ov="hero"] h1')).toHaveText('N0X7');
  // маленькая подпись у логотипа не дублирует героя
  await expect(page.locator('.ui-tagline')).toBeHidden();
});

test('работа: название и «концепт» видны в play, в table нет', async ({ page }) => {
  const ov = page.locator('[data-ov="work-0"]');
  await scrollToProgress(page, 0);
  await expect(ov.getByText('Лилея')).toBeHidden();
  await scrollToProgress(page, playMid(0));
  await expect(ov.getByRole('heading', { name: 'Лилея' })).toBeVisible();
  await expect(ov.getByText('концепт')).toBeVisible();
  await expect(ov.getByText(site.spreads[1]!.task!)).toBeVisible();
  await expect(page.locator('[data-ov="hero"]')).toBeHidden();
  await expect(page.locator('.ui-tagline')).toBeVisible();
});

test('заглушка работы: название второй работы в её play', async ({ page }) => {
  await scrollToProgress(page, playMid(1));
  await expect(page.locator('[data-ov="work-1"]').getByRole('heading', { name: 'Зерно и Дым' })).toBeVisible();
  await expect(page.locator('[data-ov="work-0"]')).toBeHidden();
});

test('услуги: заголовок и список с ценами', async ({ page }) => {
  const i = scenes.findIndex((s) => s.id === 'services');
  const total = scenes.reduce((a, s) => a + s.screens, 0);
  await scrollToProgress(page, sceneStart(scenes, i) + (SCREENS.services * 0.6) / total);
  const ov = page.locator('[data-ov="services"]');
  await expect(ov.getByRole('heading', { name: 'Услуги' })).toBeVisible();
  await expect(ov.locator('li')).toHaveCount(site.services.length);
  await expect(ov.locator('li').first()).toContainText('от');
});

test('контакты: ссылки, кнопка ведёт к сцене вместо панели', async ({ page }) => {
  await scrollToProgress(page, 0.8);
  await scrollToProgress(page, 1);
  await expect(page.getByRole('heading', { name: 'Обсудим ваш проект?' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Написать в Telegram' }).first()).toBeVisible();
  await expect(page.locator('[data-ov="contacts"] a[href^="tel:"]')).toBeVisible();
  await page.getByRole('button', { name: 'Обсудить проект' }).click();
  await expect(page.locator('#contact-panel')).toBeHidden();
  await page.waitForFunction(() => document.documentElement.dataset.settled === 'true');
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'contacts');
});

test('вне контактов кнопка по-прежнему открывает панель', async ({ page }) => {
  await scrollToProgress(page, 0);
  await page.getByRole('button', { name: 'Обсудить проект' }).click();
  await expect(page.locator('#contact-panel')).toBeVisible();
});

test('скрытые надписи: aria-hidden и без фокуса', async ({ page }) => {
  await scrollToProgress(page, 0);
  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-ov]')]
      .filter((e) => e.dataset.ov !== 'hero')
      .map((e) => ({ id: e.dataset.ov, aria: e.getAttribute('aria-hidden'), inert: e.inert })),
  );
  expect(hidden.length).toBe(5);
  for (const h of hidden) {
    expect(h.aria, String(h.id)).toBe('true');
    expect(h.inert, String(h.id)).toBe(true);
  }
  await expect(page.locator('[data-ov="hero"]')).not.toHaveAttribute('aria-hidden', 'true');
  // Tab не попадает в скрытые ссылки
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const inHidden = await page.evaluate(() => !!document.activeElement?.closest('[data-ov][aria-hidden="true"]'));
    expect(inHidden).toBe(false);
  }
});

test('надписи не выходят за экран', async ({ page }) => {
  const total = scenes.reduce((a, s) => a + s.screens, 0);
  const si = scenes.findIndex((s) => s.id === 'services');
  for (const p of [0, playMid(0), playMid(2), sceneStart(scenes, si) + (SCREENS.services * 0.6) / total, 1]) {
    await scrollToProgress(page, p);
    const r = await page.evaluate(() => {
      const bad: string[] = [];
      const w = innerWidth;
      const h = innerHeight;
      document.querySelectorAll<HTMLElement>('[data-ov]:not([aria-hidden="true"]) *').forEach((e) => {
        const b = e.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) return;
        if (b.left < -1 || b.right > w + 1 || b.top < -1 || b.bottom > h + 1) bad.push(e.tagName + ':' + e.textContent?.slice(0, 20));
      });
      return { bad, sw: document.documentElement.scrollWidth, iw: w };
    });
    expect(r.bad, `p=${p}`).toEqual([]);
    expect(r.sw).toBeLessThanOrEqual(r.iw);
  }
});

test('надписи не пересекают логотип, рейку и кнопку', async ({ page }) => {
  const total = scenes.reduce((a, s) => a + s.screens, 0);
  const si = scenes.findIndex((s) => s.id === 'services');
  for (const p of [0, playMid(0), sceneStart(scenes, si) + (SCREENS.services * 0.6) / total, 1]) {
    await scrollToProgress(page, p);
    const hits = await page.evaluate(() => {
      const rect = (e: Element) => e.getBoundingClientRect();
      const avoid = [...document.querySelectorAll('.ui-logo, .ui-cta, .film-rail-mark')].map(rect);
      const out: string[] = [];
      document.querySelectorAll<HTMLElement>('[data-ov]:not([aria-hidden="true"]) :is(h1,h2,h3,p,li,a,span)').forEach((e) => {
        if (e.children.length && e.tagName !== 'LI') return;
        const b = rect(e);
        if (!b.width) return;
        // слой надписи может быть шире текста: сравниваем по реальным строкам
        const range = document.createRange();
        range.selectNodeContents(e);
        for (const t of range.getClientRects()) {
          for (const a of avoid) {
            if (t.left < a.right && t.right > a.left && t.top < a.bottom && t.bottom > a.top)
              out.push(`${e.textContent?.slice(0, 15)}`);
          }
        }
      });
      return out;
    });
    expect(hits, `p=${p}`).toEqual([]);
  }
});
