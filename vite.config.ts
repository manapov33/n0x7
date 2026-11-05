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

// three.js лежит в отдельном ленивом чанке (~540 кБ): запасной странице он не нужен
export default defineConfig({ plugins: [fallbackPlugin()], build: { chunkSizeWarningLimit: 600 } });
