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
  const counter = document.createElement('div');
  counter.id = 'counter';
  counter.dataset.spread = '0';
  document.body.append(canvas, counter, loading);

  let app: { dispose(): void } | undefined;
  let detachControls: (() => void) | undefined;
  let failed = false;
  const fail = () => {
    if (failed) return;
    failed = true;
    root.removeAttribute('data-mode');
    detachControls?.();
    app?.dispose();
    canvas.remove();
    counter.remove();
    loading.remove();
  };

  try {
    const { createApp } = await import('./scene/scene.ts');
    if (failed) return;
    const created = createApp(canvas, fail, {
      onSpread: (s) => {
        counter.dataset.spread = String(s);
      },
    });
    app = created;
    if (failed) {
      created.dispose();
      return;
    }
    const { attachControls } = await import('./controls/controls.ts');
    if (failed) return;
    detachControls = attachControls(canvas, created.model);
    await created.ready;
    if (!failed) loading.remove();
  } catch {
    fail();
  }
}
