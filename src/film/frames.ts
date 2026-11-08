/** Индекс кадра по доле сцены: t 0..1 → 0..count-1. */
export function frameIndex(t: number, count: number): number {
  if (count <= 1) return 0;
  const c = Math.min(1, Math.max(0, t));
  return Math.min(count - 1, Math.round(c * (count - 1)));
}

/** Кадры работы начинают грузиться, когда до её dive остаётся меньше одного экрана прокрутки. */
export function shouldPreload(progress: number, diveStart: number, screens: number): boolean {
  return progress >= diveStart - 1 / screens;
}

const DEFAULT_CONCURRENCY = 4;

export function createFrameSequence<T>(o: {
  urls: string[];
  load: (url: string) => Promise<T>;
  concurrency?: number;
  onReady?: (index: number) => void;
}): {
  preload(): void;
  /** Грузить в первую очередь кадры около i (от них наружу). */
  focus(i: number): void;
  nearestReady(i: number): T | undefined;
  readyCount(): number;
} {
  const ready = new Map<number, T>();
  const limit = o.concurrency ?? DEFAULT_CONCURRENCY;
  let started = false;
  let focusAt = 0;
  const queue = new Set<number>(o.urls.map((_, i) => i));

  // Следующим берём не принятый в работу кадр, ближайший к фокусу (при равенстве более ранний).
  function take(): number | undefined {
    let best: number | undefined;
    for (const i of queue) {
      if (best === undefined) best = i;
      else {
        const d = Math.abs(i - focusAt);
        const db = Math.abs(best - focusAt);
        if (d < db || (d === db && i < best)) best = i;
      }
    }
    if (best !== undefined) queue.delete(best);
    return best;
  }

  async function worker(): Promise<void> {
    for (let i = take(); i !== undefined; i = take()) {
      try {
        ready.set(i, await o.load(o.urls[i]!));
      } catch {
        try {
          ready.set(i, await o.load(o.urls[i]!)); // одна повторная попытка
        } catch {
          continue; // кадр пропущен: показывается ближайший готовый
        }
      }
      o.onReady?.(i);
    }
  }

  return {
    focus(i) {
      focusAt = i;
    },
    preload() {
      if (started) return;
      started = true;
      for (let k = 0; k < Math.min(limit, o.urls.length); k++) void worker();
    },
    nearestReady(i) {
      if (ready.size === 0) return undefined;
      for (let d = 0; d < o.urls.length; d++) {
        // при равном расстоянии берём более ранний кадр
        if (ready.has(i - d)) return ready.get(i - d);
        if (ready.has(i + d)) return ready.get(i + d);
      }
      return undefined;
    },
    readyCount: () => ready.size,
  };
}
