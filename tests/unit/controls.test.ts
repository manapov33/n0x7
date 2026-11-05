// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachControls } from '../../src/controls/controls.ts';

let t = 0;
const now = () => t;
let el: HTMLElement;
let c: ReturnType<typeof mk>;
let detach: () => void;

function mk(begin = true) {
  return {
    next: vi.fn(),
    prev: vi.fn(),
    beginDrag: vi.fn(() => begin),
    moveDrag: vi.fn(),
    endDrag: vi.fn(),
  };
}

function setup(begin = true, width = 1000) {
  c = mk(begin);
  el = document.createElement('div');
  document.body.append(el);
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width, height: 800, right: width, bottom: 800, x: 0, y: 0 }) as DOMRect;
  el.setPointerCapture = vi.fn();
  detach = attachControls(el, c, { now });
}

function ptr(type: string, x: number, y: number, extra: Record<string, unknown> = {}) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y, ...extra });
  el.dispatchEvent(e);
}

function key(k: string) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
}

function wheel(dy: number) {
  const e = new Event('wheel', { bubbles: true, cancelable: true });
  Object.assign(e, { deltaY: dy, deltaX: 0 });
  el.dispatchEvent(e);
}

beforeEach(() => {
  t = 1000;
  setup();
});
afterEach(() => {
  detach();
  el.remove();
});

describe('клавиатура', () => {
  it('ArrowRight — next, ArrowLeft — prev', () => {
    key('ArrowRight');
    expect(c.next).toHaveBeenCalledTimes(1);
    key('ArrowLeft');
    expect(c.prev).toHaveBeenCalledTimes(1);
  });
  it('после отключения не реагирует', () => {
    detach();
    key('ArrowRight');
    expect(c.next).not.toHaveBeenCalled();
  });
});

describe('колесо', () => {
  it('инерция: 30 событий по 40 за 500 мс дают один next, после паузы 600 мс — второй', () => {
    for (let i = 0; i < 30; i++) {
      wheel(40);
      t += 500 / 30;
    }
    expect(c.next).toHaveBeenCalledTimes(1);
    t += 600;
    wheel(40);
    expect(c.next).toHaveBeenCalledTimes(2);
  });
  it('отрицательный deltaY — prev; мелкие события копятся до порога 40', () => {
    wheel(-20);
    expect(c.prev).not.toHaveBeenCalled();
    wheel(-20);
    expect(c.prev).toHaveBeenCalledTimes(1);
  });
});

