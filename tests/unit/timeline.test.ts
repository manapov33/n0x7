import { describe, expect, it } from 'vitest';
import { buildScenes, SCREENS } from '../../src/film/scenes.ts';
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
  it('is deterministic and clamped', () => {
    for (const q of [0, 0.13, 0.5, 0.77, 1]) expect(computeFilm(q, input)).toEqual(computeFilm(q, input));
    expect(computeFilm(-1, input)).toEqual(computeFilm(0, input));
    expect(computeFilm(2, input)).toEqual(computeFilm(1, input));
  });
  it('camera is continuous', () => {
    for (let q = 0; q < 1; q += 0.001) {
      expect(Math.abs(computeFilm(q + 0.001, input).camera.h - computeFilm(q, input).camera.h)).toBeLessThan(0.5);
    }
  });
  it('pages turn', () => {
    const s = computeFilm(sceneStart(scenes, 6), input);
    expect(s.sheets[1]).toBe(1);
    expect(s.spread).toBe(2);
    expect(computeFilm(sceneStart(scenes, 14), input).spread).toBe(4);
    expect(computeFilm(sceneStart(scenes, 14), input).sheets[0]).toBe(computeFilm(1, input).coverOpen);
  });
});
