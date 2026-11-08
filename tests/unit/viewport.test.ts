import { describe, expect, it } from 'vitest';
import { isPhone, PHONE_MAX_WIDTH } from '../../src/controls/viewport.ts';

describe('isPhone', () => {
  it('телефон — ширина строго меньше 768', () => {
    expect(PHONE_MAX_WIDTH).toBe(768);
    expect(isPhone(767)).toBe(true);
    expect(isPhone(768)).toBe(false);
    expect(isPhone(390)).toBe(true);
    expect(isPhone(1440)).toBe(false);
  });
});
