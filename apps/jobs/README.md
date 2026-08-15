# @open-nav-charts/jobs

Host de rotinas operacionais do open-nav-charts, executáveis por linha de comando.

Uma **rotina** (job) é uma tarefa de manutenção de dados executada sob demanda — coletar de
uma fonte externa, reprocessar, limpar. Cada uma é executável isoladamente e devolve um código de
saída que distingue execução limpa de execução com falhas, o que torna a aplicação automatizável
por cron ou por um agendador externo.

Rotinas disponíveis:

| Rotina | O que faz | Documentação |
| ------ | --------- | ------------ |
| `decea-crawler` | Coleta aeródromos, cartas IFR e documentos PDF do DECEA | [`src/jobs/decea-crawler/`](src/jobs/decea-crawler/README.md) |

---

## Executar

```bash
# A partir da raiz do repositório
pnpm --filter @open-nav-charts/jobs start <rotina> [opções]

# Ajuda: lista as rotinas registradas
pnpm --filter @open-nav-charts/jobs start --help

# Ajuda de uma rotina específica
pnpm --filter @open-nav-charts/jobs start decea-crawler --help
```

O script `start` compila antes de executar (`prestart`), então pega sempre a versão atual do
código. Depois de um `pnpm build`, o binário também pode ser invocado diretamente:

```bash
node --env-file-if-exists=.env apps/jobs/dist/main.js decea-crawler --only SBGL
```

O nome do binário declarado no `package.json` é `open-nav-charts-jobs`.

---

## Pré-requisitos

A aplicação precisa de um PostgreSQL e de um bucket compatível com S3. Ambos sobem com um comando
a partir da raiz do repositório:

```bash
docker compose up -d
```

As migrações da banco de dados são aplicadas **automaticamente na inicialização** de cada execução, então não há passo manual de preparação do esquema. Para aplicá-las sem executar nenhuma rotina:

```bash
pnpm --filter @open-nav-charts/domain migrate
```

---

## Configuração

Toda a configuração vem de variáveis de ambiente, validadas na inicialização **antes de qualquer
coleta**. Copie o modelo e preencha as credenciais da fonte:

```bash
cp .env.example .env
```

| Variável | Exemplo | Uso |
| -------- | ------- | --- |
| `AISWEB_API_KEY` | `1234567890` | Credencial da AISWEB (pedida no portal do DECEA) |
| `AISWEB_API_PASS` | `abcdef` | Credencial da AISWEB |
| `DATABASE_URL` | `postgres://onc:onc@localhost:5432/onc` | PostgreSQL |
| `S3_ENDPOINT` | `http://localhost:9000` | MinIO local / `https://storage.railway.app` |
| `S3_REGION` | `us-east-1` / `auto` | Região do bucket |
| `S3_ACCESS_KEY_ID` | `minioadmin` | Credencial do bucket |
| `S3_SECRET_ACCESS_KEY` | `minioadmin` | Credencial do bucket |
| `S3_BUCKET` | `onc-charts` | Nome do bucket |
| `S3_FORCE_PATH_STYLE` | `true` local / `false` Railway | Estilo de URL do S3 |

**Todas são obrigatórias.** Se faltar alguma, a rotina encerra com código `2` sem processar nada,
listando **todas** as que faltam de uma vez:

```text
Configuração inválida. Corrija as variáveis de ambiente abaixo (ver .env.example):
  - AISWEB_API_KEY: ausente
  - S3_BUCKET: ausente
```

Reportar todas de uma vez é deliberado: descobrir uma variável ausente por execução é um ciclo
frustrante quando são nove.

O `.env` nunca é versionado — apenas o `.env.example`. Nenhuma mensagem de erro imprime o **valor**
de uma variável, só o nome, para que credenciais não vazem em logs.

---

## Códigos de saída

O que permite automatizar a execução sem ler a saída de texto. Um agendador que dispara a rotina
como tarefa efêmera (ex.: cron do Railway) lê o desfecho de forma binária — `0` é sucesso, qualquer
outro código é falha:

