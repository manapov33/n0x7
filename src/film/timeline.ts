import { fitCamera } from '../scene/camera.ts';
import type { SceneId, SceneSpec } from './scenes.ts';

export type Camera = { x: number; y: number; h: number };
export type FilmState = {
  scene: SceneId;
  sceneT: number;
  camera: Camera;
  coverOpen: number;
  sheets: number[];
  spread: number;
  work: { index: number; frame: number; screen: number } | null;
  overlay: Record<string, number>;
};
export type FilmInput = { scenes: SceneSpec[]; spreadCount: number; aspect: number };

const PAGE_W = 3;
const PAGE_H = 4;
const FOV = 35;
const TABLE_FACTOR = 2.2;
const EPS = 1e-9;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function totalScreens(scenes: SceneSpec[]): number {
  return scenes.reduce((sum, s) => sum + s.screens, 0);
}

export function sceneStart(scenes: SceneSpec[], index: number): number {
  let acc = 0;
  for (let i = 0; i < index; i++) acc += scenes[i]!.screens;
  return acc / totalScreens(scenes);
}

export function computeFilm(progress: number, input: FilmInput): FilmState {
  const { scenes, spreadCount, aspect } = input;
  const total = totalScreens(scenes);
  const x = clamp01(progress) * total;

  // current scene: last one whose start <= x (with tolerance for boundaries)
  let idx = 0;
  let start = 0;
  let acc = 0;
  for (let i = 0; i < scenes.length; i++) {
    if (acc <= x + EPS) {
      idx = i;
      start = acc;
    }
    acc += scenes[i]!.screens;
  }
  const cur = scenes[idx]!;
  const t = clamp01((x - start) / cur.screens);
  const s = smooth(t);

  const hSpread = fitCamera(aspect, 'spread', PAGE_W, PAGE_H, FOV);
  const hTable = TABLE_FACTOR * hSpread;
  const hMid = (hTable + hSpread) / 2;
  const tan = Math.tan((FOV * Math.PI) / 360);
  const hCover = Math.max(PAGE_H / 2 / tan, (2 * PAGE_W) / 2 / (tan * aspect));

  let h: number;
  switch (cur.id) {
    case 'table': h = mix(hTable, hMid, s); break;
    case 'open': h = mix(hMid, hSpread, s); break;
    case 'dive': h = mix(hSpread, hCover, s); break;
    case 'play': h = hCover; break;
    case 'surface': h = mix(hCover, hSpread, s); break;
    case 'contacts': h = mix(hSpread, hTable, s); break;
    default: h = hSpread;
  }

  // sheets: sheet 0 = cover (open); turn after work k turns sheet k+1
  const sheets = new Array<number>(spreadCount).fill(0);
  scenes.forEach((sc, i) => {
    let sheet = -1;
    if (sc.id === 'open') sheet = 0;
    else if (sc.id === 'turn') sheet = (sc.work ?? 0) + 1;
    if (sheet < 0 || sheet >= spreadCount) return;
    sheets[sheet] = i < idx ? 1 : i === idx ? s : 0;
  });
  const spread = Math.min(spreadCount - 1, sheets.filter((v) => v >= 0.5).length);

  // work video
  let work: FilmState['work'] = null;
  if (cur.work !== undefined) {
    if (cur.id === 'dive') work = { index: cur.work, frame: 0, screen: s };
    else if (cur.id === 'play') work = { index: cur.work, frame: t, screen: 1 };
    else if (cur.id === 'surface') work = { index: cur.work, frame: 1, screen: 1 - s };
  }

  // overlay
  const overlay: Record<string, number> = { hero: 0, services: 0, contacts: 0 };
  for (const sc of scenes) if (sc.work !== undefined) overlay[`work-${sc.work}`] = 0;
  if (cur.id === 'table') overlay.hero = 1;
  else if (cur.id === 'open') overlay.hero = 1 - smooth(t * 2);
  else if (cur.id === 'play') overlay[`work-${cur.work}`] = smooth(t * 2);
  else if (cur.id === 'surface') overlay[`work-${cur.work}`] = 1 - s;
  else if (cur.id === 'services') overlay.services = smooth(t * 4);
  else if (cur.id === 'contacts') overlay.contacts = smooth(t * 4);

  return {
    scene: cur.id,
    sceneT: t,
    camera: { x: 0, y: 0, h },
    coverOpen: sheets[0]!,
    sheets,
    spread,
    work,
    overlay,
  };
}
