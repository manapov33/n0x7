import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { PHONE_CROP_ASPECT } from '../../src/scene/dims.ts';
import { site } from '../../src/content/site.ts';
import { exportFrames, findFfmpeg } from '../../scripts/export-frames.ts';

const tmp = mkdtempSync(join(tmpdir(), 'n0x7-frames-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('export-frames', () => {
  it('короткий ролик → 90 кадров ≤1600, 60 кадров центральной вырезки телефона без увеличения, страницы 1200x1600 ≤250 КБ', async () => {
    const src = join(tmp, 'test.mp4');
    execFileSync(findFfmpeg(), ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=24:duration=2', '-pix_fmt', 'yuv420p', src]);
    const framesDir = join(tmp, 'frames');
    const pagesDir = join(tmp, 'pages');
    await exportFrames({ source: src, id: 'test', framesDir, pagesDir });
    const dir = join(framesDir, 'test');
    const names = readdirSync(dir);
    expect(names.filter((n) => n.startsWith('d-')).length).toBe(90);
    expect(names.filter((n) => n.startsWith('p-')).length).toBe(60);
    expect(existsSync(join(dir, 'd-000.webp'))).toBe(true);
    expect(existsSync(join(dir, 'd-089.webp'))).toBe(true);
    expect(existsSync(join(dir, 'p-059.webp'))).toBe(true);
    const d = await sharp(join(dir, 'd-000.webp')).metadata();
    const p = await sharp(join(dir, 'p-000.webp')).metadata();
    expect(d.width!).toBeLessThanOrEqual(1600);
    // телефон: центральная вырезка 5:8 в масштабе исходника (720 px по высоте), без увеличения
    expect(p.height!).toBe(720);
    expect(p.width!).toBe(450);
    expect(p.width! / p.height!).toBeCloseTo(PHONE_CROP_ASPECT, 3);
    expect(d.width! / d.height!).toBeCloseTo(1.5, 2);
    // вырезка телефона лежит ровно по центру десктопного кадра (тот же масштаб, без сдвига)
    const left = Math.round((d.width! - p.width!) / 2);
    const a = await sharp(join(dir, 'd-000.webp')).extract({ left, top: 0, width: p.width!, height: p.height! }).removeAlpha().raw().toBuffer();
    const b = await sharp(join(dir, 'p-000.webp')).removeAlpha().raw().toBuffer();
    expect(b.length).toBe(a.length);
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff += Math.abs(a[i]! - b[i]!);
    expect(diff / a.length).toBeLessThan(6);
    for (const side of ['left', 'right']) {
      const file = join(pagesDir, `test-${side}.webp`);
      const m = await sharp(file).metadata();
      expect([m.width, m.height]).toEqual([1200, 1600]);
      expect(statSync(file).size).toBeLessThanOrEqual(250 * 1024);
    }
  }, 120_000);

  it('для каждой работы с video кадры и страницы лежат в public', () => {
    for (const s of site.spreads) {
      if (!s.video) continue;
      expect(s.video.count).toBe(90);
      expect(s.video.phoneCount).toBe(60);
      for (let i = 0; i < s.video.count; i++) expect(existsSync(`public${s.video.dir}/d-${String(i).padStart(3, '0')}.webp`)).toBe(true);
      for (let i = 0; i < s.video.phoneCount; i++) expect(existsSync(`public${s.video.dir}/p-${String(i).padStart(3, '0')}.webp`)).toBe(true);
      for (const p of [s.left, s.right]) expect(existsSync(`public${p}`)).toBe(true);
    }
  });
});
