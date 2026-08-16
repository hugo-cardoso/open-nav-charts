/**
 * API pública da feature `procedures`.
 *
 * A tela de um aeródromo (feature `airports`) compõe a listagem de procedimentos
 * daquele aeródromo. O restante — o cliente HTTP da feature, as abas, os itens da
 * lista, o link da carta — é interno.
 */

export { ProcedureList } from "./components/procedure-list.js";
export {
  PROCEDURE_GROUP_IDS,
  type ProcedureGroupId,
} from "./domain/procedure-groups.js";
export { useProcedures } from "./hooks/use-procedures.js";
