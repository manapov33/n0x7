// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachKeys, createScroll, smoothToward } from '../../src/film/scroll.ts';
import { createRail } from '../../src/film/rail.ts';
import { buildScenes } from '../../src/film/scenes.ts';
import { sceneStart, totalScreens } from '../../src/film/timeline.ts';

type FakeWin = Window & { scrollY: number; innerWidth: number; innerHeight: number };
function fakeWin(w: number, h: number): FakeWin {
  const win = Object.assign(new EventTarget(), {
    innerWidth: w,
    innerHeight: h,
    scrollY: 0,
    scrollTo(o: ScrollToOptions) {
      win.scrollY = o.top ?? 0;
    },
  });
  return win as unknown as FakeWin;
}

describe('smoothToward', () => {
  it('за период полураспада проходит половину пути', () => {
    expect(smoothToward(0, 1, 0.12)).toBeCloseTo(0.5, 2);
  });
  it('за большое время доходит до цели', () => {
    expect(smoothToward(0, 1, 10)).toBeCloseTo(1, 5);
  });
  it('dt = 0 ничего не меняет', () => {
    expect(smoothToward(0.3, 1, 0)).toBe(0.3);
  });
});

describe('createScroll', () => {
  const setup = (w = 390, h = 844, screens = 10) => {
    const win = fakeWin(w, h);
    const spacer = document.createElement('div');
    const onProgress = vi.fn();
    const onWake = vi.fn();
    const s = createScroll({ win, spacer, screens, onProgress, onWake });
    return { win, spacer, s, onProgress, onWake };
  };

  it('высота спейсера = экраны × высота окна', () => {
    const { spacer } = setup();
    expect(spacer.style.height).toBe('8440px');
  });

  it('изменение innerHeight без смены ширины не меняет высоту спейсера', () => {
    const { win, spacer, s } = setup();
    win.scrollY = 3000;
    win.dispatchEvent(new Event('scroll'));
    win.innerHeight = 784; // адресная строка показалась
    win.dispatchEvent(new Event('resize'));
    expect(spacer.style.height).toBe('8440px');
    expect(win.scrollY).toBe(3000); // позиция не тронута
    expect(s.target()).toBeCloseTo(3000 / (9 * 844), 6);
  });

  afterEach(() => vi.useRealTimers());

  it('рост высоты во время прокрутки не вызывает scrollTo до покоя', () => {
    vi.useFakeTimers();
    const { win, spacer, s } = setup();
    const spy = vi.spyOn(win, 'scrollTo');
    win.scrollY = 3000;
    win.dispatchEvent(new Event('scroll'));
    win.innerHeight = 904;
    win.dispatchEvent(new Event('resize'));
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(100); // жест продолжается
      win.scrollY += 40;
      win.dispatchEvent(new Event('scroll'));
    }
    expect(spy).not.toHaveBeenCalled();
    expect(spacer.style.height).toBe('8440px');
    vi.advanceTimersByTime(300); // покой
    expect(spacer.style.height).toBe('9040px');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(s.target()).toBeGreaterThan(0);
  });

  it('scrollTo без поддержки behavior: запасной вызов', () => {
    const { win, s } = setup();
    const calls: unknown[][] = [];
    win.scrollTo = ((...a: unknown[]) => {
      calls.push(a);
      if (typeof a[0] === 'object') throw new TypeError('behavior');
      win.scrollY = a[1] as number;
    }) as never;
    s.jumpTo(0.5);
    expect(calls[1]).toEqual([0, Math.ceil(0.5 * 9 * 844)]);
  });

  it('окно стало выше: спейсер удлиняется, прогресс сохраняется', () => {
    vi.useFakeTimers();
    const { win, spacer, s } = setup();
    win.scrollY = 3000;
    win.dispatchEvent(new Event('scroll'));
    const p = s.target();
    win.innerHeight = 904;
    win.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(300);
    expect(spacer.style.height).toBe('9040px');
    expect(s.target()).toBeCloseTo(p, 6);
    expect(Math.abs(win.scrollY / (9 * 904) - p)).toBeLessThan(0.001);
  });

  it('смена ширины пересчитывает высоту экрана', () => {
    const { win, spacer } = setup();
    win.innerWidth = 844;
    win.innerHeight = 390;
    win.dispatchEvent(new Event('resize'));
    expect(spacer.style.height).toBe('3900px');
  });

  it('tick сглаживает и возвращает false после схождения', () => {
    const { s, onProgress } = setup();
    s.jumpTo(1);
    let n = 0;
    while (s.tick(1 / 60) && n++ < 1000);
    expect(n).toBeLessThan(1000);
    expect(s.progress()).toBe(1);
    expect(onProgress).toHaveBeenLastCalledWith(1);
    expect(s.tick(1 / 60)).toBe(false);
  });

  it('прыжок к точке попадает ровно в неё несмотря на округление scrollY', () => {
    const { win, s } = setup();
    s.jumpTo(0.3437);
    win.dispatchEvent(new Event('scroll'));
    expect(s.target()).toBe(0.3437);
  });
});

