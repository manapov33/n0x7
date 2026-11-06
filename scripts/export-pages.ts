import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, type Page } from '@playwright/test';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BYTES = 250 * 1024;
const TABLE_NAME = 'table-stub';
const TABLE_SIZE = { width: 3840, height: 2400 };
const TABLE_PHONE_WIDTH = 2048;
const TABLE_MAX_BYTES = 1500 * 1024;
const TABLE_PHONE_MAX_BYTES = 500 * 1024;
const START_QUALITY = 80;
const MIN_QUALITY = 40;

async function encode(png: Buffer, name: string, maxBytes = MAX_BYTES): Promise<Buffer> {
  for (let q = START_QUALITY; q >= MIN_QUALITY; q -= 5) {
    const buf = await sharp(png).webp({ quality: q }).toBuffer();
    if (buf.length <= maxBytes) return buf;
  }
  throw new Error(`${name}: не укладывается в ${Math.round(maxBytes / 1024)} КБ даже при качестве ${MIN_QUALITY}`);
}

const NAMED_FONTS = ['Cormorant', 'Manrope', 'JetBrains Mono'];

/**
 * Падает, если макет использует шрифт из нашего набора, а настоящий файл не загрузился.
 * Без этого браузер молча берёт запасной шрифт, и страницы журнала выходят не теми.
 */
export async function assertFontsLoaded(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  const problems = await page.evaluate((named) => {
    const used = new Map<string, { family: string; style: string; weight: string; text: string }>();
    for (const el of Array.from(document.querySelectorAll('body, body *'))) {
      const text = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!text) continue;
      const cs = getComputedStyle(el);
      const families = cs.fontFamily.split(',').map((f) => f.trim().replace(/^["']|["']$/g, ''));
      const family = families.find((f) => named.includes(f));
      if (!family) continue;
      const key = `${family}|${cs.fontStyle}|${cs.fontWeight}`;
      const prev = used.get(key);
      used.set(key, { family, style: cs.fontStyle, weight: cs.fontWeight, text: (prev?.text ?? '') + text });
    }
    const loaded = Array.from(document.fonts).filter((f) => f.status === 'loaded');
    const out: string[] = [];
    for (const u of used.values()) {
      const ok =
        loaded.some((f) => f.family.replace(/^["']|["']$/g, '') === u.family && f.weight === u.weight && f.style === u.style) &&
        document.fonts.check(`${u.style} ${u.weight} 16px "${u.family}"`, u.text);
      if (!ok) out.push(`${u.family} ${u.weight} ${u.style}`);
    }
    return out;
  }, NAMED_FONTS);
  if (problems.length) {
    throw new Error(`${name}: шрифты не загрузились (${problems.join('; ')}); проверьте pages/_fonts.css`);
  }
}

async function findTableSource(): Promise<string | null> {
  for (const ext of ['webp', 'png', 'jpg', 'jpeg']) {
    const p = join(root, `assets/images/table.${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

/** Из одного исходника стола делает настольную (3840) и телефонную (2048) версии. */
async function writeTable(source: Buffer, dir: string, written: string[]): Promise<void> {
  const full = await sharp(source).resize(TABLE_SIZE.width, TABLE_SIZE.height, { fit: 'cover' }).png().toBuffer();
  const phone = await sharp(full).resize(TABLE_PHONE_WIDTH).png().toBuffer();
  mkdirSync(dir, { recursive: true });
  const jobs: [string, Buffer, number][] = [
    ['table.webp', full, TABLE_MAX_BYTES],
    [`table-${TABLE_PHONE_WIDTH}.webp`, phone, TABLE_PHONE_MAX_BYTES],
  ];
  for (const [file, png, max] of jobs) {
    const target = join(dir, file);
    writeFileSync(target, await encode(png, file, max));
    written.push(target);
  }
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
    const sourceTable = await findTableSource();
    for (const name of names) {
      const isTable = name === TABLE_NAME;
      // Настоящий стол из assets/images важнее заглушки.
      if (isTable && sourceTable) {
        await writeTable(readFileSync(sourceTable), opts.outDir ?? sceneDir, written);
        continue;
      }
      await page.setViewportSize(isTable ? TABLE_SIZE : { width: 1200, height: 1600 });
      await page.goto(pathToFileURL(join(pagesDir, `${name}.html`)).href);
      await assertFontsLoaded(page, name);
      const png = await page.screenshot({ type: 'png' });
      if (isTable) {
        await writeTable(png, opts.outDir ?? sceneDir, written);
        continue;
      }
      const webp = await encode(png, `${name}.webp`);
      mkdirSync(outDir, { recursive: true });
      const file = join(outDir, `${name}.webp`);
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
