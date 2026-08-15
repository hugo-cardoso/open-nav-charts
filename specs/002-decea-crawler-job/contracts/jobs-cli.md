# Contrato exposto — CLI de rotinas (`apps/jobs`)

**Tipo**: interface exposta ao operador humano. É o contrato que a spec exige em FR-001, FR-002 e
FR-003.

**Binário**: `open-nav-charts-jobs`
**Execução no repositório**: `pnpm --filter @open-nav-charts/jobs start <rotina> [opções]`

---

## Superfície de comandos

```text
open-nav-charts-jobs <rotina> [opções]
open-nav-charts-jobs --help
open-nav-charts-jobs --version
```

| Comando | Descrição |
|---------|-----------|
| `decea-crawler` | Coleta aeródromos, cartas IFR e documentos do DECEA |
| `--help` | Lista as rotinas registradas |

A lista de rotinas é montada a partir de um registro. Adicionar uma rotina é registrar uma
implementação de `Job` — nenhuma rotina existente é alterada (FR-003).

---

## Contrato de uma rotina

Toda rotina é uma **classe** que implementa esta interface — o ponto de extensão do host.
Dependências entram pelo construtor; a rotina não constrói seus próprios colaboradores.

```ts
export interface Job {
  /** Nome do subcomando. Único no registro. */
  readonly name: string;
  /** Descrição exibida no --help. */
  readonly description: string;
  /** Executa a rotina e devolve o relatório do que foi feito. */
  run(signal: AbortSignal): Promise<RunReport>;
}
```

Exemplo da forma exigida — colaboradores recebidos por construtor, todos como interface:

```ts
export class DeceaCrawlerJob implements Job {
  readonly name = "decea-crawler";
  readonly description = "Coleta aeródromos, cartas IFR e documentos do DECEA";

  constructor(
    readonly #client: AisWebClient,
    readonly #processAirport: ProcessAirport,
    readonly #retry: RetryPolicy,
    readonly #progress: ProgressReporter,
    readonly #options: CrawlerOptions,
  ) {}

  async run(signal: AbortSignal): Promise<RunReport> { /* … */ }
}
```

`RunReport` é uma classe que acumula os totais e as falhas do resumo final (FR-026, FR-027),
com estado encapsulado e leitura imutável.

**Registrar uma rotina nova** é instanciá-la na raiz de composição e adicioná-la ao
`JobRegistry` — nenhuma rotina existente é tocada (FR-003).

---

## Rotina `decea-crawler`

```text
open-nav-charts-jobs decea-crawler [--page-size <n>] [--concurrency <n>]
                                   [--max-attempts <n>] [--skip-documents]
                                   [--only <ICAO,ICAO>]
```

| Opção | Padrão | Finalidade |
|-------|--------|-----------|
| `--page-size` | `100` | Tamanho da página (FR-007) |
| `--concurrency` | `4` | Aeródromos simultâneos (FR-023) |
| `--max-attempts` | `3` | Tentativas por aeródromo (FR-021) |
| `--skip-documents` | desligado | Coleta metadados sem baixar PDFs |
| `--only` | — | Restringe a ICAOs específicos |

Os padrões são exatamente os valores exigidos pela spec; as opções existem para diagnóstico e para
tornar as histórias testáveis de forma independente. `--skip-documents` é o que viabiliza o
*Independent Test* da História 2, e `--only` encurta o ciclo de verificação manual.

---

## Configuração por ambiente

Validada na inicialização, antes de qualquer coleta. Todas são obrigatórias (FR-004, FR-005).

| Variável | Exemplo | Uso |
|----------|---------|-----|
| `AISWEB_API_KEY` | `1234567890` | Credencial da fonte |
| `AISWEB_API_PASS` | `abcdef` | Credencial da fonte |
| `DATABASE_URL` | `postgres://onc:onc@localhost:5432/onc` | PostgreSQL |
| `S3_ENDPOINT` | `http://localhost:9000` | MinIO local / `https://storage.railway.app` |
| `S3_REGION` | `us-east-1` / `auto` | Região |
| `S3_ACCESS_KEY_ID` | `minioadmin` | Credencial do bucket |
| `S3_SECRET_ACCESS_KEY` | `minioadmin` | Credencial do bucket |
| `S3_BUCKET` | `onc-charts` | Nome do bucket |
| `S3_FORCE_PATH_STYLE` | `true` local / `false` Railway | Estilo de URL (ver research R6) |

---

## Saída — progresso

Emitida continuamente durante a execução (FR-025), permitindo localizar o ponto da varredura sem
consultar o banco.

```text
[decea-crawler] Iniciando. 4550 aeródromos em 46 páginas, 4 simultâneos.
[decea-crawler] Página 1/46 iniciada.
[decea-crawler] SBGR  Guarulhos                     12 cartas  ok
[decea-crawler] SBSP  Congonhas                      8 cartas  ok
[decea-crawler] SBXX  ---                            tentativa 2/3: timeout
[decea-crawler] SBXX  ---                            FALHA: timeout após 3 tentativas
[decea-crawler] Página 1/46 concluída em 34s.
```

---

## Saída — resumo final

Sempre emitido ao término (FR-026, FR-027).

```text
[decea-crawler] Resumo
  Aeródromos processados : 4550
    sucesso              : 4548
    falha                : 2
  Cartas persistidas     : 31204
  Documentos arquivados  : 1145
  Documentos já existentes: 30059
  Documentos removidos   : 12
  Duração                : 41m18s

  Falhas:
    SBXX — timeout ao detalhar aeródromo, após 3 tentativas
    SBYY — carta 98765: conteúdo baixado não é um PDF
```

---

## Códigos de saída

Distinguem execução limpa de execução com falhas, viabilizando automação futura (FR-028).

| Código | Significado |
|--------|-------------|
| `0` | Concluída sem falhas definitivas |
| `1` | Concluída, mas com ao menos uma falha definitiva |
| `2` | Não iniciou: configuração ausente ou inválida (FR-005) |
| `3` | Abortada: credencial da fonte rejeitada (401/403) ou dependência indisponível |
| `130` | Interrompida pelo operador (SIGINT) |

Separar `1` de `2`/`3` importa: `1` é um resultado com dado coletado, enquanto `2` e `3` significam
que nada foi feito e a causa é de ambiente, não da fonte.

---

## Interrupção

`SIGINT`/`SIGTERM` acionam o `AbortSignal` da rotina: nenhum novo aeródromo é iniciado, os em curso
terminam, o resumo parcial é impresso e o código `130` é retornado. Como todas as gravações são
idempotentes, uma nova execução simplesmente refaz o pendente (FR-024).
