export function createTextureStore<T>(o: {
  load: (url: string) => Promise<T>;
  urlsForSpread: (spread: number) => string[];
  onFatal: (url: string, error: unknown) => void;
}): { ensure(spread: number): Promise<void>; get(url: string): T | undefined } {
  const done = new Map<string, T>();
  const pending = new Map<string, Promise<void>>();
  const failed = new Set<string>();

  async function fetchWithRetry(url: string): Promise<void> {
    try {
      done.set(url, await o.load(url));
    } catch {
      try {
        done.set(url, await o.load(url));
      } catch (error) {
        failed.add(url);
        o.onFatal(url, error);
      }
    }
  }

  function request(url: string): Promise<void> {
    if (done.has(url) || failed.has(url)) return Promise.resolve();
    let p = pending.get(url);
    if (!p) {
      p = fetchWithRetry(url).finally(() => pending.delete(url));
      pending.set(url, p);
    }
    return p;
  }

  return {
    async ensure(spread) {
      const urls = [...o.urlsForSpread(spread), ...o.urlsForSpread(spread + 1)];
      await Promise.all(urls.map(request));
    },
    get: (url) => done.get(url),
  };
}
