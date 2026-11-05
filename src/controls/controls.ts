export type Commands = {
  next(): void;
  prev(): void;
  beginDrag(d: 1 | -1): boolean;
  moveDrag(f: number): void;
  endDrag(v: number): void;
  /** Необязательно: касание без движения. Без неё правая половина — next, левая — prev. */
  tap?(side: 'left' | 'right'): void;
};

const DRAG_THRESHOLD = 8; // px: меньше — это клик
const WHEEL_THRESHOLD = 40;
const WHEEL_QUIET_MS = 200;
const VELOCITY_WINDOW_MS = 100;

type Sample = { t: number; f: number };
type Gesture = {
  id: number;
  touch: boolean;
  x0: number;
  y0: number;
  /** pending: ещё не жест; drag: идёт перетаскивание; ignored: жест отвергнут. */
  phase: 'pending' | 'drag' | 'ignored';
  dir: 1 | -1;
  samples: Sample[];
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function attachControls(
  el: HTMLElement,
  c: Commands,
  o: {
    now?: () => number;
    /** Ширина разворота на экране в px; по умолчанию ширина элемента. */
    spreadWidthPx?: () => number;
  } = {},
): () => void {
  const now = o.now ?? (() => performance.now());
  const prevTouchAction = el.style.touchAction;
  el.style.touchAction = 'none';

  // --- клавиатура ---
  const onKey = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      c.next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      c.prev();
    }
  };
  const doc = el.ownerDocument;
  doc.addEventListener('keydown', onKey);

  // --- колесо: один жест — один переворот ---
  let wheelAcc = 0;
  let wheelLast = -Infinity;
  let wheelLocked = false;
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const t = now();
    if (t - wheelLast > WHEEL_QUIET_MS) {
      wheelLocked = false;
      wheelAcc = 0;
    }
    wheelLast = t;
    if (wheelLocked) return;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!Number.isFinite(d)) return;
    wheelAcc += d;
    if (Math.abs(wheelAcc) < WHEEL_THRESHOLD) return;
    wheelLocked = true;
    if (wheelAcc > 0) c.next();
    else c.prev();
    wheelAcc = 0;
  };
  el.addEventListener('wheel', onWheel, { passive: false });

  // --- указатель ---
  let g: Gesture | null = null;
  const width = () => (o.spreadWidthPx ? o.spreadWidthPx() : el.getBoundingClientRect().width);

  const fractionOf = (gs: Gesture, x: number): number | null => {
    const w = width();
    if (!(w > 0)) return null;
    const f = clamp01(((x - gs.x0) * -gs.dir) / w);
    return Number.isFinite(f) ? f : null;
  };

  const velocity = (gs: Gesture): number => {
    const t = now();
    const recent = gs.samples.filter((s) => t - s.t <= VELOCITY_WINDOW_MS);
    const last = recent[recent.length - 1];
    const first = recent[0];
    if (!last || !first || t - last.t > VELOCITY_WINDOW_MS / 2) return 0;
    const dt = (last.t - first.t) / 1000;
    if (!(dt > 0)) return 0;
    const v = (last.f - first.f) / dt;
    return Number.isFinite(v) ? v : 0;
  };

  const finish = (v: 'measured' | 0) => {
    const gs = g;
    g = null;
    if (gs && gs.phase === 'drag') c.endDrag(v === 'measured' ? velocity(gs) : 0);
  };

  const onDown = (e: PointerEvent) => {
    if (g) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    g = {
      id: e.pointerId,
      touch: e.pointerType === 'touch',
      x0: e.clientX,
      y0: e.clientY,
      phase: 'pending',
      dir: 1,
      samples: [],
    };
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {
      /* указатель мог уже исчезнуть */
    }
  };

  const onMove = (e: PointerEvent) => {
    if (!g || e.pointerId !== g.id || g.phase === 'ignored') return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    if (g.phase === 'pending') {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if ((g.touch && Math.abs(dy) > Math.abs(dx)) || dx === 0 || !(width() > 0)) {
        g.phase = 'ignored'; // вертикальный скролл или нечем мерить долю
        return;
      }
      g.dir = dx < 0 ? 1 : -1;
      if (!c.beginDrag(g.dir)) {
        g.phase = 'ignored';
        return;
      }
      g.phase = 'drag';
    }
    const f = fractionOf(g, e.clientX);
    if (f === null) return;
    g.samples.push({ t: now(), f });
    if (g.samples.length > 16) g.samples.shift();
    c.moveDrag(f);
  };

  const onUp = (e: PointerEvent) => {
    if (!g || e.pointerId !== g.id) return;
    if (g.phase === 'pending') {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      g = null;
      if (rect.width > 0 && Number.isFinite(x)) {
        const side = x >= rect.width / 2 ? 'right' : 'left';
        if (c.tap) c.tap(side);
        else if (side === 'right') c.next();
        else c.prev();
      }
      return;
    }
    finish('measured');
  };

  const onAbort = (e: PointerEvent) => {
    if (!g || e.pointerId !== g.id) return;
    finish(0);
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onAbort);
  el.addEventListener('lostpointercapture', onAbort);

  return () => {
    finish(0);
    doc.removeEventListener('keydown', onKey);
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onAbort);
    el.removeEventListener('lostpointercapture', onAbort);
    el.style.touchAction = prevTouchAction;
  };
}
