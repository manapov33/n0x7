import { describe, expect, it } from 'vitest';
import { fitCamera } from '../../src/scene/camera.ts';

describe('fitCamera', () => {
  it('узкий экран требует большей высоты камеры, чем широкий', () => {
    expect(fitCamera(0.46, 'spread', 3, 4, 35)).toBeGreaterThan(fitCamera(1.6, 'spread', 3, 4, 35));
  });

  it('одна страница ближе, чем разворот, на узком экране', () => {
    expect(fitCamera(0.46, 'page', 3, 4, 35)).toBeLessThan(fitCamera(0.46, 'spread', 3, 4, 35));
  });

  it('оставляет 8% запаса: на широком экране ограничивает высота страницы', () => {
    const h = fitCamera(2, 'page', 3, 4, 35);
    const visibleH = 2 * h * Math.tan((35 * Math.PI) / 360);
    expect(visibleH).toBeCloseTo(4 * 1.16, 5);
  });
});
