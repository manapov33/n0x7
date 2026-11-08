export type SceneId =
  | 'table'
  | 'open'
  | 'dive'
  | 'play'
  | 'surface'
  | 'turn'
  | 'services'
  | 'contacts';

export type SceneSpec = { id: SceneId; screens: number; work?: number };

/** Длина каждой сцены в экранах прокрутки (настраивается здесь). */
export const SCREENS: Record<SceneId, number> = {
  table: 0.8,
  open: 0.8,
  dive: 0.4,
  play: 1.2,
  surface: 0.4,
  turn: 0.4,
  services: 0.8,
  contacts: 0.8,
};

const spec = (id: SceneId, work?: number): SceneSpec =>
  work === undefined ? { id, screens: SCREENS[id] } : { id, screens: SCREENS[id], work };

export function buildScenes(workCount: number): SceneSpec[] {
  const scenes: SceneSpec[] = [spec('table'), spec('open')];
  for (let k = 0; k < workCount; k++) {
    scenes.push(spec('dive', k), spec('play', k), spec('surface', k), spec('turn', k));
  }
  scenes.push(spec('services'), spec('contacts'));
  return scenes;
}
