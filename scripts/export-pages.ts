import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BYTES = 250 * 1024;
const START_QUALITY = 80;
const MIN_QUALITY = 40;

async function encode(png: Buffer, name: string): Promise<Buffer> {
  for (let q = START_QUALITY; q >= MIN_QUALITY; q -= 5) {
    const buf = await sharp(png).webp({ quality: q }).toBuffer();
    if (buf.length <= MAX_BYTES) return buf;
  }
  throw new Error(`${name}: не укладывается в 250 КБ даже при качестве ${MIN_QUALITY}`);
}

export async function exportPages(opts: { only?: string[]; outDir?: string } = {}): Promise<string[]> {
  const pagesDir = join(root, 'pages');
  const outDir = opts.outDir ?? join(root, 'public/pages');
  const sceneDir = join(root, 'public/scene');
  const names = readdirSync(pagesDir)
    .filter((f) => f.endsWith('.html'))
    .map((f) => basename(f, '.html'))
    .filter((n) => !opts.only || opts.only.includes(n));
  if (opts.only) {
    const missing = opts.only.filter((n) => !names.includes(n));
    if (missing.length) throw new Error(`нет макета: ${missing.join(', ')}`);
  }

  const browser = await chromium.launch();
  const written: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
    for (const name of names) {
      await page.goto(pathToFileURL(join(pagesDir, `${name}.html`)).href);
      await page.evaluate(() => document.fonts.ready);
      const png = await page.screenshot({ type: 'png' });
      const webp = await encode(png, `${name}.webp`);
      const isTable = name === 'table-stub';
      const dir = isTable && !opts.outDir ? sceneDir : outDir;
      mkdirSync(dir, { recursive: true });
      const file = join(dir, isTable ? 'table.webp' : `${name}.webp`);
      writeFileSync(file, webp);
      written.push(file);
    }
  } finally {
    await browser.close();
  }
  return written;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  exportPages()
    .then((files) => {
      for (const f of files) console.log(`${f} ${(statSync(f).size / 1024).toFixed(1)} KB`);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
