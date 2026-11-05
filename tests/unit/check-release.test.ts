import { describe, expect, it } from 'vitest';
import { site } from '../../src/content/site';
import { findPlaceholders } from '../../scripts/check-release';
import type { Site } from '../../src/content/types';

const clean: Site = {
  ...site,
  telegramUrl: 'https://t.me/n0x7studio',
  phone: '+79990000000',
  services: [{ name: 'Сайт', priceFrom: '80 000 ₽' }],
};

describe('findPlaceholders', () => {
  it('находит заглушки в текущих данных', () => {
    const found = findPlaceholders(site);
    expect(found.length).toBeGreaterThan(0);
    expect(found).toContain('telegramUrl');
    expect(found).toContain('phone');
    expect(found).toContain('services[0].priceFrom');
  });

  it('возвращает пустой список для чистых данных', () => {
    expect(findPlaceholders({ ...clean })).toEqual([]);
  });
});