| Código | Significado | O agendador vê | Ação típica |
| ------ | ----------- | -------------- | ----------- |
| `0` | Concluída: rodou e persistiu dado, **com ou sem** falhas de itens individuais | sucesso | Nada. Conferir a seção "Falhas" do resumo para inspecionar itens problemáticos |
| `1` | Erro inesperado não tratado | falha | Investigar o log; é um caminho não previsto (bug) |
| `2` | Não arrancou: configuração ausente/inválida, ou rotina inexistente | falha | Corrigir o `.env`; conferir o nome no `--help` |
| `3` | Abortada: credencial da fonte rejeitada (401/403) ou dependência indisponível | falha | Validar credenciais, banco e bucket |
| `130` | Interrompida pelo operador (`Ctrl+C` / `SIGTERM`) | falha | Reexecutar; as gravações são idempotentes |

Uma varredura de milhares de itens quase sempre tem alguma falha isolada — esse é o desfecho
saudável da coleta, então ele sai `0` de propósito. Caso contrário, toda execução normal seria
marcada como falha pelo agendador. A lista de itens que falharam não se perde: continua na seção
"Falhas" do resumo, emitida inclusive quando o código é `0`.

> **Mudança de contrato**: até a versão anterior, "concluída com falhas" saía com código `1`. Agora
> esse desfecho sai `0`, e `1` passou a significar exclusivamente **erro inesperado não tratado**.
> Automações que interpretavam `1` como "concluída com falhas" precisam ser ajustadas. Os códigos
> `2`, `3` e `130` permanecem inalterados.

---

## Interrupção

`Ctrl+C` (`SIGINT`) ou `SIGTERM` acionam um encerramento limpo:

1. Nenhum item novo é iniciado;
2. Os em curso terminam, sem gravação parcial;
3. O resumo parcial é impresso;
4. O pool da banco de dados e o cliente S3 são fechados;
5. O processo sai com `130`.

Como todas as gravações são idempotentes, uma nova execução simplesmente refaz o que ficou
pendente — não há estado de progresso a recuperar.

---

## Saída

### Progresso

Emitido continuamente, para se localizar o ponto da varredura sem consultar a banco de dados:

```text
[decea-crawler] Iniciando. 4441 aeródromos em 45 páginas, 4 simultâneos.
[decea-crawler] Página 1/45 iniciada.
[decea-crawler] SBGR  Guarulhos - Governador André Franco Montoro 62 cartas  ok
[decea-crawler] SBXX  ---                            tentativa 2/3: timeout
[decea-crawler] SBXX  ---                            FALHA: timeout após 3 tentativas
[decea-crawler] Página 1/45 concluída em 34s.
```

### Resumo final

Sempre emitido ao término, inclusive em interrupção:

```text
[decea-crawler] Resumo
  Aeródromos processados : 4441
    sucesso              : 4439
    falha                : 2
  Cartas persistidas     : 1743
  Documentos arquivados  : 1145
  Documentos já existentes: 30059
  Documentos removidos   : 12
  Duração                : 10m12s

  Falhas:
    SI5J — a fonte não publica detalhamento para este aeródromo (resposta vazia)

  Alertas:
    tipos de carta fora das 13 siglas conhecidas da espécie IFR: AGMC
```

**Falhas** são itens que não foram persistidos e merecem investigação. **Alertas** são
observações que não impediram a gravação — o dado está lá, mas algo merece atenção.

---

## Arquitetura

```text
main.ts                        Entrypoint: analisa argumentos e trata sinais
└─ CompositionRoot             Monta o grafo de objetos a partir da configuração
     └─ JobRegistry            Resolve o nome do subcomando → Job
          └─ DeceaCrawlerJob   implements Job
```

| Peça | Responsabilidade |
| ---- | ---------------- |
| `main.ts` | Analisa argumentos (commander), registra os handlers de sinal, mapeia o resultado para código de saída |
| `composition-root.ts` | **Único** ponto que instancia classes concretas; cria e fecha o pool da banco de dados e o cliente S3 |
| `runtime/job.ts` | A interface `Job` — o contrato de uma rotina |
| `runtime/job-registry.ts` | Registo nome → rotina, com rejeição de nome duplicado |
| `runtime/retry-policy.ts` | Repetição com *backoff* exponencial e *jitter*, distinguindo erro retentável de definitivo |
| `runtime/run-report.ts` | Acumula sucessos, falhas e alertas; formata o resumo final |
| `runtime/progress-reporter.ts` | Emite o progresso; o escritor de saída entra por construtor |
| `runtime/exit-code.ts` | Traduz o desfecho da execução para o código de saída |
| `runtime/clock.ts` | Relógio injetado, para o *backoff* ser testável sem esperar de verdade |
| `config/environment-config.ts` | Lê e valida as nove variáveis, agregando todos os erros |

