import { describe, expect, it } from 'vitest';
import { buildScenes, SCREENS } from '../../src/film/scenes.ts';
import { fitCamera } from '../../src/scene/camera.ts';
import { FOV, PAGE_H, PAGE_W } from '../../src/scene/dims.ts';
import { computeFilm, sceneStart, totalScreens } from '../../src/film/timeline.ts';

const scenes = buildScenes(3);
const input = { scenes, spreadCount: 5, aspect: 1.6 };

describe('film timeline', () => {
  it('builds scene order and length', () => {
    expect(scenes.map((s) => s.id)).toEqual(['table','open','dive','play','surface','turn','dive','play','surface','turn','dive','play','surface','turn','services','contacts']);
    expect(totalScreens(scenes)).toBeCloseTo(10.4);
    expect(SCREENS.play).toBe(1.2);
  });
  it('start and end', () => {
    expect(computeFilm(0, input).scene).toBe('table');
    expect(computeFilm(0, input).overlay.hero).toBe(1);
    expect(computeFilm(1, input).scene).toBe('contacts');
  });
  it('middle of first play', () => {
    const p = (sceneStart(scenes, 3) + sceneStart(scenes, 4)) / 2;
    const s = computeFilm(p, input);
    expect(s.work).toEqual({ index: 0, frame: expect.closeTo(0.5, 1), screen: 1 });
    expect(s.spread).toBe(1);
    expect(computeFilm(p, { ...input, aspect: 0.46 }).work?.screen).toBe(1);
  });
  it('camera is lower in dive than open', () => {
    expect(computeFilm(sceneStart(scenes, 3), input).camera.h).toBeLessThan(computeFilm(sceneStart(scenes, 2), input).camera.h);
  });
  it('is deterministic, clamped and history-free', () => {
    const qs = [0, 0.13, 0.5, 0.77, 1];
    for (const q1 of qs) for (const q2 of qs) {
      const fresh = computeFilm(q2, input);
      computeFilm(q1, input);
      expect(computeFilm(q2, input)).toEqual(fresh);
    }
    expect(computeFilm(-1, input)).toEqual(computeFilm(0, input));
    expect(computeFilm(2, input)).toEqual(computeFilm(1, input));
  });
  it('state is continuous across scene boundaries', () => {
    for (const aspect of [0.46, 1, 1.6]) {
      const inp = { ...input, aspect };
      for (let i = 1; i < scenes.length; i++) {
        const b = sceneStart(scenes, i);
        const lo = computeFilm(b - 1e-7, inp);
        const hi = computeFilm(b + 1e-7, inp);
        const close = (a: number, c: number, what: string) =>
          expect(Math.abs(a - c), `${what} @scene ${i} aspect ${aspect}`).toBeLessThan(1e-3);
        close(lo.camera.h, hi.camera.h, 'h');
        for (const k of Object.keys(lo.overlay)) close(lo.overlay[k]!, hi.overlay[k]!, `overlay.${k}`);
        lo.sheets.forEach((v, j) => close(v, hi.sheets[j]!, `sheet ${j}`));
        close(lo.work?.screen ?? 0, hi.work?.screen ?? 0, 'work.screen');
      }
    }
  });
  it('spread covers the viewport during play (cover, not contain)', () => {
    const tan = Math.tan((FOV * Math.PI) / 360);
    const p = (sceneStart(scenes, 3) + sceneStart(scenes, 4)) / 2;
    for (const aspect of [0.46, 1, 1.6, 2.2]) {
      const h = computeFilm(p, { ...input, aspect }).camera.h;
      const halfH = h * tan;
      const halfW = h * tan * aspect;
      expect(halfH).toBeLessThanOrEqual(PAGE_H / 2 + 1e-6);
      expect(halfW).toBeLessThanOrEqual(PAGE_W + 1e-6);
      expect(Math.min(PAGE_H / 2 - halfH, PAGE_W - halfW)).toBeLessThan(1e-6);
    }
  });
  it('closed magazine is about half the viewport width on a phone at table', () => {
    const tan = Math.tan((FOV * Math.PI) / 360);
    const aspect = 390 / 844;
    const h = computeFilm(0, { ...input, aspect }).camera.h;
    const frac = PAGE_W / (2 * h * tan * aspect);
    expect(frac).toBeGreaterThan(0.45);
    expect(frac).toBeLessThan(0.55);
  });
  it('desktop table framing unchanged', () => {
    const hSpread = fitCamera(1.6, 'spread', PAGE_W, PAGE_H, FOV);
    expect(computeFilm(0, input).camera.h).toBeCloseTo(2.2 * hSpread, 9);
  });
  it('pages turn', () => {
    const s = computeFilm(sceneStart(scenes, 6), input);
    expect(s.sheets[1]).toBe(1);
    expect(s.spread).toBe(2);
    expect(computeFilm(sceneStart(scenes, 14), input).spread).toBe(4);
    expect(computeFilm(sceneStart(scenes, 14), input).sheets[0]).toBe(computeFilm(1, input).coverOpen);
  });
});
