// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { site } from '../../src/content/site.ts';
import { createOverlay } from '../../src/film/overlay.ts';

describe('overlay work stagger', () => {
  afterEach(() => (document.body.innerHTML = ''));
  const parts = () => {
    const el = document.querySelector('[data-ov="work-0"]')!;
    const op = (sel: string) => Number((el.querySelector<HTMLElement>(sel)!.style.opacity || '1'));
    return { kicker: op('.ov-kicker'), title: op('.ov-title'), task: op('.ov-task') };
  };

  it('кикер, название и задача появляются по очереди', () => {
    const o = createOverlay(document.body, site);
    o.update({ 'work-0': 0.4 });
    const a = parts();
    expect(a.kicker).toBeGreaterThan(a.title);
    expect(a.title).toBeGreaterThan(a.task);
    expect(a.kicker).toBeGreaterThan(0.2);
    expect(a.task).toBeLessThan(0.05);
    o.update({ 'work-0': 0.6 });
    const b = parts();
    expect(b.title).toBeGreaterThan(0.3);
    expect(b.task).toBeLessThan(b.title);
    o.update({ 'work-0': 1 });
    expect(parts()).toEqual({ kicker: 1, title: 1, task: 1 });
    o.destroy();
  });
});
