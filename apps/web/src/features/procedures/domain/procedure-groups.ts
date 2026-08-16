import type { Procedure } from "../../../shared/api/types.js";

/**
 * Agrupamento dos tipos de procedimento em abas.
 *
 * Os tipos publicados pelo DECEA são muitos e de natureza desigual: alguns
 * descrevem o voo (chegada, saída, aproximação) e outros o solo (pátio,
 * estacionamento). As abas reúnem os que o piloto consulta juntos.
 */

export const PROCEDURE_GROUP_IDS = ["STAR", "IAC", "TAXI", "SID", "OTHER"] as const;

export type ProcedureGroupId = (typeof PROCEDURE_GROUP_IDS)[number];

/**
 * Tipos que cada aba reúne.
 *
 * `AGMC` aparece aqui onde a fonte fala em `GMC`: o acervo grava o código com o
 * prefixo, e é ele que chega da API.
 */
const GROUP_TYPES: Readonly<Record<Exclude<ProcedureGroupId, "OTHER">, readonly string[]>> = {
  STAR: ["STAR"],
  IAC: ["IAC", "VAC"],
  TAXI: ["ADC", "AGMC", "PDC"],
  SID: ["SID"],
};

/**
 * Cor da faixa de cada aba. São nomes da paleta do Mantine, resolvidos pelo tema
 * — não valores literais, para que o modo escuro ajuste o tom sozinho.
 */
export const GROUP_COLORS: Readonly<Record<ProcedureGroupId, string>> = {
  STAR: "lime",
  IAC: "pink",
  TAXI: "blue",
  SID: "orange",
  OTHER: "gray",
};

/** Índice tipo → grupo, construído uma vez a partir de `GROUP_TYPES`. */
const TYPE_TO_GROUP: ReadonlyMap<string, ProcedureGroupId> = new Map(
  Object.entries(GROUP_TYPES).flatMap(([group, types]) =>
    types.map((type) => [type, group as ProcedureGroupId] as const),
  ),
);

/**
 * O acervo publica tipos que o agrupamento não prevê — `AOC` é o caso corrente,
 * presente em praticamente todo aeródromo. Recolhê-los em `OTHER` é o que impede
 * que procedimentos válidos fiquem inalcançáveis quando um tipo novo aparecer.
 */
export function groupOf(type: string): ProcedureGroupId {
  return TYPE_TO_GROUP.get(type.trim().toUpperCase()) ?? "OTHER";
}

export interface ProcedureGroup {
  readonly id: ProcedureGroupId;
  readonly procedures: readonly Procedure[];
}

/**
 * Distribui os procedimentos nas abas, preservando a ordem em que a API os
 * devolveu dentro de cada uma.
 *
 * As abas do agrupamento aparecem **sempre**, ainda que vazias: a posição de
 * cada uma fica idêntica em todo aeródromo, e a ausência de um tipo passa a ser
 * informação visível ("este aeródromo não tem SID") em vez de uma aba que some
 * sem explicação.
 *
 * `OTHER` é a exceção e continua condicional: ela existe para recolher tipos que
 * o agrupamento não previu, então exibi-la vazia anunciaria uma categoria que
 * não significa nada para quem lê.
 */
export function groupProcedures(procedures: readonly Procedure[]): readonly ProcedureGroup[] {
  const buckets = new Map<ProcedureGroupId, Procedure[]>();

  for (const procedure of procedures) {
    const id = groupOf(procedure.type);
    const bucket = buckets.get(id);
    if (bucket === undefined) {
      buckets.set(id, [procedure]);
    } else {
      bucket.push(procedure);
    }
  }

  // A ordem das abas é a de `PROCEDURE_GROUP_IDS`, não a de chegada dos dados:
  // a posição de cada aba precisa ser estável entre aeródromos.
  return PROCEDURE_GROUP_IDS.flatMap((id) => {
    const found = buckets.get(id);
    if (id === "OTHER" && found === undefined) {
      return [];
    }
    return [{ id, procedures: found ?? [] }];
  });
}
