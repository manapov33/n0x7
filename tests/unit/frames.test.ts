import { describe, expect, it } from 'vitest';
import { createFrameSequence, frameIndex, shouldPreload, worksToPreload } from '../../src/film/frames.ts';

describe('frameIndex', () => {
  it('t 0..1 → 0..count-1', () => {
    expect(frameIndex(0, 90)).toBe(0);
    expect(frameIndex(1, 90)).toBe(89);
    expect(frameIndex(0.5, 90)).toBe(45);
  });
  it('зажимает выход за границы', () => {
    expect(frameIndex(-1, 90)).toBe(0);
    expect(frameIndex(2, 90)).toBe(89);
    expect(frameIndex(0.5, 1)).toBe(0);
  });
});

describe('createFrameSequence', () => {
  const urls = Array.from({ length: 12 }, (_, i) => `/f/${i}.webp`);
  const loadOnly = (ok: Set<number>) => async (url: string) => {
    const i = Number(/(\d+)\.webp/.exec(url)![1]);
    if (!ok.has(i)) throw new Error('nope');
    return url;
  };
  const settle = () => new Promise((r) => setTimeout(r, 20));

  it('готовы 0 и 10: для 7 это 10, для 3 это 0', async () => {
    const seq = createFrameSequence({ urls, load: loadOnly(new Set([0, 10])) });
    seq.preload();
    await settle();
    expect(seq.readyCount()).toBe(2);
    expect(seq.nearestReady(7)).toBe('/f/10.webp');
    expect(seq.nearestReady(3)).toBe('/f/0.webp');
    expect(seq.nearestReady(10)).toBe('/f/10.webp');
  });

  it('ничего не готово → undefined', () => {
    const seq = createFrameSequence({ urls, load: loadOnly(new Set()) });
    expect(seq.nearestReady(5)).toBeUndefined();
    expect(seq.readyCount()).toBe(0);
  });

  it('preload идемпотентен и ограничивает число одновременных загрузок', async () => {
    let active = 0;
    let peak = 0;
    let calls = 0;
    const seq = createFrameSequence({
      urls,
      load: async (url) => {
        calls++;
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return url;
      },
      concurrency: 3,
    });
    seq.preload();
    seq.preload();
    await new Promise((r) => setTimeout(r, 100));
    expect(calls).toBe(12);
    expect(peak).toBeLessThanOrEqual(3);
    expect(seq.readyCount()).toBe(12);
  });

  it('focus: сначала кадры около фокуса, потом наружу', async () => {
    const order: number[] = [];
    const seq = createFrameSequence({
      urls,
      load: async (url) => {
        order.push(Number(/(\d+)\.webp/.exec(url)![1]));
        return url;
      },
      concurrency: 1,
    });
    seq.focus(8);
    seq.preload();
    await settle();
    expect(order.slice(0, 5)).toEqual([8, 7, 9, 6, 10]);
    expect(order.length).toBe(12);
  });

  it('onReady сообщает индекс готового кадра', async () => {
    const got: number[] = [];
    const seq = createFrameSequence({ urls: urls.slice(0, 3), load: async (u) => u, onReady: (i) => got.push(i) });
    seq.preload();
    await settle();
    expect(got.sort()).toEqual([0, 1, 2]);
  });
});

describe('shouldPreload', () => {
  it('начинаем меньше чем за экран до dive', () => {
    // 10 экранов в фильме, dive на прогрессе 0.5
    expect(shouldPreload(0.3, 0.5, 10)).toBe(false);
    expect(shouldPreload(0.41, 0.5, 10)).toBe(true);
    expect(shouldPreload(0.9, 0.5, 10)).toBe(true);
  });
});

describe('worksToPreload', () => {
  // три работы по 0.1 экрана-окна; screens = 10 → запас 0.1 с каждой стороны
  const zones = [
    { start: 0.2, end: 0.3 },
    { start: 0.4, end: 0.5 },
    { start: 0.6, end: 0.7 },
  ];
  it('обычная прокрутка: работы, к которым подошли или рядом с которыми находятся', () => {
    expect(worksToPreload(0, zones, 10, null)).toEqual([]);
    expect(worksToPreload(0.15, zones, 10, null)).toEqual([0]);
    expect(worksToPreload(0.35, zones, 10, null)).toEqual([0, 1]);
  });
  it('конец фильма: пройденные работы уже не грузятся', () => {
    expect(worksToPreload(1, zones, 10, null)).toEqual([]);
    expect(worksToPreload(0.85, zones, 10, null)).toEqual([]);
  });
  it('во время прыжка грузится только работа назначения, а не все по пути', () => {
    expect(worksToPreload(0.45, zones, 10, 0.65)).toEqual([2]);
    expect(worksToPreload(0.05, zones, 10, 1)).toEqual([]);
    expect(worksToPreload(0.5, zones, 10, 0.25)).toEqual([0]);
  });
});
