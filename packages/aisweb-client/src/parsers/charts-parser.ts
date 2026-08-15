import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import type { ChartSummary } from "../aisweb-client.js";
import { PermanentSourceError, RetryableSourceError } from "../errors.js";
import { toArray, toNullableText, unescapeXmlEntities } from "./xml-utils.js";

const chartsSchema = z.object({
  aisweb: z.object({
    cartas: z
      .object({
        "@_total": z.coerce.number().int().nonnegative().optional(),
        item: z.unknown().optional(),
      })
      .optional(),
  }),
});

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

  parse(xml: string, icao: string): readonly ChartSummary[] {
    const parsed = chartsSchema.safeParse(this.parseXml(xml));
    if (!parsed.success) {
      throw new PermanentSourceError(`resposta de cartas de ${icao} em formato inesperado`);
    }

    const cartas = parsed.data.aisweb.cartas;
    const items = toArray(cartas?.item);
    const charts = items.map((item) => this.toChart(item, icao));

    // `total` divergente da contagem indica resposta truncada — a fonte não
    // entregou tudo, então repetir vale a pena (contrato da operação 3).
    const announced = cartas?.["@_total"];
    if (announced !== undefined && announced !== charts.length) {
      throw new RetryableSourceError(
        `cartas de ${icao}: fonte anunciou ${announced} itens e entregou ${charts.length}`,
      );
    }

    return charts;
  }

  private toChart(item: unknown, icao: string): ChartSummary {
    const parsed = itemSchema.safeParse(item);
    if (!parsed.success) {
      throw new PermanentSourceError(`carta de ${icao} em formato inesperado`);
    }

    const id = toNullableText(parsed.data.id);
    const name = toNullableText(parsed.data.nome);
    const type = toNullableText(parsed.data.tipo);
    if (id === null || name === null || type === null) {
      throw new PermanentSourceError(
        `carta de ${icao} sem id, nome ou tipo: ${JSON.stringify({ id, name, type })}`,
      );
    }

    const link = toNullableText(parsed.data.link);

    return {
      id,
      airportIcao: toNullableText(parsed.data.IcaoCode)?.toUpperCase() ?? icao,
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
