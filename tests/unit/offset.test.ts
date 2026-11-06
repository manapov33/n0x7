import { describe, expect, it } from 'vitest';
import { bookOffsetX } from '../../src/book/offset.ts';

describe('bookOffsetX', () => {
  it('закрытый сдвинут на полстраницы влево, открытый по центру', () => {
    expect(bookOffsetX(0, 3)).toBeCloseTo(-1.5);
    expect(bookOffsetX(1, 3)).toBeCloseTo(0);
    expect(bookOffsetX(0.5, 3)).toBeCloseTo(-0.75);
  });
});
