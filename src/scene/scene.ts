import {
  AmbientLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  DataTexture,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  SpotLight,
  SRGBColorSpace,
  TextureLoader,
  WebGLRenderer,
  type Texture,
} from 'three';
import { buildSheets } from '../book/sheets.ts';
import { createBookView } from '../book/view.ts';
import { site } from '../content/site.ts';
import { createScreen } from './screen.ts';
import { createTextureStore } from '../textures/store.ts';
import { LOAD_TIMEOUT_MS, withTimeout } from '../util/timeout.ts';
import { isPhone } from '../controls/viewport.ts';
import type { FilmState } from '../film/timeline.ts';
import { FOV, PAGE_H, PAGE_W, phoneCropWidth } from './dims.ts';
import { TABLE_CLEAR_COLOR, tableFadeAlpha, tablePlaneSize } from './tableMap.ts';

export { PAGE_W };
const TABLE_URL = '/scene/table.webp';
const TABLE_URL_PHONE = '/scene/table-2048.webp';

export type App = {
  /** Резолвится, когда загружен первый разворот (успешно или нет: ошибку сообщает onFail). */
  ready: Promise<void>;
  /** Поставить сцену по состоянию фильма; рисует только если оно изменилось. */
  applyFilm(state: FilmState): void;
  /** Начать загрузку кадров работы k (k-я работа с kind 'work'). */
  preloadWork(k: number): void;
  setLamp(nx: number, ny: number): void;
  dispose(): void;
};

export type AppOptions = { loadTimeoutMs?: number };

