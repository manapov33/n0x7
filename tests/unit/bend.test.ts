import { describe, expect, it } from 'vitest';
import { sheetPoint, shadowOpacity } from '../../src/book/bend.ts';

describe('sheetPoint', () => {
  it('lies flat on the right at p=0', () => {
    expect(sheetPoint(1, 0).x).toBeCloseTo(1);
    expect(sheetPoint(1, 0).z).toBeCloseTo(0);
  });
  it('lies flat on the left at p=1', () => {
    expect(sheetPoint(1, 1).x).toBeCloseTo(-1);
    expect(sheetPoint(1, 1).z).toBeCloseTo(0);
  });
  it('spine point stays at the origin', () => {
    expect(sheetPoint(0, 0.5)).toEqual({ x: 0, z: 0 });
  });
  it('lifts the free edge mid-turn', () => {
    expect(sheetPoint(1, 0.5).z).toBeGreaterThan(0);
  });
  it('keeps z >= 0 and polyline length 1 for all p', () => {
    for (let p = 0; p <= 1.0001; p += 0.1) {
      let len = 0;
      let prev = sheetPoint(0, p);
      for (let i = 1; i <= 200; i++) {
        const pt = sheetPoint(i / 200, p);
        expect(pt.z).toBeGreaterThanOrEqual(-1e-9);
        len += Math.hypot(pt.x - prev.x, pt.z - prev.z);
        prev = pt;
      }
      expect(Math.abs(len - 1)).toBeLessThan(1e-2);
    }
  });
});

describe('shadowOpacity', () => {
  it('is 0 at ends and 0.45 mid-turn', () => {
    expect(shadowOpacity(0)).toBeCloseTo(0);
    expect(shadowOpacity(1)).toBeCloseTo(0);
    expect(shadowOpacity(0.5)).toBeCloseTo(0.45);
  });
});