Colaboradores de I/O (fonte externa, banco de dados, bucket, relógio, saída) são sempre consumidos
**por interface** e injetados por construtor. A classe concreta só é nomeada em
`composition-root.ts`. É isto que permite testar cada peça com dublês em memória, sem rede nem
Docker.

---

## Adicionar uma rotina nova

Nenhuma rotina existente é tocada no processo.

**1.** Implemente a interface `Job` em `src/jobs/<nome-da-rotina>/`:

```ts
import type { Job } from "../../runtime/job.js";
import type { RunReport } from "../../runtime/run-report.js";

export class MinhaRotina implements Job {
  readonly name = "minha-rotina";
  readonly description = "O que esta rotina faz";

  // Colaboradores entram por construtor, sempre como interface.
  constructor(private readonly repository: AlgumRepositorio) {}

  async run(signal: AbortSignal): Promise<RunReport> {
    // Verifique `signal.aborted` entre itens para honrar a interrupção.
  }
}
```

**2.** Se a rotina receber opções de linha de comando, acrescente a chave dela em
`JobOptionsByName` (`composition-root.ts`). As chaves são opcionais: só a rotina invocada recebe
opções, as demais são construídas com os padrões delas e nunca chegam a executar.

```ts
export interface JobOptionsByName {
  readonly "decea-crawler"?: CrawlerRunOptions;
  readonly "minha-rotina"?: MinhaRotinaOptions;
}
```

**3.** Instancie-a em `composition-root.ts` e registre-a:

```ts
buildRegistry(progress: ProgressReporter, jobOptions: JobOptionsByName): JobRegistry {
  const registry = new JobRegistry();
  registry.register(
    this.buildDeceaCrawler(jobOptions["decea-crawler"] ?? DEFAULT_CRAWLER_OPTIONS, progress),
  );
  registry.register(new MinhaRotina(this.db().algumRepositorio));
  return registry;
}
```

**4.** Declare o subcomando e as opções dele em `main.ts`, como em `decea-crawler`. O
`action` passa o **nome do próprio subcomando** ao host, que despacha pelo registro:

```ts
program
  .command("minha-rotina")
  .description("O que esta rotina faz")
  .option("--alguma-opcao <n>", "…", positiveInteger("--alguma-opcao"), 10)
  .action(async (options: { algumaOpcao: number }, command: Command) => {
    process.exitCode = await runJob(command.name(), {
      "minha-rotina": { algumaOpcao: options.algumaOpcao },
    });
  });
```

`runJob` não conhece rotina nenhuma: recebe o nome, pede ao registro e trata sinais, resumo e
código de saída de forma genérica. Nenhuma rotina existente é tocada.

**5.** Escreva os testes: unitários com dublês para a lógica, e de integração se a rotina cruzar a
fronteira de um pacote.

Invocar um nome não registrado encerra com código `2` e lista as rotinas disponíveis.

---

## Testes

```bash
# Unitários: sem rede e sem Docker
pnpm --filter @open-nav-charts/jobs test

# Integração: exige Docker (PostgreSQL e MinIO efêmeros via Testcontainers)
pnpm --filter @open-nav-charts/jobs test:integration
```

Os testes de integração vivem em `tests/` e correm a rotina ponta a ponta contra banco de dados e
bucket reais, com a fonte externa substituída por um servidor HTTP local — o que permite exercitar
o caminho completo sem credenciais do DECEA.

Se `pnpm test` falhar numa máquina sem Docker ou sem credenciais, algum teste ganhou dependência
de I/O real e viola o Princípio IV da constituição.

---

## Diagnóstico

| Sintoma | Causa provável | Ação |
| ------- | -------------- | ---- |
| Sai com `2` logo na inicialização | Variável de ambiente ausente | Conferir o `.env` contra o `.env.example` |
| Sai com `3` de imediato | 401/403 da fonte, ou banco de dados/bucket inacessíveis | Validar credenciais e `docker compose ps` |
| `SignatureDoesNotMatch` no MinIO | Estilo de URL do S3 | `S3_FORCE_PATH_STYLE=true` no ambiente local |
| Conexões esgotadas no PostgreSQL | Pool menor que a concorrência | Pool ≥ `--concurrency` |
| A rotina não responde a `Ctrl+C` | Item em curso a terminar | Aguardar; o segundo `Ctrl+C` mata o processo sem resumo |
