import { site } from './content/site.ts';
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

  const canvas = document.createElement('canvas');
  canvas.id = 'scene';
  const loading = document.createElement('div');
  loading.id = 'loading';
  loading.innerHTML = '<span class="loading-logo">N0X7</span><span class="loading-bar"></span>';
  document.body.append(canvas, loading);
  const ui = createUi(document.body, site);

  let app: { dispose(): void } | undefined;
  let detachControls: (() => void) | undefined;
  let detachLamp: (() => void) | undefined;
  let failed = false;
  const fail = () => {
    if (failed) return;
    failed = true;
    root.removeAttribute('data-mode');
    detachControls?.();
    detachLamp?.();
    app?.dispose();
    ui.destroy();
    canvas.remove();
    loading.remove();
  };

  try {
    const { createApp, PAGE_W } = await load(import('./scene/scene.ts'), 'scene');
    if (failed) return;
    const { cameraFor, createPhoneCommands, createPhoneNavigator, isPhone, phoneDragWidthPx } = await load(
      import('./controls/phone.ts'),
      'phone',
    );
    if (failed) return;
    let syncCamera = () => {};
    const created = createApp(canvas, fail, {
      onSpread: () => {
        ui.update();
        syncCamera();
      },
    });
    app = created;
    if (failed) {
      created.dispose();
      return;
    }
    ui.setModel(created.model);
    detachLamp = attachLamp(window, (nx, ny) => created.setLamp(nx, ny), matchMedia('(hover: hover)').matches);
    const { attachControls } = await load(import('./controls/controls.ts'), 'controls');
    if (failed) return;

    const model = created.model;
    const nav = createPhoneNavigator(model);
    const phoneCommands = createPhoneCommands(model, nav);
    syncCamera = () => {
      const c = cameraFor(window.innerWidth, model.spread, nav.focus(), PAGE_W);
      created.setCameraTarget(c.x, c.target);
    };
    syncCamera();
    window.addEventListener('resize', syncCamera);
    window.addEventListener('orientationchange', syncCamera);
    const after =
      <A extends unknown[]>(f: (...a: A) => void) =>
      (...a: A) => {
        f(...a);
        syncCamera();
      };
    // На десктопе команды идут прямо в модель, на телефоне — через постраничный навигатор.
    const pick = () => (isPhone(window.innerWidth) ? phoneCommands : model);
    const detachCamera = () => {
      window.removeEventListener('resize', syncCamera);
      window.removeEventListener('orientationchange', syncCamera);
    };
    const detachInput = attachControls(
      canvas,
      {
        next: after(() => pick().next()),
        prev: after(() => pick().prev()),
        // Закрытая обложка стоит по центру: левая её половина тоже открывает журнал.
        tap: after((side: 'left' | 'right') => {
          if (ui.dismissOutside()) return; // тап мимо открытой панели только закрывает её
          if (model.spread === 0 || side === 'right') pick().next();
          else pick().prev();
        }),
        beginDrag: (d) => {
          const ok = pick().beginDrag(d);
          syncCamera();
          return ok;
        },
        moveDrag: (f) => pick().moveDrag(f),
        endDrag: after((v: number) => pick().endDrag(v)),
      },
      { spreadWidthPx: () => phoneDragWidthPx(window.innerWidth, created.spreadWidthPx(), canvas.clientWidth) },
    );
    detachControls = () => {
      detachInput();
      detachCamera();
    };
    await created.ready;
    if (!failed) loading.remove();
  } catch {
    fail();
  }
}
