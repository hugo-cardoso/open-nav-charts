import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import type { ChartSummary, IfrChartCatalog } from "../aisweb-client.js";
import { PermanentSourceError, RetryableSourceError } from "../errors.js";
import { toArray, toNullableText, unescapeXmlEntities } from "./xml-utils.js";

const chartsSchema = z.object({
  aisweb: z.object({
    cartas: z
      .object({
        "@_total": z.coerce.number().int().nonnegative().optional(),
        "@_lastupdate": z.unknown().optional(),
        "@_emenda": z.unknown().optional(),
        item: z.unknown().optional(),
      })
      .optional(),
  }),
});

/** `{ts '2026-09-30 17:35:34'}`, como a fonte publica o atributo `lastupdate`. */
const LAST_UPDATE_PATTERN = /^\{ts\s+'([^']+)'\}$/;

const itemSchema = z.object({
  id: z.unknown().optional(),
  nome: z.unknown().optional(),
  tipo: z.unknown().optional(),
  amdt: z.unknown().optional(),
  link: z.unknown().optional(),
  IcaoCode: z.unknown().optional(),
});

export class ChartsParser {
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
    cdataPropName: "__cdata",
  });

  /**
   * Todas as cartas IFR de uma vez (research R2). Sem aeródromo na consulta,
   * o `<IcaoCode>` de cada item é o único vínculo com o aeródromo — por isso é
   * obrigatório aqui, ao contrário da consulta por aeródromo.
   */
  parseCatalog(xml: string): IfrChartCatalog {
    const parsed = chartsSchema.safeParse(this.parseXml(xml));
    if (!parsed.success) {
      throw new PermanentSourceError("resposta do lote de cartas IFR em formato inesperado");
    }

    const cartas = parsed.data.aisweb.cartas;
    const charts = toArray(cartas?.item).map((item) => this.toChart(item));

    // Truncamento aqui faria cartas parecerem retiradas de vigência em todos os
    // aeródromos — mais grave que na consulta por aeródromo, e igualmente
    // retentável.
    const announced = cartas?.["@_total"];
    if (announced !== undefined && announced !== charts.length) {
      throw new RetryableSourceError(
        `lote de cartas IFR: fonte anunciou ${announced} itens e entregou ${charts.length}`,
      );
    }

    return {
      lastUpdate: parseLastUpdate(toNullableText(cartas?.["@_lastupdate"])),
      airacCycle: toNullableText(cartas?.["@_emenda"]),
      charts,
    };
  }

  private toChart(item: unknown): ChartSummary {
    const parsed = itemSchema.safeParse(item);
    if (!parsed.success) {
      throw new PermanentSourceError("carta do lote IFR em formato inesperado");
    }

    const id = toNullableText(parsed.data.id);
    const name = toNullableText(parsed.data.nome);
    const type = toNullableText(parsed.data.tipo);
    if (id === null || name === null || type === null) {
      throw new PermanentSourceError(
        `carta do lote IFR sem id, nome ou tipo: ${JSON.stringify({ id, name, type })}`,
      );
    }

    const airportIcao = toNullableText(parsed.data.IcaoCode)?.toUpperCase() ?? null;
    if (airportIcao === null) {
      throw new PermanentSourceError(`carta ${id} do lote IFR sem IcaoCode`);
    }

    const link = toNullableText(parsed.data.link);

    return {
      id,
      airportIcao,
      name,
      type: type.toUpperCase(),
      // A emenda por carta é o <amdt> do item; o atributo `emenda` do envelope
      // é a data AIRAC do conjunto e gravaria o mesmo valor em todas.
      amendment: toNullableText(parsed.data.amdt),
      link: link === null ? null : unescapeXmlEntities(link),
    };
  }

  private parseXml(xml: string): unknown {
    try {
      return this.parser.parse(xml);
    } catch (cause) {
      throw new PermanentSourceError("XML malformado na resposta de cartas", { cause });
    }
  }
}

/** Extrai a data/hora de `{ts '…'}`; outro formato vira `null` (research R5). */
function parseLastUpdate(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const match = LAST_UPDATE_PATTERN.exec(value);
  return match?.[1]?.trim() ?? null;
}
