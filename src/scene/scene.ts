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
import { buildSheets, createBookModel, type BookModel } from '../book/model.ts';
import { createBookView } from '../book/view.ts';
import { site } from '../content/site.ts';
import { createTextureStore } from '../textures/store.ts';
import { LOAD_TIMEOUT_MS, withTimeout } from '../util/timeout.ts';
import { isPhone } from '../controls/viewport.ts';
import { fitCamera } from './camera.ts';
import { TABLE_CLEAR_COLOR, tableFadeAlpha, tablePlaneSize } from './tableMap.ts';

export const PAGE_W = 3;
const PAGE_H = 4;
const FOV = 35;
const CAM_EPS = 5e-4; // ближе этого камера считается доехавшей
const TABLE_URL = '/scene/table.webp';
const TABLE_URL_PHONE = '/scene/table-2048.webp';

export type App = {
  model: BookModel;
  /** Резолвится, когда загружен первый разворот (успешно или нет: ошибку сообщает onFail). */
  ready: Promise<void>;
  setCameraTarget(x: number, target: 'spread' | 'page'): void;
  setLamp(nx: number, ny: number): void;
  /** Ширина разворота на экране в CSS px (по текущей камере). */
  spreadWidthPx(): number;
  dispose(): void;
};

export type AppHooks = { onSpread?(spread: number): void };
export type AppOptions = { loadTimeoutMs?: number };

export function createApp(
  canvas: HTMLCanvasElement,
  onFail: (why: string) => void,
  hooks: AppHooks = {},
  options: AppOptions = {},
): App {
  const loadTimeoutMs = options.loadTimeoutMs ?? LOAD_TIMEOUT_MS;
  const spreads = site.spreads;
  const model = createBookModel(spreads.length);

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true });
    renderer.setClearColor(TABLE_CLEAR_COLOR, 1);
  } catch {
    onFail('renderer');
    return { model, ready: Promise.resolve(), setCameraTarget() {}, setLamp() {}, spreadWidthPx: () => 0, dispose() {} };
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

  const view = createBookView({
    model,
    sheets: buildSheets(spreads),
    pageW: PAGE_W,
    pageH: PAGE_H,
    getTexture: store.get,
  });
  scene.add(view.group);

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

  // Камера
  let camTarget = { x: 0, kind: 'page' as 'spread' | 'page' };
  const cam = { x: 0, h: 10 };
  let camInit = false;
  let aspect = 1;
  const targetHeight = () => fitCamera(aspect, camTarget.kind, PAGE_W, PAGE_H, FOV);

  function resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    aspect = w / h;
    camera.aspect = aspect;
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
  let last = performance.now();
  function frame(now: number) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (model.spread !== lastSpread) {
      lastSpread = model.spread;
      hooks.onSpread?.(lastSpread);
      void store.ensure(Math.max(0, lastSpread - 1));
      void store.ensure(lastSpread);
    }
    const wasSettled = model.isSettled();
    model.update(dt);

    const hT = targetHeight();
    let moving = false;
    if (!camInit) {
      cam.x = camTarget.x;
      cam.h = hT;
      camInit = true;
      moving = true;
    } else if (Math.abs(camTarget.x - cam.x) > CAM_EPS || Math.abs(hT - cam.h) > CAM_EPS) {
      const k = 1 - Math.exp(-dt * 6);
      cam.x += (camTarget.x - cam.x) * k;
      cam.h += (hT - cam.h) * k;
      if (Math.abs(camTarget.x - cam.x) <= CAM_EPS && Math.abs(hT - cam.h) <= CAM_EPS) {
        cam.x = camTarget.x;
        cam.h = hT;
      }
      moving = true;
    }

    // Модель дорисовывается и в кадре, где она только что успокоилась.
    if (!dirty && wasSettled && model.isSettled() && !moving) return;
    dirty = false;
    view.update();
    camera.position.set(cam.x, 0, cam.h);
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    canvas.removeEventListener('webglcontextlost', onLost);
    view.dispose();
    tableGeometry.dispose();
    tableMaterial.dispose();
    fadeMap.dispose();
    textures.forEach((t) => t.dispose());
    textures.clear();
    renderer.dispose();
    if (!contextLost) renderer.forceContextLoss();
  }

  return {
    model,
    ready: store.ensure(0),
    setCameraTarget(x, target) {
      camTarget = { x, kind: target };
      dirty = true;
    },
    spreadWidthPx() {
      const pxPerUnit = canvas.clientHeight / 2 / (cam.h * Math.tan((FOV * Math.PI) / 360));
      return 2 * PAGE_W * pxPerUnit;
    },
    setLamp(nx, ny) {
      lamp.position.set(-1.5 + nx * 3, 1.5 + ny * 3, 9.5);
      dirty = true;
    },
    dispose,
  };
}
