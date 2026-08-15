import type { AirportProcedure } from "@open-nav-charts/domain";

export interface ProcedureDiff {
  /** Cartas presentes na fonte: inseridas ou atualizadas. */
  readonly toPersist: readonly AirportProcedure[];
  /** Cartas persistidas que sumiram da fonte: removidas do banco e do bucket. */
  readonly toRemove: readonly string[];
}

/**
 * Diff entre o que a fonte publica agora e o que está persistido (research R8).
 * Função pura sobre listas, sem I/O — a exceção prevista no plano.
 *
 * A transação de `AirportSyncRepository` recalcula a remoção com o estado lido
 * dentro dela, que é a fonte autoritativa; esta função é o que permite decidir
 * o mesmo localmente e testar a regra sem banco.
 */
export function diffProcedures(
  incoming: readonly AirportProcedure[],
  existing: readonly AirportProcedure[],
): ProcedureDiff {
  const incomingIds = new Set(incoming.map((procedure) => procedure.id));
  const existingById = new Map(existing.map((procedure) => [procedure.id, procedure]));

  const toPersist = incoming.map((procedure) => {
    const current = existingById.get(procedure.id);
    if (current === undefined || procedure.storageKey !== null) {
      return procedure;
    }
    // Documento já arquivado não é rebaixado a nulo por uma coleta que pulou
    // os PDFs: o que existe no bucket continua endereçado (FR-020).
    return {
      ...procedure,
      storageKey: current.storageKey,
      archivedAt: current.archivedAt,
    };
  });

  const toRemove = existing.map((procedure) => procedure.id).filter((id) => !incomingIds.has(id));

  return { toPersist, toRemove };
}