describe('указатель', () => {
  it('клик без движения: правая половина — next, левая — prev', () => {
    ptr('pointerdown', 800, 400);
    ptr('pointerup', 800, 400);
    expect(c.next).toHaveBeenCalledTimes(1);
    ptr('pointerdown', 200, 400);
    ptr('pointerup', 200, 400);
    expect(c.prev).toHaveBeenCalledTimes(1);
    expect(c.beginDrag).not.toHaveBeenCalled();
  });

  it('движение на 7 px — ещё клик, не жест', () => {
    ptr('pointerdown', 800, 400);
    ptr('pointermove', 793, 400);
    ptr('pointerup', 793, 400);
    expect(c.beginDrag).not.toHaveBeenCalled();
    expect(c.next).toHaveBeenCalledTimes(1);
  });

  it('движение на 8 px влево — жест: beginDrag(1), клика нет', () => {
    ptr('pointerdown', 900, 400);
    ptr('pointermove', 892, 400);
    expect(c.beginDrag).toHaveBeenCalledWith(1);
    ptr('pointermove', 400, 400);
    expect(c.moveDrag).toHaveBeenLastCalledWith(0.5);
    t += 100;
    ptr('pointerup', 400, 400);
    expect(c.endDrag).toHaveBeenCalledTimes(1);
    expect(c.next).not.toHaveBeenCalled();
    expect(c.prev).not.toHaveBeenCalled();
  });

  it('движение вправо — beginDrag(-1), доля растёт вправо', () => {
    ptr('pointerdown', 100, 400);
    ptr('pointermove', 300, 400);
    expect(c.beginDrag).toHaveBeenCalledWith(-1);
    expect(c.moveDrag).toHaveBeenLastCalledWith(0.2);
  });

  it('скорость: по направлению переворота, конечная; остановился — 0', () => {
    ptr('pointerdown', 900, 400);
    for (let i = 1; i <= 5; i++) {
      t += 20;
      ptr('pointermove', 900 - i * 50, 400);
    }
    t += 10;
    ptr('pointerup', 650, 400);
    const v = c.endDrag.mock.calls[0]![0] as number;
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeCloseTo(2.5, 1); // 0.05 за 20 мс
  });

  it('скорость 0, если указатель стоял перед отпусканием', () => {
    ptr('pointerdown', 900, 400);
    t += 20;
    ptr('pointermove', 500, 400);
    t += 500;
    ptr('pointerup', 500, 400);
    expect(c.endDrag).toHaveBeenCalledWith(0);
  });

  it('скорость против направления — отрицательная', () => {
    ptr('pointerdown', 900, 400);
    t += 20;
    ptr('pointermove', 500, 400);
    t += 20;
    ptr('pointermove', 600, 400);
    t += 10;
    ptr('pointerup', 600, 400);
    expect(c.endDrag.mock.calls[0]![0]).toBeLessThan(0);
  });

  it.each(['pointercancel', 'lostpointercapture'])('%s вызывает endDrag(0) ровно один раз', (type) => {
    ptr('pointerdown', 900, 400);
    ptr('pointermove', 500, 400);
    ptr(type, 500, 400);
    ptr(type, 500, 400);
    ptr('pointerup', 500, 400);
    expect(c.endDrag).toHaveBeenCalledTimes(1);
    expect(c.endDrag).toHaveBeenCalledWith(0);
  });

  it('pointerup, затем lostpointercapture — endDrag один раз', () => {
    ptr('pointerdown', 900, 400);
    ptr('pointermove', 500, 400);
    ptr('pointerup', 500, 400);
    ptr('lostpointercapture', 500, 400);
    expect(c.endDrag).toHaveBeenCalledTimes(1);
  });

  it('отмена без жеста не вызывает endDrag и не листает', () => {
    ptr('pointerdown', 900, 400);
    ptr('pointercancel', 900, 400);
    expect(c.endDrag).not.toHaveBeenCalled();
    expect(c.next).not.toHaveBeenCalled();
  });

  it('телефон: вертикальное движение (dy > dx) не начинает переворот', () => {
    ptr('pointerdown', 500, 400, { pointerType: 'touch' });
    ptr('pointermove', 495, 450, { pointerType: 'touch' });
    ptr('pointermove', 300, 460, { pointerType: 'touch' });
    ptr('pointerup', 300, 460, { pointerType: 'touch' });
    expect(c.beginDrag).not.toHaveBeenCalled();
    expect(c.moveDrag).not.toHaveBeenCalled();
    expect(c.endDrag).not.toHaveBeenCalled();
    expect(c.next).not.toHaveBeenCalled();
  });

  it('мышь: вертикальность не мешает жесту', () => {
    ptr('pointerdown', 500, 400);
    ptr('pointermove', 495, 450);
    expect(c.beginDrag).toHaveBeenCalledWith(1);
  });

  it('beginDrag вернул false: ни moveDrag, ни endDrag, ни клика', () => {
    detach();
    el.remove();
    setup(false);
    ptr('pointerdown', 900, 400);
    ptr('pointermove', 500, 400);
    ptr('pointermove', 400, 400);
    ptr('pointerup', 400, 400);
    expect(c.beginDrag).toHaveBeenCalledTimes(1);
    expect(c.moveDrag).not.toHaveBeenCalled();
    expect(c.endDrag).not.toHaveBeenCalled();
    expect(c.next).not.toHaveBeenCalled();
  });

  it('ширина 0: нет нечисловых значений', () => {
    detach();
    el.remove();
    setup(true, 0);
    ptr('pointerdown', 900, 400);
    ptr('pointermove', 500, 400);
    ptr('pointerup', 500, 400);
    for (const call of [...c.moveDrag.mock.calls, ...c.endDrag.mock.calls]) {
      expect(Number.isFinite(call[0])).toBe(true);
    }
    expect(c.beginDrag.mock.calls.length === 0 || c.endDrag.mock.calls.length === 1).toBe(true);
  });

  it('другой указатель во время жеста игнорируется', () => {
    ptr('pointerdown', 900, 400);
    ptr('pointermove', 500, 400);
    ptr('pointerup', 100, 400, { pointerId: 2 });
    expect(c.endDrag).not.toHaveBeenCalled();
    ptr('pointerup', 500, 400);
    expect(c.endDrag).toHaveBeenCalledTimes(1);
  });

  it('отключение посреди жеста завершает его один раз', () => {
    ptr('pointerdown', 900, 400);
    ptr('pointermove', 500, 400);
    detach();
    expect(c.endDrag).toHaveBeenCalledTimes(1);
    expect(c.endDrag).toHaveBeenCalledWith(0);
  });

  it('touch-action: none на элементе', () => {
    expect(el.style.touchAction).toBe('none');
  });
});
