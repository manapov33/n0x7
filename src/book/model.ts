export { buildSheets } from './sheets.ts';
export { sheetPoint, shadowOpacity } from './bend.ts';
export type { Sheet } from './sheets.ts';

export const TURN_SECONDS = 0.7;

export interface BookModel {
  readonly spread: number;
  readonly sheetCount: number;
  next(): void;
  prev(): void;
  goTo(spread: number): void;
  beginDrag(dir: 1 | -1): boolean;
  /** fraction: progress along the turn direction (0..1), for either direction. */
  moveDrag(fraction: number): void;
  /** velocity: sheet fractions per second, positive = further along the turn. */
  endDrag(velocity: number): void;
  update(dt: number): void;
  progress(sheet: number): number;
  isSettled(): boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function createBookModel(spreadCount: number): BookModel {
  const sheetCount = spreadCount;
  const last = spreadCount - 1;
  let spread = 0;
  const prog: number[] = Array.from({ length: sheetCount }, () => 0);
  let drag: { dir: 1 | -1; sheet: number; fraction: number } | null = null;

  const target = (sheet: number) => (sheet < spread ? 1 : 0);

  const goTo = (s: number) => {
    if (drag) return;
    spread = clamp(Math.round(s), 0, last);
  };

  return {
    get spread() {
      return spread;
    },
    sheetCount,
    next: () => goTo(spread + 1),
    prev: () => goTo(spread - 1),
    goTo,
    beginDrag(dir) {
      if (drag) return false;
      if (dir === 1 && spread >= last) return false;
      if (dir === -1 && spread <= 0) return false;
      drag = { dir, sheet: dir === 1 ? spread : spread - 1, fraction: 0 };
      prog[drag.sheet] = dir === 1 ? 0 : 1;
      return true;
    },
    moveDrag(fraction) {
      if (!drag) return;
      drag.fraction = clamp(fraction, 0, 1);
      prog[drag.sheet] = drag.dir === 1 ? drag.fraction : 1 - drag.fraction;
    },
    endDrag(velocity) {
      if (!drag) return;
      const commit = velocity > 0.5 || (drag.fraction > 0.5 && velocity >= -0.5);
      if (commit) spread += drag.dir;
      drag = null;
    },
    update(dt) {
      const step = dt / TURN_SECONDS;
      for (let i = 0; i < sheetCount; i++) {
        if (drag && i === drag.sheet) continue;
        const t = target(i);
        const cur = prog[i] ?? 0;
        const d = t - cur;
        prog[i] = Math.abs(d) <= step ? t : cur + Math.sign(d) * step;
      }
    },
    progress: (sheet) => prog[sheet] ?? 0,
    isSettled() {
      return !drag && prog.every((p, i) => p === target(i));
    },
  };
}
