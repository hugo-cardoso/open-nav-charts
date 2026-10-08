import { RetryableSourceError } from "@open-nav-charts/aisweb-client";
import { describe, expect, it } from "vitest";
import { chart, FakeAisWebClient, FakeChartStorage, pdfBytes } from "../../testing/doubles.js";
import { ChartArchiver } from "./chart-archiver.js";

const signal = new AbortController().signal;

function archiverWith(options: ConstructorParameters<typeof FakeAisWebClient>[0] = {}) {
  const client = new FakeAisWebClient(options);
  const storage = new FakeChartStorage();
  return { client, storage, archiver: new ChartArchiver({ client, storage }) };
}

describe("ChartArchiver", () => {
  it("com as chaves do bucket carregadas, confere pertinência sem consultar o bucket", async () => {
    const { archiver, storage, client } = archiverWith();
    storage.objects.set("SBGL/c1.pdf", pdfBytes());
    await archiver.listArchivedKeys();

    const outcome = await archiver.archive(chart({ id: "c1" }), signal);

    expect(outcome).toEqual({ status: "already-present", key: "SBGL/c1.pdf" });
    expect(storage.existsCalls).toBe(0);
    expect(client.downloadedCharts).toEqual([]);
  });

  it("baixa e envia a carta cuja chave não está no bucket", async () => {
    const { archiver, storage, client } = archiverWith();
    await archiver.listArchivedKeys();

    const outcome = await archiver.archive(chart({ id: "c1" }), signal);

    expect(outcome).toEqual({ status: "archived", key: "SBGL/c1.pdf" });
    expect(client.downloadedCharts).toEqual(["c1"]);
    expect(storage.putKeys).toEqual(["SBGL/c1.pdf"]);
    expect(storage.existsCalls).toBe(0);
  });

  it("não baixa duas vezes a mesma carta na mesma execução", async () => {
    const { archiver, client } = archiverWith();
    await archiver.listArchivedKeys();

    await archiver.archive(chart({ id: "c1" }), signal);
    const second = await archiver.archive(chart({ id: "c1" }), signal);

    expect(second.status).toBe("already-present");
    expect(client.downloadedCharts).toEqual(["c1"]);
  });

  it("sem as chaves carregadas, recorre à verificação de existência", async () => {
    const { archiver, storage } = archiverWith();
    storage.objects.set("SBGL/c1.pdf", pdfBytes());

    const outcome = await archiver.archive(chart({ id: "c1" }), signal);

    expect(outcome.status).toBe("already-present");
    expect(storage.existsCalls).toBe(1);
  });

  it("propaga a falha retentável do download, que é do aeródromo inteiro", async () => {
    const { archiver } = archiverWith({
      documents: {
        c1: () => {
          throw new RetryableSourceError("timeout");
        },
      },
    });
    await archiver.listArchivedKeys();

    await expect(archiver.archive(chart({ id: "c1" }), signal)).rejects.toBeInstanceOf(
      RetryableSourceError,
    );
  });

  it("trata PDF inválido como falha só da carta", async () => {
    const { archiver, storage } = archiverWith({
      documents: { c1: () => new TextEncoder().encode("<html>erro</html>") },
    });
    await archiver.listArchivedKeys();

    const outcome = await archiver.archive(chart({ id: "c1" }), signal);

    expect(outcome.status).toBe("failed");
    expect(storage.putKeys).toEqual([]);
  });
});
