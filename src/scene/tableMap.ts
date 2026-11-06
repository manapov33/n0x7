import { fitCamera } from './camera.ts';

export type Rect = { x: number; y: number; w: number; h: number };

/** Пропорция изображения стола (16:10, 3840x2400). */
export const TABLE_ASPECT = 16 / 10;

const ASPECTS = { '16:10': 16 / 10, '16:9': 16 / 9, '21:9': 21 / 9 } as const;
/** Узкий планшет (768x1024) и самая широкая сцена, которую мы закрываем. */
const DESKTOP_ASPECTS = [0.75, 16 / 10, 16 / 9, 21 / 9];
/** Телефоны от очень узких до почти квадратных; камера стоит над серединой страницы разворота. */
const PHONE_ASPECTS = [0.4, 0.46, 0.56];
const SAFETY = 1.03;

/** Сколько мировых единиц видно на плоскости стола при данной пропорции экрана. */
export function visibleWorldSize(
  aspect: number,
  target: 'spread' | 'page',
  pageW: number,
  pageH: number,
  fovDeg: number,
): { w: number; h: number } {
  const h = 2 * fitCamera(aspect, target, pageW, pageH, fovDeg) * Math.tan((fovDeg * Math.PI) / 360);
  return { w: h * aspect, h };
}

/** Плоскость стола 16:10, не показывающая края ни на десктопе до 21:9, ни на телефонах. */
export function tablePlaneSize(pageW: number, pageH: number, fovDeg: number): { w: number; h: number } {
  let needH = 0;
  for (const a of DESKTOP_ASPECTS) {
    const v = visibleWorldSize(a, 'spread', pageW, pageH, fovDeg);
    needH = Math.max(needH, v.h, v.w / TABLE_ASPECT);
  }
  for (const a of PHONE_ASPECTS) {
    const v = visibleWorldSize(a, 'page', pageW, pageH, fovDeg);
    // На телефоне камера стоит над левой или правой страницей: её середина на pageW/2 от центра.
    needH = Math.max(needH, v.h, (pageW + v.w) / TABLE_ASPECT);
  }
  const h = Math.ceil((needH * SAFETY) / 0.5) * 0.5;
  return { w: h * TABLE_ASPECT, h };
}

export type TableMap = {
  plane: { w: number; h: number };
  pxPerUnit: number;
  /** Скрыто под раскрытым журналом. */
  spread: Rect;
  /** Скрыто под закрытой обложкой. */
  cover: Rect;
  /** Видимая часть изображения на десктопе, когда журнал раскрыт. */
  frames: Record<'16:10' | '16:9' | '21:9', Rect>;
  /** Места для предметов: рядом с журналом, видны на 16:9, рамка кадра может их обрезать. */
  props: { cup: Rect; pen: Rect };
};

/** Карта изображения стола в пикселях. Сцена берёт размер плоскости отсюда же, поэтому расхождения быть не может. */
export function tableImageMap(pageW: number, pageH: number, fovDeg: number, imgW: number, imgH: number): TableMap {
  const plane = tablePlaneSize(pageW, pageH, fovDeg);
  const sx = imgW / plane.w;
  const sy = imgH / plane.h;
  const toRect = (wx0: number, wy0: number, w: number, h: number): Rect => ({
    x: Math.round((wx0 + plane.w / 2) * sx),
    y: Math.round((plane.h / 2 - (wy0 + h)) * sy),
    w: Math.round(w * sx),
    h: Math.round(h * sy),
  });
  const centred = (w: number, h: number) => toRect(-w / 2, -h / 2, w, h);
  const frame = (a: number) => {
    const v = visibleWorldSize(a, 'spread', pageW, pageH, fovDeg);
    return centred(v.w, v.h);
  };
  // Предметы заданы как доли изображения (на 3840x2400: чашка 820..1190 x 1180..1560, ручка 2680..2960 x 780..1500).
  const fx = (v: number) => Math.round(v * imgW);
  const fy = (v: number) => Math.round(v * imgH);
  return {
    plane,
    pxPerUnit: sx,
    spread: centred(2 * pageW, pageH),
    cover: centred(pageW, pageH),
    frames: { '16:10': frame(ASPECTS['16:10']), '16:9': frame(ASPECTS['16:9']), '21:9': frame(ASPECTS['21:9']) },
    props: {
      cup: { x: fx(820 / 3840), y: fy(1180 / 2400), w: fx(370 / 3840), h: fy(380 / 2400) },
      pen: { x: fx(2680 / 3840), y: fy(780 / 2400), w: fx(280 / 3840), h: fy(720 / 2400) },
    },
  };
}
