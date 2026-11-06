// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createUi } from '../../src/ui/ui.ts';
import type { Site } from '../../src/content/types.ts';

describe('createUi экранирует значения сайта', () => {
  it('разметка из данных не превращается в элементы и атрибуты', () => {
    const evil = {
      name: 'N0X7',
      tagline: '<img src=x onerror=alert(1)>tag',
      telegramUrl: 'https://t.me/x" onmouseover="alert(1)',
      phone: '+7 <b>999</b>',
      services: [],
      spreads: [{ id: 'a', kind: 'cover', title: 't', right: 'r', alt: 'a' }],
    } as unknown as Site;
    const root = document.createElement('div');
    const ui = createUi(root, evil);
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('.ui-tagline')!.textContent).toBe(evil.tagline);
    const tg = root.querySelector<HTMLAnchorElement>('a[href^="https://t.me/"]')!;
    expect(tg.hasAttribute('onmouseover')).toBe(false);
    expect(tg.getAttribute('href')).toBe(evil.telegramUrl);
    expect(root.querySelector('b')).toBeNull();
    ui.destroy();
  });
});
