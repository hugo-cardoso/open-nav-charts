/**
 * Relógio injetado. Sem isso, testar backoff exigiria esperar de verdade — e o
 * Princípio IV proíbe teste dependente de relógio não controlado.
 */
export interface Clock {
  now(): Date;
  sleep(milliseconds: number, signal?: AbortSignal): Promise<void>;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted === true) {
        reject(signal.reason);
        return;
      }

      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, milliseconds);

      const onAbort = (): void => {
        clearTimeout(timer);
        reject(signal?.reason);
      };

      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}
