/**
 * Progresso contínuo da execução (FR-025), para localizar o ponto da varredura
 * sem consultar o banco.
 */
export interface ProgressReporter {
  jobStarted(totalAirports: number, totalPages: number, concurrency: number): void;
  pageStarted(page: number, totalPages: number): void;
  pageFinished(page: number, totalPages: number, durationMs: number): void;
  airportSucceeded(icao: string, name: string, chartCount: number): void;
  airportRetrying(icao: string, attempt: number, maxAttempts: number, reason: string): void;
  airportFailed(icao: string, reason: string): void;
  interrupted(): void;
  summary(text: string): void;
}

export interface OutputWriter {
  write(line: string): void;
}

const PREFIX = "[decea-crawler]";

export class ConsoleProgressReporter implements ProgressReporter {
  private readonly writer: OutputWriter;

  /** O escritor entra pelo construtor para o teste não capturar stdout global. */
  constructor(writer: OutputWriter) {
    this.writer = writer;
  }

  jobStarted(totalAirports: number, totalPages: number, concurrency: number): void {
    this.writer.write(
      `${PREFIX} Iniciando. ${totalAirports} aeródromos em ${totalPages} páginas, ${concurrency} simultâneos.`,
    );
  }

  pageStarted(page: number, totalPages: number): void {
    this.writer.write(`${PREFIX} Página ${page}/${totalPages} iniciada.`);
  }

  pageFinished(page: number, totalPages: number, durationMs: number): void {
    this.writer.write(
      `${PREFIX} Página ${page}/${totalPages} concluída em ${Math.round(durationMs / 1000)}s.`,
    );
  }

  airportSucceeded(icao: string, name: string, chartCount: number): void {
    this.writer.write(
      `${PREFIX} ${pad(icao, 5)} ${pad(name, 30)} ${String(chartCount).padStart(2)} cartas  ok`,
    );
  }

  airportRetrying(icao: string, attempt: number, maxAttempts: number, reason: string): void {
    this.writer.write(
      `${PREFIX} ${pad(icao, 5)} ${pad("---", 30)} tentativa ${attempt}/${maxAttempts}: ${reason}`,
    );
  }

  airportFailed(icao: string, reason: string): void {
    this.writer.write(`${PREFIX} ${pad(icao, 5)} ${pad("---", 30)} FALHA: ${reason}`);
  }

  interrupted(): void {
    this.writer.write(
      `${PREFIX} Interrupção solicitada. Nenhum aeródromo novo será iniciado; aguardando os em curso.`,
    );
  }

  summary(text: string): void {
    for (const line of text.split("\n")) {
      this.writer.write(line === "" ? "" : `${PREFIX} ${line}`);
    }
  }
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value.padEnd(width);
}
