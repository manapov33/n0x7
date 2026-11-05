import { describe, expect, it, vi } from 'vitest';
import { createBookModel } from '../../src/book/model.ts';
import {
  cameraFor,
  createPhoneCommands,
  createPhoneNavigator,
  isPhone,
  phoneDragWidthPx,
} from '../../src/controls/phone.ts';

const mk = (n = 5) => {
  const m = createBookModel(n);
  return { m, n: createPhoneNavigator(m) };
};

describe('createPhoneNavigator', () => {
  it('идёт по страницам: обложка, левая, правая, следующий разворот', () => {
    const { m, n } = mk();
    expect(n.focus()).toBe('cover');
    n.next();
    expect(n.focus()).toBe('left');
    expect(m.spread).toBe(1);
    n.next();
    expect(n.focus()).toBe('right');
    expect(m.spread).toBe(1);
    n.next();
    expect(n.focus()).toBe('left');
    expect(m.spread).toBe(2);
    n.prev();
    expect(n.focus()).toBe('right');
    expect(m.spread).toBe(1);
  });

  it('на последней правой странице next ничего не меняет', () => {
    const { m, n } = mk();
    for (let i = 0; i < 20; i++) n.next();
    expect(m.spread).toBe(4);
    expect(n.focus()).toBe('right');
    n.next();
    expect(m.spread).toBe(4);
    expect(n.focus()).toBe('right');
  });

  it('с левой страницы разворота 1 prev возвращает на обложку; на обложке prev ничего не делает', () => {
    const { m, n } = mk();
    n.next();
    n.prev();
    expect(m.spread).toBe(0);
    expect(n.focus()).toBe('cover');
    n.prev();
    expect(m.spread).toBe(0);
    expect(n.focus()).toBe('cover');
  });

  it('prev с правой страницы переходит на левую того же разворота', () => {
    const { m, n } = mk();
    n.next();
    n.next();
    n.prev();
    expect(n.focus()).toBe('left');
    expect(m.spread).toBe(1);
  });

  it('внешний goTo: фокус становится left, на развороте 0 — cover', () => {
    const { m, n } = mk();
    n.next();
    n.next(); // разворот 1, правая
    m.goTo(4);
    expect(n.focus()).toBe('left');
    n.next();
    expect(n.focus()).toBe('right');
    m.goTo(0);
    expect(n.focus()).toBe('cover');
    m.goTo(2);
    expect(n.focus()).toBe('left');
  });

  it('перетаскивание листа с правой страницы даёт фокус left нового разворота', () => {
    const { m, n } = mk();
    n.next();
    n.next();
    expect(m.beginDrag(1)).toBe(true);
    m.moveDrag(0.9);
    m.endDrag(0);
    expect(m.spread).toBe(2);
    expect(n.focus()).toBe('left');
  });

  it('во время перетаскивания next/prev не сбивают фокус', () => {
    const { m, n } = mk();
    n.next();
    n.next();
    m.beginDrag(1);
    n.next();
    expect(n.focus()).toBe('right');
    m.endDrag(0);
  });
});

describe('createPhoneCommands', () => {
  it('жест вперёд с правой страницы тянет лист', () => {
    const { m, n } = mk();
    n.next();
    n.next();
    const c = createPhoneCommands(m, n);
    expect(c.beginDrag(1)).toBe(true);
    c.moveDrag(0.8);
    c.endDrag(0);
    expect(m.spread).toBe(2);
  });

  it('жест вперёд с левой страницы просто вызывает next и не тянет лист', () => {
    const { m, n } = mk();
    n.next();
    const c = createPhoneCommands(m, n);
    expect(c.beginDrag(1)).toBe(false);
    expect(n.focus()).toBe('right');
    expect(m.spread).toBe(1);
    m.update(5);
    expect(m.isSettled()).toBe(true);
  });

  it('жест вперёд с обложки тянет лист', () => {
    const { m, n } = mk();
    expect(createPhoneCommands(m, n).beginDrag(1)).toBe(true);
  });

  it('жест назад идёт через prev и лист не тянет', () => {
    const { m, n } = mk();
    n.next();
    n.next();
    const c = createPhoneCommands(m, n);
    expect(c.beginDrag(-1)).toBe(false);
    expect(n.focus()).toBe('left');
    expect(c.beginDrag(-1)).toBe(false);
    expect(m.spread).toBe(0);
  });

  it('на последней правой странице жест вперёд — пустая операция', () => {
    const { m, n } = mk();
    for (let i = 0; i < 20; i++) n.next();
    const c = createPhoneCommands(m, n);
    expect(c.beginDrag(1)).toBe(false);
    expect(m.spread).toBe(4);
    expect(n.focus()).toBe('right');
  });

  it('next и prev идут через навигатор', () => {
    const { m, n } = mk();
    const c = createPhoneCommands(m, n);
    const spy = vi.spyOn(n, 'next');
    c.next();
    expect(spy).toHaveBeenCalled();
    c.prev();
    expect(m.spread).toBe(0);
  });
});

describe('isPhone', () => {
  it('телефон — ширина меньше 768', () => {
    expect(isPhone(767)).toBe(true);
    expect(isPhone(768)).toBe(false);
  });
});

describe('cameraFor', () => {
  it('десктоп: обложка по центру с целью page, открытый разворот — spread в x=0', () => {
    expect(cameraFor(1440, 0, 'cover', 3)).toEqual({ x: 0, target: 'page' });
    expect(cameraFor(1440, 2, 'left', 3)).toEqual({ x: 0, target: 'spread' });
    expect(cameraFor(1440, 2, 'right', 3)).toEqual({ x: 0, target: 'spread' });
  });
  it('телефон: обложка по центру, страницы со смещением ±pageW/2', () => {
    expect(cameraFor(390, 0, 'cover', 3)).toEqual({ x: 0, target: 'page' });
    expect(cameraFor(390, 2, 'left', 3)).toEqual({ x: -1.5, target: 'page' });
    expect(cameraFor(390, 2, 'right', 3)).toEqual({ x: 1.5, target: 'page' });
  });
});

describe('phoneDragWidthPx', () => {
  it('на телефоне полный переворот — не шире экрана; на десктопе — ширина разворота', () => {
    expect(phoneDragWidthPx(390, 672, 390)).toBe(390);
    expect(phoneDragWidthPx(1440, 1164, 1440)).toBe(1164);
    expect(phoneDragWidthPx(700, 1164, 700)).toBe(700);
    expect(phoneDragWidthPx(390, 0, 390)).toBe(0);
  });
});
