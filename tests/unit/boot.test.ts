// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chooseMode, detectEnv } from '../../src/boot.ts';

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

describe('detectEnv', () => {
  const stub = (only: string) => {
    const gl = { getExtension: () => null };
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) =>
      type === only ? gl : null) as never);
  };
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('только webgl (без webgl2) — WebGL нет: three r187 требует WebGL2', () => {
    stub('webgl');
    expect(detectEnv().webgl).toBe(false);
  });
  it('webgl2 есть — WebGL есть', () => {
    stub('webgl2');
    expect(detectEnv().webgl).toBe(true);
  });
});
