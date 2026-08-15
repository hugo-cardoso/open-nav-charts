import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PermanentSourceError, RetryableSourceError } from "../errors.js";
import { ChartsParser } from "./charts-parser.js";
import { RotaerParser } from "./rotaer-parser.js";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8");
}

describe("RotaerParser", () => {
  describe("parseList", () => {
    it("lê o total global e os códigos ICAO da página", () => {
      const parser = new RotaerParser();

      const page = parser.parseList(fixture("rotaer-list.xml"));

      expect(page.total).toBe(4550);
      expect(page.icaos).toEqual(["SBGR", "SBSP", "SBGL"]);
    });

    it("aceita página vazia preservando o total anunciado", () => {
      const parser = new RotaerParser();

      const page = parser.parseList(fixture("rotaer-list-vazia.xml"));

      expect(page.total).toBe(4550);
      expect(page.icaos).toEqual([]);
    });

    it("rejeita XML malformado como erro definitivo", () => {
      const parser = new RotaerParser();

      expect(() => parser.parseList("<aisweb><rotaer")).toThrow(PermanentSourceError);
    });
  });

  describe("parseAirport", () => {
    it("extrai nome acentuado de CDATA, coordenadas decimais e pistas", () => {
      const parser = new RotaerParser();

      const airport = parser.parseAirport(fixture("rotaer-sbgl.xml"));

      expect(airport.icao).toBe("SBGL");
      expect(airport.name).toBe("Galeão - Antônio Carlos Jobim");
      expect(airport.city).toBe("Rio de Janeiro");
      expect(airport.state).toBe("RJ");
      expect(airport.latitude).toBeCloseTo(-22.81, 6);
      expect(airport.longitude).toBeCloseTo(-43.250556, 6);
      expect(airport.runways).toEqual([
        { ident: "10/28", lengthMeters: 4000, widthMeters: 45 },
        { ident: "15/33", lengthMeters: 3180, widthMeters: 47 },
      ]);
    });

    it("aceita aeródromo sem cidade, UF, coordenadas e pistas", () => {
      const parser = new RotaerParser();

      const airport = parser.parseAirport(fixture("rotaer-minimo.xml"));

      expect(airport.icao).toBe("SWXX");
      expect(airport.name).toBe("Fazenda Sem Cadastro");
      expect(airport.city).toBeNull();
      expect(airport.state).toBeNull();
      expect(airport.latitude).toBeNull();
      expect(airport.longitude).toBeNull();
      expect(airport.runways).toEqual([]);
    });

    it("recorre às coordenadas sexagesimais quando o par decimal falta", () => {
      const parser = new RotaerParser();

      const airport = parser.parseAirport(fixture("rotaer-sexagesimal.xml"));

      // 23 37 34S → -(23 + 37/60 + 34/3600); 046 39 22W → -(46 + 39/60 + 22/3600)
      expect(airport.latitude).toBeCloseTo(-23.626111, 5);
      expect(airport.longitude).toBeCloseTo(-46.656111, 5);
    });

    it("deduplica pistas repetidas mantendo a de maior comprimento", () => {
      const parser = new RotaerParser();

      // Caso real (SNAO): a fonte publica `09/27` duas vezes, uma com 24 m e
      // outra com 1295 m. Sem deduplicar, o unique (icao, ident) derrubaria o
      // aeródromo inteiro na gravação.
      const airport = parser.parseAirport(fixture("rotaer-pistas-duplicadas.xml"));

      expect(airport.runways).toEqual([{ ident: "09/27", lengthMeters: 1295, widthMeters: 28 }]);
    });

    it("mantém a primeira ocorrência quando as duplicatas não têm comprimento", () => {
      const parser = new RotaerParser();
      const xml = `<aisweb><AeroCode>SBXX</AeroCode><name>X</name><runways>
        <runway><ident>10/28</ident><width>30</width></runway>
        <runway><ident>10/28</ident><width>45</width></runway>
      </runways></aisweb>`;

      const airport = parser.parseAirport(xml);

      expect(airport.runways).toEqual([{ ident: "10/28", lengthMeters: null, widthMeters: 30 }]);
    });

    it("preserva pistas distintas do mesmo aeródromo", () => {
      const parser = new RotaerParser();

      const airport = parser.parseAirport(fixture("rotaer-sbgl.xml"));

      expect(airport.runways.map((runway) => runway.ident)).toEqual(["10/28", "15/33"]);
    });

    it("distingue envelope vazio de resposta malformada", () => {
      const parser = new RotaerParser();

      // Observado na coleta real: aeródromos da listagem sem detalhamento.
      expect(() => parser.parseAirport("<aisweb>\n  \n</aisweb>")).toThrow(PermanentSourceError);
      expect(() => parser.parseAirport("<aisweb>\n  \n</aisweb>")).toThrow(/resposta vazia/);
    });

    it("trata ausência de AeroCode como erro definitivo", () => {
      const parser = new RotaerParser();

      expect(() => parser.parseAirport("<aisweb><name>Sem código</name></aisweb>")).toThrow(
        PermanentSourceError,
      );
    });

    it("trata ausência de name como erro definitivo", () => {
      const parser = new RotaerParser();

      expect(() => parser.parseAirport("<aisweb><AeroCode>SBGL</AeroCode></aisweb>")).toThrow(
        PermanentSourceError,
      );
    });
  });
});

