import { Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Texture, type Scene } from 'three';
import type { Spread } from '../content/types.ts';
import { createFrameSequence, frameIndex } from '../film/frames.ts';
import { withTimeout } from '../util/timeout.ts';

/** Сколько декодированных кадров держим у себя; остальными управляет браузер. */
const WINDOW = 10;
const AHEAD = 3;
// Выше листов (их z не больше ~0.02) и теней, чтобы закрыть зазор у корешка и боковые полосы согнутых листов.
const SCREEN_Z = 0.05;

type Video = NonNullable<Spread['video']>;
type Entry = { urls: string[]; index: Map<string, number>; seq: ReturnType<typeof createFrameSequence<string>> };

const pad = (i: number) => String(i).padStart(3, '0');

export type Screen = {
  /** Начать загрузку кадров работы (повторные вызовы безвредны). */
  preload(work: number, video: Video): void;
  /** Показать кадр по состоянию фильма; null — экран скрыт. */
  show(work: { index: number; frame: number; screen: number } | null, video: Video | undefined): void;
  dispose(): void;
};

export function createScreen(o: {
  scene: Scene;
  /** Размер плоскости: ровно разворот 2·PAGE_W × PAGE_H. */
  width: number;
  height: number;
  phone: boolean;
  loadTimeoutMs: number;
  anisotropy: number;
  requestRender(): void;
}): Screen {
  const geometry = new PlaneGeometry(o.width, o.height);
  // Тот же материал, что у страниц: освещение одинаково, поэтому первый кадр не отличается от страниц.
  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, transparent: true, opacity: 0 });
  const mesh = new Mesh(geometry, material);
  mesh.position.z = SCREEN_Z;
  mesh.renderOrder = 2;
  mesh.visible = false;
  o.scene.add(mesh);

  const entries = new Map<number, Entry>();
  const images = new Map<string, HTMLImageElement>(); // окно декодированных кадров
  const pending = new Set<string>();
  let texture: Texture | undefined;
  let shownUrl: string | undefined;
  let wantedUrl: string | undefined;
  let disposed = false;
  let lastIndex = 0;

  const decode = (url: string) =>
    withTimeout(
      (async () => {
        const img = new Image();
        img.src = url;
        await img.decode();
        return img;
      })(),
      o.loadTimeoutMs,
      `frame:${url}`,
    );

  function entry(work: number, video: Video): Entry {
    let e = entries.get(work);
    if (!e) {
      const count = o.phone ? video.phoneCount : video.count;
      const prefix = o.phone ? 'p' : 'd';
      const urls = Array.from({ length: count }, (_, i) => `${video.dir}/${prefix}-${pad(i)}.webp`);
      const index = new Map(urls.map((u, i) => [u, i]));
      // В последовательности остаётся только url: картинки не копим, браузер держит их сам.
      const seq = createFrameSequence<string>({
        urls,
        load: async (url) => {
          await decode(url);
          return url;
        },
        onReady: () => refresh(),
      });
      e = { urls, index, seq };
      entries.set(work, e);
    }
    return e;
  }

  function evict(centre: number, e: Entry) {
    if (images.size <= WINDOW) return;
    const far = [...images.keys()].sort(
      (a, b) => Math.abs((e.index.get(b) ?? 0) - centre) - Math.abs((e.index.get(a) ?? 0) - centre),
    );
    for (const url of far) {
      if (images.size <= WINDOW) break;
      if (url !== shownUrl && url !== wantedUrl) images.delete(url);
    }
  }

  function apply(img: HTMLImageElement, url: string) {
    if (disposed) return;
    if (!texture) {
      texture = new Texture(img);
      texture.colorSpace = SRGBColorSpace;
      texture.generateMipmaps = false;
      texture.minFilter = texture.magFilter = 1006; // LinearFilter
      texture.anisotropy = o.anisotropy;
      material.map = texture;
      material.needsUpdate = true;
    } else {
      texture.image = img;
    }
    texture.needsUpdate = true;
    shownUrl = url;
    o.requestRender();
  }

  let current: { work: number; entry: Entry } | undefined;
  let opacity = 0;

  function refresh() {
    if (disposed || !current) return;
    const { entry: e } = current;
    const url = e.seq.nearestReady(lastIndex);
    const root = document.documentElement;
    if (url === undefined) {
      wantedUrl = undefined;
      root.dataset.frameShown = '-1';
      setVisible();
      return;
    }
    wantedUrl = url;
    if (url !== shownUrl) {
      const have = images.get(url);
      if (have) apply(have, url);
      else
        void decode(url)
          .then((img) => {
            images.set(url, img);
            if (wantedUrl === url) apply(img, url);
            evict(lastIndex, e);
            refresh();
          })
          .catch(() => {});
    }
    root.dataset.frameShown = String(shownUrl !== undefined ? (e.index.get(shownUrl) ?? -1) : -1);
    // соседние кадры вперёд и назад заранее в окно
    const at = e.index.get(url) ?? 0;
    for (let k = -1; k <= AHEAD; k++) {
      const u = e.urls[at + k];
      if (u && k !== 0 && !images.has(u) && !pending.has(u) && e.seq.nearestReady(at + k) === u) {
        pending.add(u);
        void decode(u)
          .then((img) => images.set(u, img))
          .catch(() => {})
          .finally(() => pending.delete(u));
      }
    }
    setVisible();
  }

  function setVisible() {
    const show = opacity > 0 && texture !== undefined && shownUrl !== undefined;
    if (mesh.visible !== show) o.requestRender();
    mesh.visible = show;
  }

  return {
    preload(work, video) {
      entry(work, video).seq.preload();
    },
    show(work, video) {
      const root = document.documentElement;
      if (!work || !video) {
        current = undefined;
        delete root.dataset.frame;
        delete root.dataset.frameShown;
        if (opacity !== 0) {
          opacity = 0;
          material.opacity = 0;
          o.requestRender();
        }
        setVisible();
        return;
      }
      const e = entry(work.index, video);
      e.seq.preload();
      if (current?.work !== work.index) {
        shownUrl = wantedUrl = undefined; // другая работа: старый кадр не показываем
        lastIndex = -1;
      }
      current = { work: work.index, entry: e };
      const idx = frameIndex(work.frame, e.urls.length);
      root.dataset.frame = String(idx);
      if (opacity !== work.screen) {
        opacity = work.screen;
        material.opacity = opacity;
        o.requestRender();
      }
      // Текстуру обновляем только при смене кадра.
      if (idx !== lastIndex || shownUrl === undefined || wantedUrl === undefined) {
        lastIndex = idx;
        refresh();
      } else setVisible();
    },
    dispose() {
      disposed = true;
      o.scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      texture?.dispose();
      images.clear();
      entries.clear();
    },
  };
}
