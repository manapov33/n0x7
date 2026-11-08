// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot, chooseMode, detectEnv } from '../../src/boot.ts';

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

describe('boot: сбой загрузки', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-mode');
  });
  it('запасная страница после сбоя начинается с верха', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {} }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({ getExtension: () => null })) as never);
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    window.scrollTo = scrollTo as never;
    await boot({ importTimeoutMs: 0 });
    expect(document.documentElement.getAttribute('data-mode')).toBeNull(); // fail() сработал
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
  });
});
