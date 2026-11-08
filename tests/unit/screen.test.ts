// @vitest-environment jsdom
import { Scene } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScreen } from '../../src/scene/screen.ts';

const video = { dir: '/frames/x', count: 3, phoneCount: 3 } as never;
const gates = new Map<string, () => void>();

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private url = '';
  set src(v: string) {
    this.url = v;
    queueMicrotask(() => this.onload?.());
  }
  get src() {
    return this.url;
  }
  decode() {
    return new Promise<void>((r) => gates.set(this.url, r));
  }
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
};

describe('screen.show(null)', () => {
  beforeEach(() => vi.stubGlobal('Image', FakeImage));
  afterEach(() => {
    vi.unstubAllGlobals();
    gates.clear();
  });

  it('поздно декодированный кадр скрытого экрана не просит перерисовку', async () => {
    const requestRender = vi.fn();
    const screen = createScreen({
      scene: new Scene(),
      width: 6,
      height: 4,
      phone: false,
      loadTimeoutMs: 1000,
      anisotropy: 1,
      requestRender,
    });
    screen.show({ index: 0, frame: 0, screen: 1 }, video);
    await flush(); // кадры скачаны, декодирование ждёт
    expect(gates.size).toBeGreaterThan(0);
    screen.show(null, undefined);
    const before = requestRender.mock.calls.length;
    gates.forEach((release) => release()); // поздний decode()
    await flush();
    expect(requestRender.mock.calls.length).toBe(before);
    screen.dispose();
  });
});
