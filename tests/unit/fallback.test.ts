import { describe, expect, it } from 'vitest';
import { site } from '../../src/content/site';
import { renderFallback } from '../../src/fallback/render';

describe('renderFallback', () => {
  const html = renderFallback(site);

  it('показывает название и подпись', () => {
    expect(html).toContain('N0X7');
    expect(html).toContain('сайты и приложения на заказ');
  });

  it('показывает каждую работу с пометкой «концепт»', () => {
    const works = site.spreads.filter((s) => s.kind === 'work');
    expect(works.length).toBe(3);
    for (const w of works) {
      expect(html).toContain(w.title);
      expect(html).toContain('концепт');
    }
  });

  it('содержит контакты и кнопку', () => {
    expect(html).toContain(`href="${site.telegramUrl}"`);
    expect(html).toContain(`href="tel:${site.phone}"`);
    expect(html).toContain('id="contacts"');
    expect(html).toContain('Обсудить проект');
  });

  it('экранирует HTML в данных', () => {
    const evil = { ...site, tagline: '<script>x</script>' };
    expect(renderFallback(evil)).not.toContain('<script>x</script>');
  });
});

describe('site', () => {
  it('имеет пять разворотов в нужном порядке', () => {
    expect(site.spreads.map((s) => s.id)).toEqual(['cover', 'beauty', 'coffee', 'residence', 'services']);
  });

  it('у обложки только правая сторона, у остальных обе', () => {
    for (const s of site.spreads) {
      if (s.id === 'cover') expect(s.left).toBeUndefined();
      else expect(s.left).toMatch(/^\/pages\/.+-left\.webp$/);
      expect(s.right).toMatch(/^\/pages\/.+-right\.webp$/);
    }
  });
});
