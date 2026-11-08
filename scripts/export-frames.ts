import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESKTOP = { prefix: 'd', count: 90, maxWidth: 1600, quality: 88 };
const PHONE = { prefix: 'p', count: 60, maxWidth: 960, quality: 84 };
const PAGE = { width: 1200, height: 1600, maxBytes: 250 * 1024 };

export function findFfmpeg(): string {
  for (const bin of ['ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']) {
    if (spawnSync(bin, ['-version'], { stdio: 'ignore' }).status === 0) return bin;
  }
  throw new Error('ffmpeg не найден: установите его (brew install ffmpeg) и повторите npm run frames');
}

function probeDuration(ffmpeg: string, source: string): number {
  const r = spawnSync(ffmpeg, ['-i', source], { encoding: 'utf8' });
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(r.stderr);
  if (!m) throw new Error(`не удалось узнать длительность ${source}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

const pad = (i: number) => String(i).padStart(3, '0');

/** Вынимает ровно count кадров, равномерно от первого до последнего, обрезанных по центру до 3:2, в PNG. */
function extractPng(ffmpeg: string, source: string, duration: number, count: number, width: number, dir: string): string[] {
  mkdirSync(dir, { recursive: true });
  const fps = (count - 1) / duration;
  const vf = `crop='min(iw,ih*3/2)':'min(ih,iw*2/3)',scale='min(${width},iw)':-2:flags=lanczos,fps=${fps}`;
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-i', source, '-vf', vf, '-frames:v', String(count), join(dir, 'f-%03d.png')]);
  const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
  if (files.length === 0) throw new Error('ffmpeg не вернул кадров');
  // fps может дать на кадр меньше: достраиваем последним
  while (files.length < count) files.push(files[files.length - 1]!);
  return files.slice(0, count).map((f) => join(dir, f));
}

async function encodeMax(png: Buffer, maxBytes: number, start = 80): Promise<Buffer> {
  for (let q = start; q >= 40; q -= 5) {
    const buf = await sharp(png).webp({ quality: q }).toBuffer();
    if (buf.length <= maxBytes) return buf;
  }
  throw new Error(`страница не укладывается в ${Math.round(maxBytes / 1024)} КБ`);
}

/** assets/video/<id>.mp4 → frames/<id>/{d,p}-NNN.webp и страницы <id>-left/right.webp из первого кадра. */
export async function exportFrames(o: { source: string; id: string; framesDir: string; pagesDir: string }): Promise<string[]> {
  const ffmpeg = findFfmpeg();
  if (!existsSync(o.source)) throw new Error(`нет ролика ${o.source}`);
  const duration = probeDuration(ffmpeg, o.source);
  const tmp = mkdtempSync(join(tmpdir(), 'n0x7-ex-'));
  const written: string[] = [];
  try {
    const out = join(o.framesDir, o.id);
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    let first: string | undefined;
    for (const set of [DESKTOP, PHONE]) {
      const pngs = extractPng(ffmpeg, o.source, duration, set.count, set.maxWidth, join(tmp, set.prefix));
      if (set === DESKTOP) first = pngs[0];
      for (let i = 0; i < pngs.length; i++) {
        const file = join(out, `${set.prefix}-${pad(i)}.webp`);
        await sharp(pngs[i]!).webp({ quality: set.quality }).toFile(file);
        written.push(file);
      }
    }
    // Страницы разворота — тот же первый кадр, разрезанный пополам: стык со стартом ролика без скачка.
    const meta = await sharp(first!).metadata();
    const half = Math.floor(meta.width! / 2);
    mkdirSync(o.pagesDir, { recursive: true });
    for (const [side, left] of [['left', 0], ['right', half]] as const) {
      const png = await sharp(first!)
        .extract({ left, top: 0, width: half, height: meta.height! })
        .resize(PAGE.width, PAGE.height, { fit: 'fill', kernel: 'lanczos3' })
        .png()
        .toBuffer();
      const file = join(o.pagesDir, `${o.id}-${side}.webp`);
      writeFileSync(file, await encodeMax(png, PAGE.maxBytes));
      written.push(file);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return written;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ids = process.argv.slice(2);
  const videoDir = join(root, 'assets/video');
  const list = ids.length ? ids : readdirSync(videoDir).filter((f) => f.endsWith('.mp4')).map((f) => f.replace(/\.mp4$/, ''));
  (async () => {
    for (const id of list) {
      const files = await exportFrames({
        source: join(videoDir, `${id}.mp4`),
        id,
        framesDir: join(root, 'public/frames'),
        pagesDir: join(root, 'public/pages'),
      });
      const bytes = (p: string) => files.filter((f) => f.includes(p)).reduce((s, f) => s + statSync(f).size, 0);
      console.log(`${id}: ${files.length} файлов; desktop ${(bytes('/d-') / 1048576).toFixed(2)} МБ, phone ${(bytes('/p-') / 1048576).toFixed(2)} МБ`);
    }
  })().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
