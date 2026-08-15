import { z } from "zod";
import {
  InvalidIcaoError,
  InvalidPaginationError,
  InvalidProcedureIdError,
  InvalidProcedureTypeError,
  InvalidSearchError,
  InvalidStateError,
} from "./api-error.js";

/**
 * Validação de todo parâmetro de entrada, aplicada antes de qualquer acesso ao
 * acervo (FR-027). Cada schema produz o erro do contrato correspondente, então o
 * consumidor sempre sabe qual parâmetro recusar — a tabela de data-model §6.
 */

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const MAX_SEARCH_LENGTH = 100;

const icaoSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{4}$/)
  .transform((value) => value.toUpperCase());

// `\p{Cc}` cobre os caracteres de controle; o id da fonte é opaco no resto.
const procedureIdSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !/\p{Cc}/u.test(value));

const stateSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/)
  .transform((value) => value.toUpperCase());

const searchSchema = z.string().trim().min(1).max(MAX_SEARCH_LENGTH);

const procedureTypeSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.toUpperCase());

/** Query string traz sempre string; só inteiro decimal é aceito. */
const positiveIntegerSchema = z
  .string()
  .trim()
  .regex(/^\d+$/)
  .transform(Number)
  .refine((value) => Number.isSafeInteger(value) && value >= 1);

export function parseIcao(value: unknown): string {
  const parsed = icaoSchema.safeParse(value);
  if (!parsed.success) {
    throw new InvalidIcaoError();
  }
  return parsed.data;
}

export function parseProcedureId(value: unknown): string {
  const parsed = procedureIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new InvalidProcedureIdError();
  }
  return parsed.data;
}

export interface Pagination {
  readonly page: number;
  readonly pageSize: number;
}

export function parsePagination(query: { page?: unknown; pageSize?: unknown }): Pagination {
  return {
    page: parsePageParameter(query.page, DEFAULT_PAGE, Number.MAX_SAFE_INTEGER),
    pageSize: parsePageParameter(query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  };
}

function parsePageParameter(value: unknown, fallback: number, max: number): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = positiveIntegerSchema.safeParse(value);
  if (!parsed.success || parsed.data > max) {
    throw new InvalidPaginationError();
  }
  return parsed.data;
}

export function parseState(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = stateSchema.safeParse(value);
  if (!parsed.success) {
    throw new InvalidStateError();
  }
  return parsed.data;
}

export function parseSearch(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = searchSchema.safeParse(value);
  if (!parsed.success) {
    throw new InvalidSearchError();
  }
  return parsed.data;
}

export function parseProcedureType(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = procedureTypeSchema.safeParse(value);
  if (!parsed.success) {
    throw new InvalidProcedureTypeError();
  }
  return parsed.data;
}
