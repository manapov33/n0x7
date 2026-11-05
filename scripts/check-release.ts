import { fileURLToPath } from 'node:url';
import { site } from '../src/content/site';
import type { Site } from '../src/content/types';

const MARK = 'PLACEHOLDER';

/** Пути к значениям данных, содержащим слово PLACEHOLDER. */
export function findPlaceholders(s: Site): string[] {
  const found: string[] = [];
  const walk = (v: unknown, path: string): void => {
    if (typeof v === 'string') {
      if (v.includes(MARK)) found.push(path);
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, `${path}[${i}]`));
    } else if (v && typeof v === 'object') {
      for (const [k, item] of Object.entries(v)) walk(item, path ? `${path}.${k}` : k);
    }
  };
  walk(s, '');
  return found;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const found = findPlaceholders(site);
  if (found.length > 0) {
    console.error('Публикация заблокирована: остались заглушки PLACEHOLDER:');
    for (const p of found) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log('check:release — заглушек нет.');
}
