import { expect, test } from '@playwright/test';
import sharp from 'sharp';

// Узкие высокие окна (планшет вертикально) показывают больше стола, чем плоскость: край должен растворяться в фон.
const CLEAR = [0x0b, 0x0a, 0x09];
const TOL = 6;

for (const [w, h] of [
  [800, 1280],
  [900, 1600],
] as const) {
  test(`край стола не виден в окне ${w}x${h}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'размер окна задаётся в тесте');
    // Подменяем стол ровным светлым изображением без собственной растушёвки: край должен растворять сама сцена.
    const flat = await sharp({ create: { width: 512, height: 320, channels: 3, background: '#7a6a55' } }).webp().toBuffer();
    await page.route('**/scene/table*.webp', (r) => r.fulfill({ contentType: 'image/webp', body: flat }));
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'book');
    await expect(page.locator('#loading')).toHaveCount(0);
    await page.waitForTimeout(1500);
    await page.keyboard.press('ArrowRight'); // разворот: самый широкий обзор стола
    await page.waitForTimeout(3000);
    // Без интерфейса поверх холста.
    await page.addStyleTag({ content: 'body > *:not(#scene) { visibility: hidden !important; }' });
    const png = await page.screenshot({ type: 'png' });
    const { data, info: meta } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => [0, 1, 2].map((c) => data[(y * meta.width + x) * 3 + c]!);
    const diff = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));
    const cols = [0.2, 0.35, 0.5, 0.65, 0.8].map((f) => Math.round(f * (meta.width - 1)));
    for (const x of cols) {
      for (const y of [0, meta.height - 1]) {
        expect(diff(px(x, y), CLEAR), `пиксель ${x},${y}`).toBeLessThanOrEqual(TOL);
      }
      // Нет жёсткой ступени: соседние строки отличаются слабо.
      let worst = 0;
      for (let y = 1; y < Math.floor(meta.height / 4); y++) {
        worst = Math.max(worst, diff(px(x, y), px(x, y - 1)), diff(px(x, meta.height - y), px(x, meta.height - y - 1)));
      }
      expect(worst, `ступень в колонке ${x}`).toBeLessThanOrEqual(10);
    }
  });
}
