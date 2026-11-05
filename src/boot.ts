import { site } from './content/site.ts';
import { attachLamp, createUi } from './ui/ui.ts';

export type Env = { webgl: boolean; reducedMotion: boolean };

export function chooseMode(e: Env): 'book' | 'fallback' {
  return e.webgl && !e.reducedMotion ? 'book' : 'fallback';
}

function detectEnv(): Env {
  let webgl = false;
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') ?? probe.getContext('webgl');
    webgl = gl !== null;
    (gl as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webgl = false;
  }
  return { webgl, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
}

export async function boot(): Promise<void> {
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
    const { createApp } = await import('./scene/scene.ts');
    if (failed) return;
    const created = createApp(canvas, fail, {
      onSpread: () => {
        ui.update();
      },
    });
    app = created;
    if (failed) {
      created.dispose();
      return;
    }
    ui.setModel(created.model);
    detachLamp = attachLamp(window, (nx, ny) => created.setLamp(nx, ny), matchMedia('(hover: hover)').matches);
    const { attachControls } = await import('./controls/controls.ts');
    if (failed) return;
    detachControls = attachControls(canvas, created.model, {
      spreadWidthPx: () => created.spreadWidthPx(),
    });
    await created.ready;
    if (!failed) loading.remove();
  } catch {
    fail();
  }
}
