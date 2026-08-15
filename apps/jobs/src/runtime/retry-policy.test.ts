import { PermanentSourceError, RetryableSourceError } from "@open-nav-charts/aisweb-client";
import { describe, expect, it } from "vitest";
import type { Clock } from "./clock.js";
import { RetryPolicy } from "./retry-policy.js";

/** Relógio controlado: registra as esperas em vez de dormir de verdade. */
class FakeClock implements Clock {
  readonly slept: number[] = [];
  private current = new Date("2026-08-15T10:00:00Z");

  now(): Date {
    return new Date(this.current);
  }

  async sleep(milliseconds: number): Promise<void> {
    this.slept.push(milliseconds);
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

/** Aleatoriedade injetada: jitter previsível no teste (Princípio IV). */
function fixedRandom(value: number): () => number {
  return () => value;
}

function policy(clock: Clock, options?: { maxAttempts?: number; random?: () => number }) {
  return new RetryPolicy({
    clock,
    random: options?.random ?? fixedRandom(0.5),
    maxAttempts: options?.maxAttempts ?? 3,
    baseDelayMs: 1000,
  });
}

describe("RetryPolicy", () => {
  it("devolve o resultado da primeira tentativa bem-sucedida sem esperar", async () => {
    const clock = new FakeClock();
    let calls = 0;

    const result = await policy(clock).execute(async () => {
      calls += 1;
      return "ok";
    });

    expect(result).toBe("ok");
    expect(calls).toBe(1);
    expect(clock.slept).toEqual([]);
  });

  it("repete até 3 tentativas no total em erro retentável", async () => {
    const clock = new FakeClock();
    let calls = 0;

    await expect(
      policy(clock).execute(async () => {
        calls += 1;
        throw new RetryableSourceError("timeout");
      }),
    ).rejects.toBeInstanceOf(RetryableSourceError);

    expect(calls).toBe(3);
    expect(clock.slept).toHaveLength(2);
  });

  it("tem sucesso na terceira tentativa após duas falhas retentáveis", async () => {
    const clock = new FakeClock();
    let calls = 0;

    const result = await policy(clock).execute(async () => {
      calls += 1;
      if (calls < 3) {
        throw new RetryableSourceError("timeout");
      }
      return "ok";
    });

    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("aplica backoff exponencial entre as tentativas", async () => {
    const clock = new FakeClock();

    await expect(
      policy(clock, { maxAttempts: 4, random: fixedRandom(0) }).execute(async () => {
        throw new RetryableSourceError("timeout");
      }),
    ).rejects.toBeInstanceOf(RetryableSourceError);

    // base 1000ms: 1000, 2000, 4000 — jitter zerado pelo random fixo.
    expect(clock.slept).toEqual([1000, 2000, 4000]);
  });

  it("aplica jitter proporcional à fonte de aleatoriedade injetada", async () => {
    const clock = new FakeClock();

    await expect(
      policy(clock, { maxAttempts: 2, random: fixedRandom(1) }).execute(async () => {
        throw new RetryableSourceError("timeout");
      }),
    ).rejects.toBeInstanceOf(RetryableSourceError);

    // Com random=1 o jitter é máximo: 1000 + 100% de 1000.
    expect(clock.slept).toEqual([2000]);
  });

  it("não consome tentativas em erro definitivo", async () => {
    const clock = new FakeClock();
    let calls = 0;

    await expect(
      policy(clock).execute(async () => {
        calls += 1;
        throw new PermanentSourceError("400");
      }),
    ).rejects.toBeInstanceOf(PermanentSourceError);

    expect(calls).toBe(1);
    expect(clock.slept).toEqual([]);
  });

  it("trata erro não classificado como definitivo", async () => {
    const clock = new FakeClock();
    let calls = 0;

    await expect(
      policy(clock).execute(async () => {
        calls += 1;
        throw new TypeError("bug de programação");
      }),
    ).rejects.toBeInstanceOf(TypeError);

    expect(calls).toBe(1);
  });

  it("informa o número da tentativa a quem observa", async () => {
    const clock = new FakeClock();
    const attempts: number[] = [];

    await expect(
      policy(clock).execute(
        async () => {
          throw new RetryableSourceError("timeout");
        },
        {
          onRetry: (attempt) => attempts.push(attempt),
        },
      ),
    ).rejects.toBeInstanceOf(RetryableSourceError);

    expect(attempts).toEqual([1, 2]);
  });

  it("interrompe imediatamente quando o sinal já foi abortado", async () => {
    const clock = new FakeClock();
    const controller = new AbortController();
    controller.abort();
    let calls = 0;

    await expect(
      policy(clock).execute(
        async () => {
          calls += 1;
          throw new RetryableSourceError("timeout");
        },
        { signal: controller.signal },
      ),
    ).rejects.toBeDefined();

    expect(calls).toBe(0);
  });

  it("não inicia nova tentativa após a interrupção", async () => {
    const clock = new FakeClock();
    const controller = new AbortController();
    let calls = 0;

    await expect(
      policy(clock).execute(
        async () => {
          calls += 1;
          controller.abort();
          throw new RetryableSourceError("timeout");
        },
        { signal: controller.signal },
      ),
    ).rejects.toBeDefined();

    expect(calls).toBe(1);
  });
});
