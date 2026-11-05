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
  });
});
