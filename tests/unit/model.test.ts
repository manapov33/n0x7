import { describe, expect, it } from 'vitest';
import { createBookModel } from '../../src/book/model.ts';

describe('navigation', () => {
  it('clamps at the bounds under repeated commands', () => {
    const m = createBookModel(5);
    m.prev();
    expect(m.spread).toBe(0);
    for (let i = 0; i < 20; i++) m.next();
    expect(m.spread).toBe(4);
    m.update(10);
    expect(m.isSettled()).toBe(true);
    expect(m.progress(3)).toBe(1);
    expect(m.progress(4)).toBe(0);
  });
  it('goTo flips sheets back', () => {
    const m = createBookModel(5);
    for (let i = 0; i < 4; i++) m.next();
    m.update(10);
    m.goTo(1);
    m.update(10);
    expect(m.progress(1)).toBe(0);
    expect(m.progress(0)).toBe(1);
    expect(m.spread).toBe(1);
  });
  it('goTo clamps out-of-range targets', () => {
    const m = createBookModel(5);
    m.goTo(99);
    expect(m.spread).toBe(4);
    m.goTo(-3);
    expect(m.spread).toBe(0);
  });
  it('moves several sheets at once at 1/TURN_SECONDS', () => {
    const m = createBookModel(5);
    m.goTo(3);
    m.update(0.35);
    expect(m.isSettled()).toBe(false);
    for (const i of [0, 1, 2]) expect(m.progress(i)).toBeCloseTo(0.5);
  });
});

describe('drag forward', () => {
  it('refuses to start from the cover backwards and a second gesture', () => {
    const d = createBookModel(5);
    expect(d.beginDrag(-1)).toBe(false);
    expect(d.beginDrag(1)).toBe(true);
    expect(d.beginDrag(1)).toBe(false);
  });
  it('refuses to go past the last spread', () => {
    const d = createBookModel(5);
    d.goTo(4);
    d.update(10);
    expect(d.beginDrag(1)).toBe(false);
  });
  it('rolls back on a small slow drag', () => {
    const d = createBookModel(5);
    d.beginDrag(1);
    d.moveDrag(0.3);
    expect(d.progress(0)).toBeCloseTo(0.3);
    d.endDrag(0);
    d.update(10);
    expect(d.spread).toBe(0);
    expect(d.progress(0)).toBe(0);
  });
  it('commits on a flick', () => {
    const f = createBookModel(5);
    f.beginDrag(1);
    f.moveDrag(0.3);
    f.endDrag(1);
    f.update(10);
    expect(f.spread).toBe(1);
    expect(f.progress(0)).toBe(1);
  });
  it('commits past halfway, but a strong backwards flick rolls back', () => {
    const a = createBookModel(5);
    a.beginDrag(1);
    a.moveDrag(0.7);
    a.endDrag(0);
    expect(a.spread).toBe(1);
    const b = createBookModel(5);
    b.beginDrag(1);
    b.moveDrag(0.7);
    b.endDrag(-1);
    expect(b.spread).toBe(0);
  });
  it('allows a new gesture after the previous ended', () => {
    const d = createBookModel(5);
    d.beginDrag(1);
    d.endDrag(0);
    expect(d.beginDrag(1)).toBe(true);
  });
});

describe('drag backward', () => {
  const at2 = () => {
    const m = createBookModel(5);
    m.goTo(2);
    m.update(10);
    return m;
  };
  it('grabs sheet spread-1 and maps fraction to progress = 1 - fraction', () => {
    const d = at2();
    expect(d.beginDrag(-1)).toBe(true);
    d.moveDrag(0.3);
    expect(d.progress(1)).toBeCloseTo(0.7);
    expect(d.progress(0)).toBe(1);
    expect(d.spread).toBe(2);
  });
  it('rolls back to the left when dragged little', () => {
    const d = at2();
    d.beginDrag(-1);
    d.moveDrag(0.3);
    d.endDrag(0);
    d.update(10);
    expect(d.spread).toBe(2);
    expect(d.progress(1)).toBe(1);
  });
  it('commits on a flick and updates spread', () => {
    const d = at2();
    d.beginDrag(-1);
    d.moveDrag(0.3);
    d.endDrag(1);
    expect(d.spread).toBe(1);
    d.update(10);
    expect(d.progress(1)).toBe(0);
  });
  it('commits past halfway and rolls back on a strong reverse flick', () => {
    const a = at2();
    a.beginDrag(-1);
    a.moveDrag(0.7);
    a.endDrag(0);
    expect(a.spread).toBe(1);
    const b = at2();
    b.beginDrag(-1);
    b.moveDrag(0.7);
    b.endDrag(-1);
    expect(b.spread).toBe(2);
  });
});
