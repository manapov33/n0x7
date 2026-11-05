import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withTimeout } from '../../src/util/timeout.ts';
import { createTextureStore } from '../../src/textures/store.ts';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('withTimeout', () => {
  it('отдаёт значение, если успели', async () => {
    await expect(withTimeout(Promise.resolve(7), 100, 'x')).resolves.toBe(7);
  });
  it('пробрасывает ошибку исходного промиса', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 100, 'x')).rejects.toThrow('boom');
  });
  it('отклоняет, если промис не ответил за срок', async () => {
    const p = withTimeout(new Promise<number>(() => {}), 100, 'slow');
    const assertion = expect(p).rejects.toThrow(/slow/);
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });
  it('таймер снимается после успеха', async () => {
    await withTimeout(Promise.resolve(1), 100, 'x');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('хранилище текстур + таймаут', () => {
  it('никогда не отвечающая загрузка после повтора доходит до onFatal', async () => {
    const onFatal = vi.fn();
    const store = createTextureStore<string>({
      load: (url) => withTimeout(new Promise<string>(() => {}), 100, url),
      urlsForSpread: (s) => (s === 0 ? ['a.webp'] : []),
      onFatal,
    });
    const done = store.ensure(0);
    await vi.advanceTimersByTimeAsync(100); // первая попытка
    expect(onFatal).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100); // повтор
    await done;
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(onFatal.mock.calls[0]![0]).toBe('a.webp');
  });
});
