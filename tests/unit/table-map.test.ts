import { describe, expect, it } from 'vitest';
import { fitCamera } from '../../src/scene/camera.ts';
import { tableImageMap, tablePlaneSize, visibleWorldSize, type Rect } from '../../src/scene/tableMap.ts';

const G = { pageW: 3, pageH: 4, fov: 35 };
const area = (r: Rect) => r.w * r.h;
const overlap = (a: Rect, b: Rect) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

describe('visibleWorldSize', () => {
  it('совпадает с геометрией камеры: разворот 16:10 примерно 7,4 x 4,64', () => {
    const v = visibleWorldSize(1.6, 'spread', G.pageW, G.pageH, G.fov);
    expect(v.w).toBeCloseTo(7.42, 1);
    expect(v.h).toBeCloseTo(4.64, 2);
    expect(v.h).toBeCloseTo(2 * fitCamera(1.6, 'spread', 3, 4, 35) * Math.tan((35 * Math.PI) / 360), 6);
  });
  it('на 21:9 разворот примерно 10,8 x 4,64', () => {
    const v = visibleWorldSize(21 / 9, 'spread', G.pageW, G.pageH, G.fov);
    expect(v.w).toBeCloseTo(10.83, 1);
    expect(v.h).toBeCloseTo(4.64, 2);
  });
});

describe('tablePlaneSize', () => {
  const p = tablePlaneSize(G.pageW, G.pageH, G.fov);
  it('держит пропорцию 16:10', () => {
    expect(p.w / p.h).toBeCloseTo(1.6, 6);
  });
  it('закрывает разворот на 21:9 и на узком планшете без края', () => {
    for (const a of [0.75, 1.6, 16 / 9, 21 / 9]) {
      const v = visibleWorldSize(a, 'spread', G.pageW, G.pageH, G.fov);
      expect(p.w).toBeGreaterThanOrEqual(v.w);
      expect(p.h).toBeGreaterThanOrEqual(v.h);
    }
  });
  it('закрывает кадры телефона (страница со сдвигом камеры на половину разворота)', () => {
    for (const a of [0.4, 0.46, 0.56]) {
      const v = visibleWorldSize(a, 'page', G.pageW, G.pageH, G.fov);
      expect(p.w).toBeGreaterThanOrEqual(2 * (G.pageW / 2 + v.w / 2));
      expect(p.h).toBeGreaterThanOrEqual(v.h);
    }
  });
});

describe('tableImageMap', () => {
  const m = tableImageMap(G.pageW, G.pageH, G.fov, 3840, 2400);
  const plane = tablePlaneSize(G.pageW, G.pageH, G.fov);

  it('масштаб один для обеих осей и привязан к плоскости сцены', () => {
    expect(m.pxPerUnit).toBeCloseTo(3840 / plane.w, 6);
    expect(m.pxPerUnit).toBeCloseTo(2400 / plane.h, 6);
  });
  it('разворот и обложка стоят по центру, обложка внутри разворота', () => {
    expect(m.spread.x + m.spread.w / 2).toBeCloseTo(1920, 0);
    expect(m.spread.y + m.spread.h / 2).toBeCloseTo(1200, 0);
    expect(m.spread.w).toBeCloseTo(6 * m.pxPerUnit, 0);
    expect(m.spread.h).toBeCloseTo(4 * m.pxPerUnit, 0);
    expect(m.cover.w).toBeCloseTo(3 * m.pxPerUnit, 0);
    expect(m.cover.x + m.cover.w / 2).toBeCloseTo(1920, 0);
    expect(overlap(m.cover, m.spread)).toBe(area(m.cover));
  });
  it('кадры 16:10, 16:9, 21:9 лежат внутри изображения и растут в ширину', () => {
    const img: Rect = { x: 0, y: 0, w: 3840, h: 2400 };
    for (const f of [m.frames['16:10'], m.frames['16:9'], m.frames['21:9']]) {
      expect(overlap(f, img)).toBe(area(f));
    }
    expect(m.frames['16:9'].w).toBeGreaterThan(m.frames['16:10'].w);
    expect(m.frames['21:9'].w).toBeGreaterThan(m.frames['16:9'].w);
    expect(m.frames['21:9'].w / m.frames['21:9'].h).toBeGreaterThan(2);
  });
  it('реквизит не под журналом и виден на 16:9 хотя бы наполовину', () => {
    for (const r of [m.props.cup, m.props.pen]) {
      expect(overlap(r, m.spread)).toBe(0);
      expect(overlap(r, m.frames['16:9'])).toBeGreaterThanOrEqual(area(r) * 0.5);
    }
  });
  it('считает тот же результат для другого размера изображения пропорционально', () => {
    const half = tableImageMap(G.pageW, G.pageH, G.fov, 1920, 1200);
    expect(half.spread.w).toBeCloseTo(m.spread.w / 2, 0);
    expect(half.frames['16:9'].x).toBeCloseTo(m.frames['16:9'].x / 2, 0);
  });
});

describe('заглушка стола', () => {
  it('рамки в pages/table-stub.html совпадают с картой', async () => {
    const { readFileSync } = await import('node:fs');
    const html = readFileSync('pages/table-stub.html', 'utf8');
    const m = tableImageMap(G.pageW, G.pageH, G.fov, 3840, 2400);
    const rects = [m.spread, m.cover, m.frames['16:10'], m.frames['16:9'], m.frames['21:9'], m.props.cup, m.props.pen];
    for (const r of rects) {
      expect(html).toContain(`data-rect="${r.x},${r.y},${r.w},${r.h}"`);
    }
  });
});
