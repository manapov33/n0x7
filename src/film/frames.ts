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
  nearestReady(i: number): T | undefined;
  readyCount(): number;
} {
  const ready = new Map<number, T>();
  const limit = o.concurrency ?? DEFAULT_CONCURRENCY;
  let started = false;
  let next = 0;

  async function worker(): Promise<void> {
    while (next < o.urls.length) {
      const i = next++;
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
