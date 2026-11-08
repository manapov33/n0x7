import { site } from './content/site.ts';
import { buildScenes } from './film/scenes.ts';
import { computeFilm, totalScreens, type FilmState } from './film/timeline.ts';
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

  let app: { applyFilm(state: FilmState): void; dispose(): void } | undefined;
  let detachLamp: (() => void) | undefined;
  let failed = false;

  // Прогресс = scrollY / (высота спейсера − высота окна).
  const spacerHeight = () => screens * window.innerHeight;
  const maxScroll = () => Math.max(1, spacerHeight() - window.innerHeight);
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  spacer.style.height = `${spacerHeight()}px`;
  let progress = clamp01(window.scrollY / maxScroll());
  const apply = () => {
    const state = computeFilm(progress, {
      scenes,
      spreadCount,
      aspect: Math.max(1, window.innerWidth) / Math.max(1, window.innerHeight),
    });
    root.dataset.scene = state.scene;
    label(state);
    app?.applyFilm(state);
  };
  const onScroll = () => {
    progress = clamp01(window.scrollY / maxScroll());
    apply();
  };
  // При изменении размера держим прогресс, а не пиксели прокрутки.
  const onResize = () => {
    spacer.style.height = `${spacerHeight()}px`;
    window.scrollTo(0, progress * maxScroll());
    apply();
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  apply();

  const fail = () => {
    if (failed) return;
    failed = true;
    root.removeAttribute('data-mode');
    root.removeAttribute('data-scene');
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    detachLamp?.();
    app?.dispose();
    ui.destroy();
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
