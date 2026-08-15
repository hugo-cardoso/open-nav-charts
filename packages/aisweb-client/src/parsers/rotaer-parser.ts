import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import type { AirportDetails, RunwayDetails } from "../aisweb-client.js";
import { PermanentSourceError } from "../errors.js";
import { parseSexagesimal, toArray, toNullableNumber, toNullableText } from "./xml-utils.js";

export interface AirportListPage {
  readonly total: number;
  readonly icaos: readonly string[];
}

/**
 * O XML da fonte entra como `unknown` e só vira entidade depois de estreitado
 * por Zod — nenhum `any` atravessa a fronteira do pacote (Princípio II).
 */
const listSchema = z.object({
  aisweb: z.object({
    rotaer: z
      .object({
        "@_total": z.coerce.number().int().nonnegative().optional(),
        item: z.unknown().optional(),
      })
      .optional(),
  }),
});

const itemSchema = z.object({ AeroCode: z.unknown().optional() });

const airportSchema = z.object({
  aisweb: z.object({
    AeroCode: z.unknown().optional(),
    name: z.unknown().optional(),
    city: z.unknown().optional(),
    uf: z.unknown().optional(),
    lat: z.unknown().optional(),
    lng: z.unknown().optional(),
    latRotaer: z.unknown().optional(),
    lngRotaer: z.unknown().optional(),
    runways: z.unknown().optional(),
  }),
});

const runwaysSchema = z.object({ runway: z.unknown().optional() });
const runwaySchema = z.object({
  ident: z.unknown().optional(),
  length: z.unknown().optional(),
  width: z.unknown().optional(),
});

export class RotaerParser {
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    // Nomes e códigos precisam continuar strings: sem isso, `10/28` e valores
    // como `07` seriam coagidos a número e perderiam a forma original.
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    cdataPropName: "__cdata",
  });

  parseList(xml: string): AirportListPage {
    const parsed = listSchema.safeParse(this.parse(xml));
    if (!parsed.success) {
      throw new PermanentSourceError("resposta de listagem do ROTAER em formato inesperado");
    }

    const rotaer = parsed.data.aisweb.rotaer;
    const icaos = toArray(rotaer?.item)
      .map((item) => {
        const parsedItem = itemSchema.safeParse(item);
        return parsedItem.success ? toNullableText(parsedItem.data.AeroCode) : null;
      })
      .filter((icao): icao is string => icao !== null)
      .map((icao) => icao.toUpperCase());

    return { total: rotaer?.["@_total"] ?? icaos.length, icaos };
  }

  parseAirport(xml: string): AirportDetails {
    const parsed = airportSchema.safeParse(this.parse(xml));
    if (!parsed.success) {
      // Observado na coleta real: alguns aeródromos constam na listagem mas a
      // fonte devolve `<aisweb></aisweb>` no detalhamento. É definitivo —
      // repetir não faz o dado aparecer.
      throw new PermanentSourceError(
        isEmptyEnvelope(xml)
          ? "a fonte não publica detalhamento para este aeródromo (resposta vazia)"
          : "resposta de detalhamento do ROTAER em formato inesperado",
      );
    }

    const root = parsed.data.aisweb;
    const icao = toNullableText(root.AeroCode)?.toUpperCase() ?? null;
    if (icao === null) {
      throw new PermanentSourceError("aeródromo sem AeroCode na resposta da fonte");
    }

    const name = toNullableText(root.name);
    if (name === null) {
      throw new PermanentSourceError(`aeródromo ${icao} sem name na resposta da fonte`);
    }

    const coordinates = this.readCoordinates(root);

    return {
      icao,
      name,
      city: toNullableText(root.city),
      state: toNullableText(root.uf)?.toUpperCase() ?? null,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      runways: this.readRunways(root.runways),
    };
  }

  /**
   * `lat`/`lng` já vêm em graus decimais com sinal (research R4); o par
   * sexagesimal é só fallback. Meia coordenada não é gravada — coordenada
   * incompleta é inútil.
   */
  private readCoordinates(root: {
    lat?: unknown;
    lng?: unknown;
    latRotaer?: unknown;
    lngRotaer?: unknown;
  }): { latitude: number | null; longitude: number | null } {
    const latitude = toNullableNumber(root.lat);
    const longitude = toNullableNumber(root.lng);
    if (latitude !== null && longitude !== null) {
      return { latitude, longitude };
    }

    const fallbackLatitude = parseSexagesimal(toNullableText(root.latRotaer));
    const fallbackLongitude = parseSexagesimal(toNullableText(root.lngRotaer));
    if (fallbackLatitude !== null && fallbackLongitude !== null) {
      return { latitude: fallbackLatitude, longitude: fallbackLongitude };
    }

    return { latitude: null, longitude: null };
  }

  private readRunways(value: unknown): readonly RunwayDetails[] {
    const parsed = runwaysSchema.safeParse(value);
    if (!parsed.success) {
      return [];
    }

    const runways = toArray(parsed.data.runway)
      .map((entry): RunwayDetails | null => {
        const runway = runwaySchema.safeParse(entry);
        if (!runway.success) {
          return null;
        }
        const ident = toNullableText(runway.data.ident);
        if (ident === null) {
          return null;
        }
        return {
          ident,
          lengthMeters: toPositiveInteger(runway.data.length),
          widthMeters: toPositiveInteger(runway.data.width),
        };
      })
      .filter((runway): runway is RunwayDetails => runway !== null);

    return dedupeRunways(runways);
  }

  private parse(xml: string): unknown {
    try {
      return this.parser.parse(xml);
    } catch (cause) {
      throw new PermanentSourceError("XML malformado na resposta do ROTAER", { cause });
    }
  }
}

/**
 * A fonte às vezes publica a mesma pista duas vezes no mesmo aeródromo, uma
 * delas com dimensões espúrias (observado em SNAO, SNCW, SSNG e SSWN na coleta
 * de 2026-08-15). Como `(airport_icao, ident)` é único no modelo, a duplicata
 * derrubaria a gravação do aeródromo inteiro.
 *
 * O critério de desempate é o maior comprimento: entre `09/27` com 24 m e
 * `09/27` com 1295 m, a segunda é a pista real e a primeira é ruído. Descartar
 * a mais longa perderia o dado útil.
 */
function dedupeRunways(runways: readonly RunwayDetails[]): readonly RunwayDetails[] {
  const byIdent = new Map<string, RunwayDetails>();

  for (const runway of runways) {
    const current = byIdent.get(runway.ident);
    if (current === undefined || (runway.lengthMeters ?? 0) > (current.lengthMeters ?? 0)) {
      byIdent.set(runway.ident, runway);
    }
  }

  return [...byIdent.values()];
}

/** `<aisweb>` sem nenhum elemento dentro: a fonte não tem o que publicar. */
function isEmptyEnvelope(xml: string): boolean {
  return !/<aisweb[^>]*>\s*<[a-zA-Z]/.test(xml);
}

/**
 * Dimensão ausente ou não numérica vira nula, nunca zero — zero afirmaria que a
 * pista tem comprimento nulo, o que é falso (data-model).
 */
function toPositiveInteger(value: unknown): number | null {
  const parsed = toNullableNumber(value);
  if (parsed === null || !Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.trunc(parsed);
}
