import { expect, test, type Page } from '@playwright/test';
import { buildScenes } from '../../src/film/scenes.ts';
import { sceneStart } from '../../src/film/timeline.ts';
import { site } from '../../src/content/site.ts';

const works = site.spreads.filter((s) => s.kind === 'work');
const scenes = buildScenes(works.length);
const beautyK = works.findIndex((w) => w.id === 'beauty');
const noVideoK = works.findIndex((w) => !w.video);
const at = (id: string, t: number) => {
  const i = scenes.findIndex((s) => s.id === id && s.work === beautyK);
  const span = scenes[i]!.screens / scenes.reduce((a, s) => a + s.screens, 0);
  return sceneStart(scenes, i) + span * t;
};

async function scrollToProgress(page: Page, p: number) {
  await page.evaluate(async (p) => {
    const spacer = document.getElementById('film-spacer')!;
    window.scrollTo(0, p * (spacer.offsetHeight - window.innerHeight));
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  }, p);
  await page.waitForFunction(() => document.documentElement.dataset.settled === 'true');
}
const attr = (page: Page, name: string) => page.locator('html').getAttribute(name);

test('в dive кадр 0, в play кадр меняется от начала к концу', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toHaveCount(0);
  await scrollToProgress(page, at('dive', 0.5));
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'dive');
  expect(await attr(page, 'data-frame')).toBe('0');
  await scrollToProgress(page, at('play', 0.02));
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'play');
  const start = await attr(page, 'data-frame');
  await scrollToProgress(page, at('play', 0.98));
  const end = await attr(page, 'data-frame');
  expect(Number(end)).toBeGreaterThan(Number(start));
  // кадры успели загрузиться: показан именно запрошенный
  await expect.poll(() => attr(page, 'data-frame-shown')).toBe(end);
});

test('кадры грузятся не раньше чем за экран до dive', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/frames/')) urls.push(r.url());
  });
  await page.goto('/');
  await expect(page.locator('#loading')).toHaveCount(0);
  await scrollToProgress(page, 0);
  await page.waitForTimeout(500);
  expect(urls.length).toBe(0);
  await scrollToProgress(page, at('dive', 0));
  await expect.poll(() => urls.length).toBeGreaterThan(0);
});

test('кадры с задержкой 5 с: play идёт, страница не виснет', async ({ page }) => {
  await page.route('**/frames/**', async (r) => {
    await new Promise((res) => setTimeout(res, 5000));
    await r.continue();
  });
  await page.goto('/');
  await expect(page.locator('#loading')).toHaveCount(0);
  await scrollToProgress(page, at('play', 0.5));
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'play');
  // кадры ещё в пути: показанного кадра нет (-1) или это уже готовый ближайший; страница живая
  await expect.poll(() => attr(page, 'data-frame')).not.toBeNull();
  expect(Number(await attr(page, 'data-frame-shown'))).toBeGreaterThanOrEqual(-1);
  await scrollToProgress(page, at('play', 0.9));
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'play');
  await expect.poll(() => attr(page, 'data-frame-shown'), { timeout: 20000 }).not.toBe('-1');
});

test('работы без ролика проходят те же сцены', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toHaveCount(0);
  const i = scenes.findIndex((s) => s.id === 'play' && s.work === noVideoK);
  await scrollToProgress(page, sceneStart(scenes, i) + 0.01);
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'play');
  expect(await attr(page, 'data-frame')).toBeNull();
});

test('прыжок в середину play на холодном кэше: кадры около цели приходят быстро', async ({ page }) => {
  const requested: number[] = [];
  page.on('request', (r) => {
    const m = /\/frames\/beauty\/[dp]-(\d+)\.webp/.exec(r.url());
    if (m) requested.push(Number(m[1]));
  });
  await page.goto('/');
  await expect(page.locator('#loading')).toHaveCount(0);
  expect(requested.length).toBe(0); // холодный кэш: кадров ещё не просили
  await page.evaluate((p) => {
    const spacer = document.getElementById('film-spacer')!;
    window.scrollTo(0, p * (spacer.offsetHeight - window.innerHeight));
  }, at('play', 0.7));
  await expect(page.locator('html')).toHaveAttribute('data-scene', 'play', { timeout: 5000 });
  await expect.poll(() => requested.length, { timeout: 5000 }).toBeGreaterThan(0);
  await page.waitForFunction(() => document.documentElement.dataset.settled === 'true');
  await expect
    .poll(
      async () => {
        const f = Number(await attr(page, 'data-frame'));
        const s = Number(await attr(page, 'data-frame-shown'));
        return f > 20 && s >= 0 && Math.abs(f - s) <= 3;
      },
      { timeout: 5000 },
    )
    .toBe(true);
});
