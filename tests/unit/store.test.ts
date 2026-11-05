import { describe, expect, it, vi } from 'vitest';
import { createTextureStore } from '../../src/textures/store.ts';

const urlsForSpread = (s: number) => [`/s${s}.webp`];

describe('createTextureStore', () => {
  it('грузит разворот и заранее следующий, без повторов', async () => {
    const load = vi.fn(async (url: string) => `tex:${url}`);
    const store = createTextureStore({ load, urlsForSpread, onFatal: vi.fn() });
    await store.ensure(1);
    expect(load).toHaveBeenCalledWith('/s1.webp');
    expect(load).toHaveBeenCalledWith('/s2.webp');
    expect(load).toHaveBeenCalledTimes(2);
    await store.ensure(1);
    expect(load).toHaveBeenCalledTimes(2);
    expect(store.get('/s1.webp')).toBe('tex:/s1.webp');
    expect(store.get('/nope.webp')).toBeUndefined();
  });

  it('повторяет первую ошибку, onFatal не вызывается', async () => {
    let calls = 0;
    const load = vi.fn(async (url: string) => {
      if (url === '/s1.webp' && ++calls === 1) throw new Error('net');
      return url;
    });
    const onFatal = vi.fn();
    const store = createTextureStore({ load, urlsForSpread, onFatal });
    await store.ensure(1);
    expect(onFatal).not.toHaveBeenCalled();
    expect(store.get('/s1.webp')).toBe('/s1.webp');
  });

  it('при второй ошибке вызывает onFatal один раз и не бросает', async () => {
    const err = new Error('dead');
    const load = vi.fn(async (url: string) => {
      if (url === '/s1.webp') throw err;
      return url;
    });
    const onFatal = vi.fn();
    const store = createTextureStore({ load, urlsForSpread, onFatal });
    await expect(store.ensure(1)).resolves.toBeUndefined();
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(onFatal).toHaveBeenCalledWith('/s1.webp', err);
    expect(store.get('/s1.webp')).toBeUndefined();
  });
});
