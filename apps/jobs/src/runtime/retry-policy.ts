import { isRetryableSourceError } from "@open-nav-charts/aisweb-client";
import type { Clock } from "./clock.js";

export interface RetryPolicyOptions {
  readonly clock: Clock;
  /** Fonte de aleatoriedade do jitter, injetada para o teste ser determinístico. */
  readonly random: () => number;
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
}

export interface RetryExecuteOptions {
  readonly signal?: AbortSignal;
  readonly onRetry?: (attempt: number, maxAttempts: number, error: unknown) => void;
}

/**
 * Envolve a unidade atômica de retry — o aeródromo inteiro (research R7). Erro
 * definitivo não consome tentativas: repetir um 400 só desperdiça tempo e agrava
 * a limitação de taxa da fonte.
 */
export class RetryPolicy {
  private readonly clock: Clock;
  private readonly random: () => number;
  // Prefixo `_` porque o getter público expõe o mesmo nome — `private` não
  // permite campo e acessor homônimos na mesma classe.
  private readonly _maxAttempts: number;
  private readonly baseDelayMs: number;

  constructor(options: RetryPolicyOptions) {
    if (options.maxAttempts < 1) {
      throw new RangeError("o número de tentativas deve ser pelo menos 1");
    }
    this.clock = options.clock;
    this.random = options.random;
    this._maxAttempts = options.maxAttempts;
    this.baseDelayMs = options.baseDelayMs;
  }

  get maxAttempts(): number {
    return this._maxAttempts;
  }

  async execute<T>(operation: () => Promise<T>, options: RetryExecuteOptions = {}): Promise<T> {
    for (let attempt = 1; attempt <= this._maxAttempts; attempt += 1) {
      options.signal?.throwIfAborted();

      try {
        return await operation();
      } catch (error) {
        const isLastAttempt = attempt === this._maxAttempts;
        if (!isRetryableSourceError(error) || isLastAttempt) {
          throw error;
        }

        options.onRetry?.(attempt, this._maxAttempts, error);
        // Nenhuma nova tentativa começa depois da interrupção (FR-028).
        options.signal?.throwIfAborted();
        await this.clock.sleep(this.delayFor(attempt), options.signal);
      }
    }

    // Inalcançável: o laço sempre retorna ou relança na última tentativa.
    throw new Error("política de tentativas terminou sem resultado");
  }

  /**
   * Backoff exponencial com jitter — sem o jitter, os 4 workers voltariam a
   * bater na fonte em sincronia após uma falha coletiva (research R7).
   */
  private delayFor(attempt: number): number {
    const exponential = this.baseDelayMs * 2 ** (attempt - 1);
    return Math.round(exponential + exponential * this.random());
  }
}
