import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { site } from '../../src/content/site.ts';

/**
 * Работы, у которых макет разворота уже свёрстан. Задача 9 добавит сюда coffee и residence;
 * пока работа здесь не значится, её заглушка с PLACEHOLDER допустима.
 */
const READY_WORKS = ['beauty'];

const pageName = (p: string) => p.replace(/^\/pages\//, '').replace(/\.webp$/, '');

test.describe('содержимое разворотов', () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'desktop', 'проверка файлов не зависит от экрана');
  });

  test('для каждого разворота файлы left/right лежат в public', () => {
    for (const s of site.spreads) {
      for (const p of [s.left, s.right]) {
        if (!p) continue;
        expect(existsSync(`public${p}`), `public${p}`).toBe(true);
      }
    }
  });

  test('у концептов в запасной странице есть пометка «концепт»', async ({ request }) => {
    const html = await (await request.get('/')).text();
    const articles = html.match(/<article class="work">[\s\S]*?<\/article>/g) ?? [];
    const concepts = site.spreads.filter((s) => s.isConcept);
    expect(concepts.length).toBeGreaterThan(0);
    for (const w of concepts) {
      const article = articles.find((a) => a.includes(w.title));
      expect(article, `карточка «${w.title}»`).toBeTruthy();
      expect(article).toContain('концепт');
    }
  });

  test('у готовых работ HTML-макет без PLACEHOLDER', () => {
    for (const id of READY_WORKS) {
      const s = site.spreads.find((x) => x.id === id);
      expect(s, id).toBeTruthy();
      for (const p of [s!.left, s!.right]) {
        expect(p, `${id}: путь страницы`).toBeTruthy();
        const html = readFileSync(`pages/${pageName(p!)}.html`, 'utf8');
        expect(html, `pages/${pageName(p!)}.html`).not.toContain('PLACEHOLDER');
      }
    }
  });

  test('у готовых работ подпись на развороте совпадает с site.ts', () => {
    for (const id of READY_WORKS) {
      const s = site.spreads.find((x) => x.id === id)!;
      const html = [s.left, s.right].map((p) => readFileSync(`pages/${pageName(p!)}.html`, 'utf8')).join('\n');
      expect(html).toContain(s.title);
      if (s.task) expect(html).toContain(s.task);
      if (s.isConcept) expect(html).toMatch(/концепт/i);
    }
  });
});
