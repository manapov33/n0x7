import { site } from './content/site.ts';
import { buildScenes } from './film/scenes.ts';
import { shouldPreload } from './film/frames.ts';
import { createOverlay } from './film/overlay.ts';
import { createRail } from './film/rail.ts';
import { attachKeys, createScroll } from './film/scroll.ts';
import { computeFilm, sceneStart, totalScreens, type FilmState } from './film/timeline.ts';
import { attachLamp, createUi } from './ui/ui.ts';
import { LOAD_TIMEOUT_MS, withTimeout } from './util/timeout.ts';

export type Env = { webgl: boolean; reducedMotion: boolean };

export function chooseMode(e: Env): 'book' | 'fallback' {
  return e.webgl && !e.reducedMotion ? 'book' : 'fallback';
}

export function detectEnv(): Env {
  let webgl = false;
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2'); // three r187 работает только на WebGL2
    webgl = gl !== null;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webgl = false;
  }
  return { webgl, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
}

export async function boot(o: { importTimeoutMs?: number } = {}): Promise<void> {
  const load = <T>(p: Promise<T>, what: string) => withTimeout(p, o.importTimeoutMs ?? LOAD_TIMEOUT_MS, what);
  (window as unknown as { __n0x7Booted?: boolean }).__n0x7Booted = true; // сторожевой таймер из index.html
  const root = document.documentElement;
  if (chooseMode(detectEnv()) === 'fallback') {
    root.removeAttribute('data-mode');
    return;
  }
  root.dataset.mode = 'book';

  const spreadCount = site.spreads.length;
  const scenes = buildScenes(site.spreads.filter((s) => s.kind === 'work').length);
  const screens = totalScreens(scenes);

  const canvas = document.createElement('canvas');
  canvas.id = 'scene';
  canvas.setAttribute('role', 'img');
  const label = (state: FilmState) => {
    const spread = state.work ? state.work.index + 1 : state.spread;
    canvas.setAttribute('aria-label', site.spreads[spread]?.alt ?? site.name);
  };
  const loading = document.createElement('div');
  loading.id = 'loading';
  loading.innerHTML = '<span class="loading-logo">N0X7</span><span class="loading-bar"></span>';
  const spacer = document.createElement('div');
  spacer.id = 'film-spacer';
  document.body.append(canvas, loading, spacer);
  const ui = createUi(document.body, site);
  const overlay = createOverlay(document.body, site);

  let app: { applyFilm(state: FilmState): void; preloadWork(k: number): void; dispose(): void } | undefined;
  let detachLamp: (() => void) | undefined;
  let failed = false;

  // Кадры работы грузятся, когда до её dive меньше экрана прокрутки.
  const diveStarts = scenes
    .map((s, i) => (s.id === 'dive' ? sceneStart(scenes, i) : -1))
    .filter((p) => p >= 0);

  const toContacts = () => scroll.jumpTo(1);

  // Прогресс фильма сглаживается (createScroll); нативная прокрутка остаётся нативной.
  let progress = 0;
  const apply = () => {
    const state = computeFilm(progress, {
      scenes,
      spreadCount,
      aspect: Math.max(1, root.clientWidth) / Math.max(1, root.clientHeight),
    });
    root.dataset.scene = state.scene;
    label(state);
    overlay.update(state.overlay);
    ui.setCtaJump((state.overlay.contacts ?? 0) > 0.5 ? toContacts : null);
    app?.applyFilm(state);
    diveStarts.forEach((start, k) => {
      if (shouldPreload(progress, start, screens)) app?.preloadWork(k);
    });
  };

  const works = site.spreads.filter((s) => s.kind === 'work');
  const marks = works.map((w, k) => ({
    label: w.title,
    progress: sceneStart(scenes, scenes.findIndex((s) => s.id === 'play' && s.work === k)),
  }));
  marks.push({ label: 'Контакты', progress: sceneStart(scenes, scenes.findIndex((s) => s.id === 'contacts')) });
  const rail = createRail(document.body, marks, (p) => scroll.jumpTo(p));

  // Кадры идут, пока прогресс не сошёлся с целью; в покое цикл спит.
  let raf = 0;
  let last = 0;
  const loop = (now: number) => {
    raf = 0;
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    const more = scroll.tick(dt);
    root.dataset.settled = String(!more);
    if (more) raf = requestAnimationFrame(loop);
  };
  const wake = () => {
    if (raf) return;
    last = performance.now();
    root.dataset.settled = 'false';
    raf = requestAnimationFrame(loop);
  };
  const scroll = createScroll({
    win: window,
    spacer,
    screens,
    onProgress: (p) => {
      progress = p;
      apply();
      rail.update(p);
    },
    onWake: wake,
  });
  root.dataset.settled = 'true';
  const detachKeys = attachKeys(document, {
    starts: scenes.map((_, i) => sceneStart(scenes, i)),
    target: scroll.target,
    jumpTo: scroll.jumpTo,
  });
  // Размер окна: камера пересчитывает аспект (scene.ts), длину фильма держит createScroll.
  const onResize = () => apply();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  const fail = () => {
    if (failed) return;
    failed = true;
    root.removeAttribute('data-mode');
    root.removeAttribute('data-scene');
    root.removeAttribute('data-settled');
    cancelAnimationFrame(raf);
    scroll.destroy();
    detachKeys();
    rail.destroy();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    detachLamp?.();
    app?.dispose();
    ui.destroy();
    overlay.destroy();
    canvas.remove();
    loading.remove();
    spacer.remove();
  };

  try {
    const { createApp } = await load(import('./scene/scene.ts'), 'scene');
    if (failed) return;
    const created = createApp(canvas, fail);
    app = created;
    if (failed) {
      created.dispose();
      return;
    }
    detachLamp = attachLamp(window, (nx, ny) => created.setLamp(nx, ny), matchMedia('(hover: hover)').matches);
    apply();
    await created.ready;
    if (!failed) loading.remove();
  } catch {
    fail();
  }
}