export function createApp(
  canvas: HTMLCanvasElement,
  onFail: (why: string) => void,
  options: AppOptions = {},
): App {
  const loadTimeoutMs = options.loadTimeoutMs ?? LOAD_TIMEOUT_MS;
  const spreads = site.spreads;

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true });
    renderer.setClearColor(TABLE_CLEAR_COLOR, 1);
  } catch {
    onFail('renderer');
    return { ready: Promise.resolve(), applyFilm() {}, preloadWork() {}, setLamp() {}, dispose() {} };
  }

  let disposed = false;
  let contextLost = false;
  let raf = 0;
  // Рисуем только когда что-то изменилось: иначе телефон зря греется в покое.
  let dirty = true;
  const textures = new Set<Texture>();
  const loader = new TextureLoader();
  // Зависший запрос не должен держать экран загрузки вечно: по таймауту отказ уходит в повтор и onFatal хранилища.
  const loadTexture = (url: string) =>
    withTimeout(
      new Promise<Texture>((resolve, reject) => {
        loader.load(
          url,
          (t) => {
            if (disposed) return t.dispose();
            t.colorSpace = SRGBColorSpace;
            t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
            textures.add(t);
            dirty = true;
            resolve(t);
          },
          undefined,
          reject,
        );
      }),
      loadTimeoutMs,
      `texture:${url}`,
    );

  function fail(why: string) {
    if (disposed) return;
    dispose();
    onFail(why);
  }

  const store = createTextureStore<Texture>({
    load: loadTexture,
    urlsForSpread: (s) => {
      const sp = spreads[s];
      return sp ? [sp.left, sp.right].filter((u): u is string => Boolean(u)) : [];
    },
    onFatal: (url) => fail(`texture:${url}`),
  });

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);

  let film: FilmState | undefined;
  const view = createBookView({
    progress: (sheet) => film?.sheets[sheet] ?? 0,
    spread: () => film?.spread ?? 0,
    sheets: buildSheets(spreads),
    pageW: PAGE_W,
    pageH: PAGE_H,
    getTexture: store.get,
  });
  scene.add(view.group);

  // Экран ролика: плоскость 6×4 точно над открытым разворотом, перед листами. Закрывает зазор у корешка
  // и боковые полосы согнутых листов, пока экран виден.
  const workSpreads = spreads.filter((s) => s.kind === 'work');
  const phoneFrames = isPhone(window.innerWidth);
  const screen = createScreen({
    scene,
    // На телефоне кадры — центральная вырезка разворота (phoneCropWidth × PAGE_H), плоскость в том же масштабе.
    width: phoneFrames ? phoneCropWidth() : 2 * PAGE_W,
    height: PAGE_H,
    phone: phoneFrames,
    loadTimeoutMs,
    anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
    requestRender: () => (dirty = true),
  });

  // Плоскость неподвижна в мире и посчитана той же функцией, что и карта изображения стола (assets/prompts/table.md).
  const tablePlane = tablePlaneSize(PAGE_W, PAGE_H, FOV);
  const tableGeometry = new PlaneGeometry(tablePlane.w, tablePlane.h);
  // Края стола растворяются в цвет очистки: в узком высоком окне плоскость может кончиться, но границы не видно.
  const FW = 256;
  const FH = 160;
  const fadeData = new Uint8Array(FW * FH * 4);
  for (let y = 0; y < FH; y++) {
    for (let x = 0; x < FW; x++) {
      const a = Math.round(255 * tableFadeAlpha(x / (FW - 1), y / (FH - 1)));
      fadeData.set([a, a, a, 255], (y * FW + x) * 4);
    }
  }
  const fadeMap = new DataTexture(fadeData, FW, FH, RGBAFormat);
  fadeMap.needsUpdate = true;
  const tableMaterial = new MeshStandardMaterial({ color: 0x14110e, roughness: 0.95, alphaMap: fadeMap, transparent: true });
  const table = new Mesh(tableGeometry, tableMaterial);
  table.position.z = -0.01;
  scene.add(table);
  // Стол — декорация: если не загрузился, остаётся тёмная плоскость.
  loadTexture(isPhone(window.innerWidth) ? TABLE_URL_PHONE : TABLE_URL)
    .then((map) => {
      if (disposed) return;
      tableMaterial.map = map;
      tableMaterial.color.set(0xffffff);
      tableMaterial.needsUpdate = true;
      dirty = true;
    })
    .catch(() => {});

  scene.add(new AmbientLight(0xffe6c4, 0.3));
  const lamp = new SpotLight(0xffddaa, 230, 0, 0.62, 0.9, 2);
  lamp.position.set(-1.5, 1.5, 9.5);
  scene.add(lamp, lamp.target);

  function resize() {
    // Размер canvas в CSS — это clientWidth/clientHeight: innerWidth включает классическую полосу прокрутки.
    const w = Math.max(1, document.documentElement.clientWidth);
    const h = Math.max(1, document.documentElement.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dirty = true;
  }

  resize();
  window.addEventListener('resize', resize);
  const onLost = () => {
    contextLost = true;
    fail('contextlost');
  };
  canvas.addEventListener('webglcontextlost', onLost);

  let lastSpread = -1;
  // Экран загрузки ждёт текстуры начального разворота и соседних (перезагрузка посреди фильма).
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((r) => (resolveReady = r));
  let readyStarted = false;
  const needed = (s: number) => [Math.max(0, s - 1), s].map((n) => store.ensure(Math.min(n, spreads.length - 1)));
  async function settleReady() {
    for (let s = lastSpread; ; s = lastSpread) {
      await Promise.all(needed(s)).catch(() => {});
      if (s === lastSpread || disposed) break; // позиция могла уехать, пока грузилось
    }
    resolveReady();
  }
  function frame() {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    if (!dirty || !film) return;
    dirty = false;
    view.update();
    camera.position.set(film.camera.x, film.camera.y, film.camera.h);
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  function dispose() {
    if (disposed) return;
    disposed = true;
    resolveReady();
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    canvas.removeEventListener('webglcontextlost', onLost);
    view.dispose();
    screen.dispose();
    tableGeometry.dispose();
    tableMaterial.dispose();
    fadeMap.dispose();
    textures.forEach((t) => t.dispose());
    textures.clear();
    renderer.dispose();
    if (!contextLost) renderer.forceContextLoss();
  }

  return {
    ready,
    applyFilm(state) {
      if (disposed) return;
      const prev = film;
      film = state;
      screen.show(state.work, state.work ? workSpreads[state.work.index]?.video : undefined);
      const same =
        prev !== undefined &&
        prev.camera.x === state.camera.x &&
        prev.camera.y === state.camera.y &&
        prev.camera.h === state.camera.h &&
        prev.sheets.length === state.sheets.length &&
        prev.sheets.every((p, i) => p === state.sheets[i]);
      if (!same) dirty = true;
      if (state.spread !== lastSpread) {
        lastSpread = state.spread;
        // Лист переворачивается ещё на предыдущем развороте: оборот нужен заранее.
        for (const p of needed(lastSpread)) void p;
        // Лист следующего разворота перевернётся ещё до того, как фильм дойдёт до него: просим его заранее.
        void store.ensure(Math.min(lastSpread + 1, spreads.length - 1));
        if (!readyStarted) {
          readyStarted = true;
          void settleReady();
        }
      }
    },
    preloadWork(k) {
      const video = workSpreads[k]?.video;
      if (!disposed && video) screen.preload(k, video);
    },
    setLamp(nx, ny) {
      lamp.position.set(-1.5 + nx * 3, 1.5 + ny * 3, 9.5);
      dirty = true;
    },
    dispose,
  };
}
