import { describe, expect, it } from 'vitest';
import { chooseMode } from '../../src/boot.ts';

describe('chooseMode', () => {
  it('без WebGL — запасная страница', () => {
    expect(chooseMode({ webgl: false, reducedMotion: false })).toBe('fallback');
  });
  it('при reduced motion — запасная страница', () => {
    expect(chooseMode({ webgl: true, reducedMotion: true })).toBe('fallback');
  });
  it('WebGL есть и анимация разрешена — книга', () => {
    expect(chooseMode({ webgl: true, reducedMotion: false })).toBe('book');
  });
});
