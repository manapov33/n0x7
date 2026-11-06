import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, describe, expect, it } from 'vitest';
import { site } from '../../src/content/site.ts';
import { exportPages } from '../../scripts/export-pages.ts';

const out = mkdtempSync(join(tmpdir(), 'n0x7-pages-'));
afterAll(() => rmSync(out, { recursive: true, force: true }));

describe('export-pages', () => {
  it('рендерит заглушку в WebP 1200x1600 не больше 250 КБ', async () => {
    await exportPages({ only: ['cover-right'], outDir: out });
    const file = join(out, 'cover-right.webp');
    const meta = await sharp(file).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1200, 1600, 'webp']);
    expect(statSync(file).size).toBeLessThanOrEqual(250 * 1024);
  }, 60_000);

  it('для каждого пути из site.ts есть макет и закоммиченный WebP', () => {
    const paths = site.spreads.flatMap((s) => [s.left, s.right]).filter((p): p is string => !!p);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      const name = p.replace(/^\/pages\//, '').replace(/\.webp$/, '');
      expect(existsSync(`pages/${name}.html`), `pages/${name}.html`).toBe(true);
      expect(existsSync(`public/pages/${name}.webp`), `public/pages/${name}.webp`).toBe(true);
    }
    expect(existsSync('pages/table-stub.html')).toBe(true);
    expect(existsSync('public/scene/table.webp')).toBe(true);
    expect(existsSync('public/scene/table-2048.webp')).toBe(true);
  });

  it('стол: из одного источника получаются 3840x2400 и 2048x1280', async () => {
    await exportPages({ only: ['table-stub'], outDir: out });
    const full = await sharp(join(out, 'table.webp')).metadata();
    const phone = await sharp(join(out, 'table-2048.webp')).metadata();
    expect([full.width, full.height]).toEqual([3840, 2400]);
    expect([phone.width, phone.height]).toEqual([2048, 1280]);
  }, 90_000);
});
