/// <reference types="vite/client" />

// Адрес файла из public с учётом base сборки: на GitHub Pages сайт живёт не в корне, а в /n0x7/.
export function assetUrl(path: string): string {
  return import.meta.env.BASE_URL + path.replace(/^\//, '');
}
