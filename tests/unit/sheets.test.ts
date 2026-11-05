import { describe, expect, it } from 'vitest';
import { site } from '../../src/content/site.ts';
import { buildSheets } from '../../src/book/sheets.ts';

describe('buildSheets', () => {
  const s = buildSheets(site.spreads);
  it('makes one sheet per spread', () => {
    expect(s).toHaveLength(5);
  });
  it('front is right page of spread i, back is left page of spread i+1', () => {
    expect(s[0]!.front).toBe(site.spreads[0]!.right);
    expect(s[0]!.back).toBe(site.spreads[1]!.left);
    expect(s[1]!.front).toBe(site.spreads[1]!.right);
  });
  it('last sheet has no back', () => {
    expect(s[4]!.back).toBeUndefined();
  });
});
