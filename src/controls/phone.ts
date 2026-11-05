import type { BookModel } from '../book/model.ts';
import type { Commands } from './controls.ts';

export const PHONE_MAX_WIDTH = 768;

export type Focus = 'cover' | 'left' | 'right';

/** Телефон — ширина экрана меньше 768 px. */
export const isPhone = (viewportWidth: number): boolean => viewportWidth < PHONE_MAX_WIDTH;

/**
 * Постраничная навигация телефона. Состояние выводится из модели:
 * разворот 0 — обложка; любое внешнее изменение разворота (goTo, перетаскивание листа)
 * ставит фокус на левую страницу нового разворота.
 */
export function createPhoneNavigator(m: BookModel): Pick<Commands, 'next' | 'prev'> & { focus(): Focus } {
  const last = m.sheetCount - 1;
  let seen = m.spread;
  let side: 'left' | 'right' = 'left';

  const sync = () => {
    if (m.spread !== seen) {
      seen = m.spread;
      side = 'left';
    }
  };
  /** Шаг модели на разворот; true, если разворот действительно сменился. */
  const step = (d: 1 | -1): boolean => {
    const before = m.spread;
    if (d === 1) m.next();
    else m.prev();
    if (m.spread === before) return false;
    seen = m.spread;
    return true;
  };

  return {
    focus() {
      sync();
      return m.spread === 0 ? 'cover' : side;
    },
    next() {
      sync();
      if (m.spread === 0) {
        if (step(1)) side = 'left';
      } else if (side === 'left') {
        side = 'right';
      } else if (m.spread < last && step(1)) {
        side = 'left';
      }
    },
    prev() {
      sync();
      if (m.spread === 0) return;
      if (side === 'right') {
        side = 'left';
      } else if (step(-1)) {
        side = 'right';
      }
    },
  };
}

/**
 * Команды для controls на телефоне. Перетаскивание листа — только с правой страницы (и с обложки);
 * жест вперёд с левой страницы и любой жест назад просто вызывают next/prev.
 */
export function createPhoneCommands(m: BookModel, nav: ReturnType<typeof createPhoneNavigator>): Commands {
  return {
    next: () => nav.next(),
    prev: () => nav.prev(),
    beginDrag(d) {
      if (d === -1) {
        nav.prev();
        return false;
      }
      if (nav.focus() === 'left') {
        nav.next();
        return false;
      }
      return m.beginDrag(1);
    },
    moveDrag: (f) => m.moveDrag(f),
    endDrag: (v) => m.endDrag(v),
  };
}

/** Куда смотрит камера: на десктопе разворот целиком, на телефоне — одна страница. */
export function cameraFor(
  viewportWidth: number,
  spread: number,
  focus: Focus,
  pageW: number,
): { x: number; target: 'spread' | 'page' } {
  if (spread === 0) return { x: 0, target: 'page' }; // закрытая обложка по центру
  if (!isPhone(viewportWidth)) return { x: 0, target: 'spread' };
  return { x: focus === 'right' ? pageW / 2 : -pageW / 2, target: 'page' };
}

/**
 * Знаменатель доли перетаскивания, px. Ширина разворота на телефоне шире экрана (разворот в кадр
 * не влезает), и палец не дотянулся бы до половины переворота, поэтому полный переворот —
 * не шире экрана.
 */
export function phoneDragWidthPx(viewportWidth: number, spreadPx: number, screenPx: number): number {
  return isPhone(viewportWidth) ? Math.min(spreadPx, screenPx) : spreadPx;
}