describe('attachKeys', () => {
  const scenes = buildScenes(3);
  const starts = scenes.map((_, i) => sceneStart(scenes, i));
  const setup = () => {
    const win = fakeWin(1440, 900);
    const spacer = document.createElement('div');
    const s = createScroll({ win, spacer, screens: totalScreens(scenes), onProgress() {} });
    const off = attachKeys(document, { starts, target: s.target, jumpTo: s.jumpTo });
    return { s, off };
  };
  afterEach(() => (document.body.innerHTML = ''));
  const press = (key: string, init: KeyboardEventInit = {}, el: Element | Document = document) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    (el instanceof Document ? el.body : el).dispatchEvent(e);
    return e;
  };

  it('ArrowDown переводит цель к началу следующей сцены', () => {
    const { s, off } = setup();
    expect(press('ArrowDown').defaultPrevented).toBe(true);
    expect(s.target()).toBeCloseTo(starts[1]!, 9);
    press('PageDown');
    expect(s.target()).toBeCloseTo(starts[2]!, 9);
    press('ArrowUp');
    expect(s.target()).toBeCloseTo(starts[1]!, 9);
    off();
  });

  it('Space вперёд, Shift+Space назад, с preventDefault', () => {
    const { s, off } = setup();
    expect(press(' ').defaultPrevented).toBe(true);
    expect(s.target()).toBeCloseTo(starts[1]!, 9);
    press(' ', { shiftKey: true });
    expect(s.target()).toBeCloseTo(starts[0]!, 9);
    off();
  });

  it('в середине сцены назад ведёт к её началу', () => {
    const { s, off } = setup();
    s.jumpTo((starts[2]! + starts[3]!) / 2);
    press('ArrowUp');
    expect(s.target()).toBeCloseTo(starts[2]!, 9);
    off();
  });

  it('в поле ввода и панели контактов клавиши не перехватываются', () => {
    const { s, off } = setup();
    const input = document.createElement('input');
    const panel = document.createElement('section');
    panel.id = 'contact-panel';
    const link = document.createElement('a');
    panel.append(link);
    document.body.append(input, panel);
    expect(press('ArrowDown', {}, input).defaultPrevented).toBe(false);
    expect(press(' ', {}, link).defaultPrevented).toBe(false);
    expect(s.target()).toBe(0);
    off();
  });

  it('при открытой панели клавиши не листают фильм, даже с фокусом на body', () => {
    const { s, off } = setup();
    const panel = document.createElement('section');
    panel.id = 'contact-panel';
    document.body.append(panel);
    expect(press('ArrowDown').defaultPrevented).toBe(false);
    expect(s.target()).toBe(0);
    panel.hidden = true;
    expect(press('ArrowDown').defaultPrevented).toBe(true);
    panel.remove();
    off();
  });

  it('Space на кнопке не перехватывается (кнопка срабатывает сама)', () => {
    const { s, off } = setup();
    const b = document.createElement('button');
    document.body.append(b);
    expect(press(' ', {}, b).defaultPrevented).toBe(false);
    expect(s.target()).toBe(0);
    off();
  });

  it('с модификаторами и в конце фильма не мешает браузеру', () => {
    const { s, off } = setup();
    expect(press('ArrowDown', { ctrlKey: true }).defaultPrevented).toBe(false);
    s.jumpTo(1);
    expect(press('ArrowDown').defaultPrevented).toBe(false);
    off();
  });
});

describe('createRail', () => {
  const marks = [
    { label: 'Лилея', progress: 0.3 },
    { label: 'Контакты', progress: 0.9 },
  ];
  it('кнопки с подписями, клик вызывает onJump, активная помечена', () => {
    const root = document.createElement('div');
    const onJump = vi.fn();
    const rail = createRail(root, marks, onJump);
    const buttons = [...root.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Лилея', 'Контакты']);
    buttons[0]!.click();
    expect(onJump).toHaveBeenCalledWith(0.3);
    rail.update(0.5);
    expect(buttons[0]!.getAttribute('aria-current')).toBe('true');
    expect(buttons[1]!.hasAttribute('aria-current')).toBe(false);
    rail.update(0.95);
    expect(buttons[1]!.getAttribute('aria-current')).toBe('true');
    rail.destroy();
    expect(root.children.length).toBe(0);
  });
});
