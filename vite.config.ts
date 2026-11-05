import { defineConfig, type Plugin } from 'vite';
import { site } from './src/content/site.ts';
import { renderFallback } from './src/fallback/render.ts';

function fallbackPlugin(): Plugin {
  return {
    name: 'n0x7-fallback',
    transformIndexHtml(html) {
      return html.replace('<!--FALLBACK-->', renderFallback(site));
    },
  };
}

export default defineConfig({ plugins: [fallbackPlugin()] });
