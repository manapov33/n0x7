const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Остаток прогресса, при котором сглаживание считается завершённым. */
const SNAP = 5e-4;
/** Тишина после последнего scroll/resize, после которой можно менять длину фильма. */
const IDLE_MS = 200;

/** Длительность прыжка (метка рейки, клавиши), секунды. */
export const JUMP_SECONDS = 0.9;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Экспоненциальное приближение: за halfLife секунд остаток уменьшается вдвое. */
export function smoothToward(current: number, target: number, dt: number, halfLife = 0.12): number {
  if (dt <= 0) return current;
  return current + (target - current) * (1 - Math.pow(0.5, dt / halfLife));
}

export type Scroll = {
  /** Сглаженный прогресс, который видит сцена. */
  progress(): number;
  /** Цель сглаживания (где остановится прогресс). */
  target(): number;
  jumpTo(p: number): void;
  /** Идёт прыжок с фиксированной длительностью (не нативная прокрутка). */
  jumping(): boolean;
  /** Шаг сглаживания; true, пока прогресс не дошёл до цели. */
  tick(dt: number): boolean;
  destroy(): void;
};

export function createScroll(o: {
  win: Window;
  spacer: HTMLElement;
  screens: number;
  onProgress(p: number): void;
  /** Нужен кадр: цель сдвинулась (прокрутка, прыжок, смена размера). */
  onWake?(): void;
}): Scroll {
  const { win, spacer } = o;
  // Высота экрана для длины фильма: защёлка. Меняется при смене ширины/ориентации
  // и растёт, если окно стало выше; адресная строка телефона её не укорачивает.
  let width = win.innerWidth;
  let landscape = win.innerWidth > win.innerHeight;
  let stableH = win.innerHeight;
  const span = () => Math.max(1, (o.screens - 1) * stableH);
  const layout = () => {
    spacer.style.height = `${o.screens * stableH}px`;
  };
  const fromScroll = () => clamp01(win.scrollY / span());
  const scrollToProgress = (p: number) => {
    const top = Math.ceil(p * span());
    try {
      win.scrollTo({ top, left: 0, behavior: 'instant' });
    } catch {
      win.scrollTo(0, top); // старый Safari не знает behavior: 'instant'
    }
    return top;
  };

  layout();
  let target = fromScroll();
  let current = target;
  // Прыжок: целевой прогресс известен точно, а scrollY округляется до пикселя.
  let jump: { top: number; p: number } | null = null;
  // Анимация прыжка: прогресс идёт от точки старта к цели за JUMP_SECONDS по ease-in-out.
  let tween: { from: number; to: number; t: number } | null = null;
  o.onProgress(current);

  // Рост высоты (адресная строка спряталась) применяется только в покое: scrollTo посреди жеста обрывает инерцию.
  let growTimer: ReturnType<typeof setTimeout> | undefined;
  const applyGrowth = () => {
    growTimer = undefined;
    const h = win.innerHeight;
    if (h <= stableH) return;
    stableH = h;
    layout();
    if (Math.abs(win.scrollY - target * span()) > 2) {
      jump = null;
      scrollToProgress(target);
    }
  };
  const armGrowth = () => {
    if (growTimer === undefined) return;
    clearTimeout(growTimer);
    growTimer = setTimeout(applyGrowth, IDLE_MS);
  };
  const onScroll = () => {
    armGrowth();
    if (jump && Math.abs(win.scrollY - jump.top) < 1.5) target = jump.p;
    else {
      jump = null;
      tween = null; // пользователь взял прокрутку сам
      target = fromScroll();
    }
    o.onWake?.();
  };
  const onResize = () => {
    const w = win.innerWidth;
    const h = win.innerHeight;
    const land = w > h;
    if (w !== width || land !== landscape) {
      // Настоящая смена раскладки: новая высота экрана, прогресс держим.
      width = w;
      landscape = land;
      if (growTimer !== undefined) clearTimeout(growTimer);
      growTimer = undefined;
      stableH = h;
      layout();
      jump = null;
      scrollToProgress(target);
    } else if (h > stableH) {
      if (growTimer !== undefined) clearTimeout(growTimer);
      growTimer = setTimeout(applyGrowth, IDLE_MS);
    }
    // Остальное (адресная строка показалась, высота стала меньше): ничего не пересчитываем.
    o.onWake?.();
  };
  win.addEventListener('scroll', onScroll, { passive: true });
  win.addEventListener('resize', onResize);
  win.addEventListener('orientationchange', onResize);

  return {
    progress: () => current,
    target: () => target,
    jumpTo(p) {
      target = clamp01(p);
      jump = { top: scrollToProgress(target), p: target };
      tween = current === target ? null : { from: current, to: target, t: 0 };
      o.onWake?.();
    },
    jumping: () => tween !== null,
    tick(dt) {
      if (current === target) {
        tween = null;
        return false;
      }
      let next: number;
      if (tween) {
        tween.t += Math.max(0, dt);
        const k = Math.min(1, tween.t / JUMP_SECONDS);
        next = k >= 1 ? tween.to : tween.from + (tween.to - tween.from) * easeInOut(k);
        if (k >= 1) tween = null;
      } else {
        next = smoothToward(current, target, dt);
        if (Math.abs(target - next) < SNAP) next = target;
      }
      current = next;
      o.onProgress(current);
      return current !== target;
    },
    destroy() {
      if (growTimer !== undefined) clearTimeout(growTimer);
      win.removeEventListener('scroll', onScroll);
      win.removeEventListener('resize', onResize);
      win.removeEventListener('orientationchange', onResize);
    },
  };
}

const TEXT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'OPTION']);
const ACTIVATES_ON_SPACE = new Set(['BUTTON', 'A', 'SUMMARY']);

function ignoresKeys(t: EventTarget | null, space: boolean): boolean {
  if (!(t instanceof Element)) return false;
  if (TEXT_TAGS.has(t.tagName) || (t as HTMLElement).isContentEditable) return true;
  if (t.closest('#contact-panel, [role="dialog"]')) return true;
  return space && ACTIVATES_ON_SPACE.has(t.tagName);
}

/** Клавиши: вперёд/назад к началу сцены. starts — прогресс начала каждой сцены по возрастанию. */
export function attachKeys(
  doc: Document,
  o: { starts: number[]; target(): number; jumpTo(p: number): void },
): () => void {
  const EPS = 1e-6;
  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const space = e.key === ' ' || e.code === 'Space';
    let dir = 0;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') dir = 1;
    else if (e.key === 'ArrowUp' || e.key === 'PageUp') dir = -1;
    else if (space) dir = e.shiftKey ? -1 : 1;
    if (dir === 0) return;
    if (e.shiftKey && !space) return;
    if (ignoresKeys(e.target, space)) return;
    const panel = doc.getElementById('contact-panel');
    if (panel && !panel.hidden) return; // открытая панель: фильм не листаем, даже если фокус на body
    const t = o.target();
    const next =
      dir > 0 ? o.starts.find((s) => s > t + EPS) : [...o.starts].reverse().find((s) => s < t - EPS);
    if (next === undefined) return; // край фильма: пусть браузер решает сам
    e.preventDefault();
    o.jumpTo(next);
  };
  doc.addEventListener('keydown', onKey);
  return () => doc.removeEventListener('keydown', onKey);
}
