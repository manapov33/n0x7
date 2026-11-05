/** Сколько ждём один ресурс (чанк, текстуру), прежде чем считать загрузку неудавшейся. */
export const LOAD_TIMEOUT_MS = 25_000;

/** Отклоняет промис, если он не завершился за ms. Исходный промис не отменяется. */
export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${what}`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