describe("ChartsParser", () => {
  it("lê id, nome, tipo, amdt por carta e desescapa o link", () => {
    const parser = new ChartsParser();

    const charts = parser.parse(fixture("cartas-sbgl.xml"), "SBGL");

    expect(charts).toHaveLength(7);
    const [first] = charts;
    expect(first).toEqual({
      id: "e0d1c9f2-6564-4465-8f57eb1708fa53f1",
      airportIcao: "SBGL",
      name: "RNP Y RWY 28",
      type: "IAC",
      amendment: "2601A1",
      link: "https://aisweb.decea.gov.br/download/?arquivo=e0d1c9f2&apikey=1234567890",
    });
  });

  it("usa o <amdt> de cada carta, não o atributo emenda do envelope", () => {
    const parser = new ChartsParser();

    const charts = parser.parse(fixture("cartas-sbgl.xml"), "SBGL");

    const amendments = charts.map((chart) => chart.amendment);
    expect(amendments).toContain("2601A1");
    expect(amendments).toContain("2512A1");
    // A data AIRAC do envelope nunca vira emenda de carta.
    expect(amendments).not.toContain("2026-08-06");
  });

  it("aceita carta sem emenda com amendment nulo", () => {
    const parser = new ChartsParser();

    const charts = parser.parse(fixture("cartas-sbgl.xml"), "SBGL");

    const withoutAmendment = charts.find((chart) => chart.type === "AOC");
    expect(withoutAmendment?.amendment).toBeNull();
  });

  it("aceita aeródromo sem cartas", () => {
    const parser = new ChartsParser();

    expect(parser.parse(fixture("cartas-vazio.xml"), "SBGL")).toEqual([]);
  });

  it("trata total divergente da contagem de itens como falha retentável", () => {
    const parser = new ChartsParser();

    expect(() => parser.parse(fixture("cartas-truncado.xml"), "SBGL")).toThrow(
      RetryableSourceError,
    );
  });

  it("trata carta sem id, nome ou tipo como erro definitivo", () => {
    const parser = new ChartsParser();
    const xml = `<aisweb><cartas total="1"><item><id>abc</id><nome><![CDATA[X]]></nome></item></cartas></aisweb>`;

    expect(() => parser.parse(xml, "SBGL")).toThrow(PermanentSourceError);
  });

  it("rejeita XML malformado como erro definitivo", () => {
    const parser = new ChartsParser();

    expect(() => parser.parse("<aisweb><cartas", "SBGL")).toThrow(PermanentSourceError);
  });
});
