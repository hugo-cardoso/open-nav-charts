# open-nav-charts-v2

Monorepo para cartas náuticas abertas.

## Requisitos

| Ferramenta | Versão | Como fixamos |
| ---------- | ------ | ------------ |
| Node.js    | 22     | `.nvmrc` e `engines.node` em cada pacote |
| pnpm       | 9.9.0  | campo `packageManager` (via Corepack) |
| Docker     | qualquer | Apenas para o ambiente local e os testes de integração |

`pnpm` é o único gerenciador de pacotes suportado. `npm install` e `yarn install` são bloqueados, e
os lockfiles correspondentes não são versionados.

## Instalação

```bash
nvm use          # lê o .nvmrc -> Node 22
corepack enable  # apenas na primeira vez
pnpm install
```

Um único comando basta — não há passos manuais adicionais. Se a versão de Node não for a 22,
a instalação falha explicitamente em vez de continuar com aviso.

## Comandos

Todos são executados a partir da raiz e cobrem todos os pacotes do workspace.

| Comando | O que faz |
| ------- | --------- |
| `pnpm check` | Portão completo de pré-merge: lint, build, tipos e testes, em sequência |
| `pnpm lint` | Verifica lint e formatação sem escrever arquivos |
| `pnpm lint:fix` | Aplica as correções automatizáveis de lint e formatação |
| `pnpm format` | Aplica apenas formatação |
| `pnpm typecheck` | Verifica os tipos de todos os pacotes |
| `pnpm test` | Corre a suíte unitária de todos os pacotes — sem rede e sem Docker |
| `pnpm test:integration` | Corre os testes de integração — **exige Docker** |
| `pnpm test:watch` | Reexecuta os testes ao detectar alterações |
| `pnpm test:coverage` | Corre os testes gerando relatório de cobertura |
| `pnpm build` | Compila todos os pacotes, por ordem de dependência |

Antes de abrir uma alteração, rode `pnpm check`. Ele aborta no primeiro portão que falhar.

### Trabalhar num pacote isolado

```bash
pnpm --filter @open-nav-charts/<nome> test
pnpm --filter @open-nav-charts/<nome> test:watch
pnpm --filter @open-nav-charts/<nome> build
```

## Estrutura

```text
apps/
├── jobs/                 @open-nav-charts/jobs — host de rotinas operacionais (CLI)
└── api/                  @open-nav-charts/api — API REST somente leitura do acervo (Express)
packages/
├── domain/               @open-nav-charts/domain — entidades e persistência (Drizzle + PostgreSQL)
├── aisweb-client/        @open-nav-charts/aisweb-client — cliente da API AISWEB do DECEA
└── object-storage/       @open-nav-charts/object-storage — bucket compatível com S3
```

A API REST consome dois pacotes: `domain`, para ler o acervo, e `object-storage`, para assinar
a URL temporária do PDF na rota da carta — a assinatura precisa do cliente S3, que por decisão
de encapsulamento não sai desse pacote. O cliente do DECEA fica fora da sua superfície.

A configuração é herdada de cima para baixo, nunca lateralmente entre pacotes:

| Arquivo na raiz | Responsabilidade |
| ---------------- | ---------------- |
| `biome.json` | Lint e formatação de toda a árvore |
| `tsconfig.base.json` | Flags de TypeScript, estendidas por cada pacote |
| `vitest.shared.ts` | Configuração base de testes |

Por isso um pacote novo fica coberto pelos três portões sem alterar nada na raiz.

## Ambiente local e execução da rotina de coleta

A rotina `decea-crawler` coleta os aeródromos, as cartas IFR e os documentos PDF publicados pela
API AISWEB do DECEA. Precisa de um PostgreSQL e de um bucket compatível com S3 — ambos sobem
com um comando.

### 1. Subir a infraestrutura

```bash
docker compose up -d
```

Sobe PostgreSQL 17 (porta 5432) e MinIO (API em 9000, console em 9001, `minioadmin`/`minioadmin`),
e cria o bucket `onc-charts`. Nada mais precisa de ser instalado na máquina.

### 2. Configurar as variáveis de ambiente

```bash
cp .env.example .env
```

Os valores já apontam para os contêineres acima; só as credenciais da fonte ficam em branco e
têm de ser preenchidas — são pedidas no portal do DECEA.

| Variável | Exemplo | Uso |
| -------- | ------- | --- |
| `AISWEB_API_KEY` | `1234567890` | Credencial da AISWEB |
| `AISWEB_API_PASS` | `abcdef` | Credencial da AISWEB |
| `DATABASE_URL` | `postgres://onc:onc@localhost:5432/onc` | PostgreSQL |
| `S3_ENDPOINT` | `http://localhost:9000` | MinIO local / `https://storage.railway.app` |
| `S3_REGION` | `us-east-1` / `auto` | Região do bucket |
| `S3_ACCESS_KEY_ID` | `minioadmin` | Credencial do bucket |
| `S3_SECRET_ACCESS_KEY` | `minioadmin` | Credencial do bucket |
| `S3_BUCKET` | `onc-charts` | Nome do bucket |
| `S3_FORCE_PATH_STYLE` | `true` local / `false` Railway | Estilo de URL do S3 |
| `API_PORT` | `3000` | Porta de escuta da API REST — opcional, padrão `3000` |
| `API_LOG_LEVEL` | `info` | Verbosidade dos logs da API — opcional, padrão `info` |

Todas as da rotina são obrigatórias. Se faltar alguma, a rotina termina antes de coletar seja o
que for, listando **todas** as que faltam de uma vez. O arquivo `.env` nunca é versionado. As
duas últimas pertencem apenas à API REST e têm padrão; as credenciais da AISWEB, por sua vez,
não são lidas pela API.

### 3. Executar a rotina

```bash
pnpm --filter @open-nav-charts/jobs start decea-crawler
```

As migrações do banco de dados são aplicadas automaticamente na inicialização.

| Opção | Padrão | Finalidade |
| ----- | ------ | ---------- |
| `--page-size <n>` | `100` | Tamanho da página do catálogo |
| `--concurrency <n>` | `4` | Aeródromos processados em simultâneo |
| `--max-attempts <n>` | `3` | Tentativas por aeródromo |
| `--skip-documents` | desligado | Coleta metadados sem descarregar os PDFs |
| `--only <ICAO,ICAO>` | — | Restringe a varredura aos ICAOs indicados |

```bash
# Verificação rápida contra um aeródromo conhecido
pnpm --filter @open-nav-charts/jobs start decea-crawler --only SBGL

# Apenas metadados, sem tocar no bucket
pnpm --filter @open-nav-charts/jobs start decea-crawler --skip-documents
```

A rotina é idempotente: reexecutar não duplica aeródromos, cartas nem objetos no bucket, o que
torna seguro interromper com `Ctrl+C` e recomeçar depois. Na interrupção nenhum aeródromo novo
é iniciado, os em curso terminam e o resumo parcial é impresso.

### Códigos de saída

| Código | Significado |
| ------ | ----------- |
| `0` | Concluída sem falhas definitivas |
| `1` | Concluída, mas com pelo menos uma falha definitiva |
| `2` | Não arrancou: configuração ausente ou inválida |
| `3` | Abortada: credencial da fonte rejeitada ou dependência indisponível |
| `130` | Interrompida pelo operador |

### Inspecionar o resultado

```bash
# Aeródromos e cartas persistidos
docker exec -it onc-postgres psql -U onc -d onc -c "select count(*) from airport"
docker exec -it onc-postgres psql -U onc -d onc -c "select count(*) from airport_procedure"
```

Os documentos ficam no bucket em `<ICAO>/<id da carta>.pdf` e podem ser vistos no console do
MinIO em <http://localhost:9001>.

### Encerrar o ambiente

```bash
docker compose down     # mantém os dados
docker compose down -v  # apaga banco de dados e bucket
```

## API REST

`apps/api` publica o acervo em HTTP, **somente leitura**: nenhuma rota de escrita e nenhuma
autenticação. Quem alimenta o acervo é a rotina de coleta acima.

### Subir

```bash
pnpm --filter @open-nav-charts/api start
```

Usa `DATABASE_URL` e as variáveis `S3_*` do `.env`, mais `API_PORT` e `API_LOG_LEVEL`. Faltando
variável obrigatória, o processo não sobe e lista **todas** as ausências de uma vez. Em
`SIGTERM`/`SIGINT` as requisições em curso terminam antes do encerramento.

As migrações **não** são aplicadas pela API — aplique-as pela rotina de coleta ou por
`pnpm --filter @open-nav-charts/domain migrate`.

### Endpoints

| Rota | O que devolve |
| ---- | ------------- |
| `GET /v1/airports` | Catálogo paginado; `page`, `pageSize` (máx. 100), `state`, `search` |
| `GET /v1/airports/:icao` | Detalhe do aeródromo, com as pistas |
| `GET /v1/airports/:icao/procedures` | Cartas do aeródromo, com `hasChart`; filtro `type` |
| `GET /v1/airports/:icao/procedures/:id/chart` | `302` para o PDF em URL assinada, válida por 5 min |
| `GET /health` | `200` `ok` / `503` `degraded`; fora da limitação de taxa |
| `GET /docs` | O contrato completo, em JSON |

```bash
curl -s "http://localhost:3000/v1/airports?search=galeao" | jq   # busca ignora acento e caixa
curl -s "http://localhost:3000/v1/airports/sbgl" | jq            # ICAO em qualquer caixa
curl -sL "http://localhost:3000/v1/airports/SBGL/procedures/<id>/chart" -o carta.pdf
```

A rota da carta **não** transporta o PDF: ela devolve `302` para uma URL assinada do bucket, o
que torna o custo de servir uma carta independente do tamanho do arquivo. Toda falha responde no
mesmo envelope `{ "error": { "code", "message" } }`, com limite de 120 requisições por minuto e
por IP.

## Criar um pacote novo

1. Crie o diretório em `packages/<nome>` (biblioteca) ou `apps/<nome>` (aplicação).
2. Siga a estrutura descrita no contrato de pacote referenciado abaixo.
3. Dê-lhe o nome `@open-nav-charts/<nome>`, igual ao nome do diretório.
4. Faça o `tsconfig.json` estender `../../tsconfig.base.json` e o `vitest.config.ts` reexportar
   `../../vitest.shared.js`.
5. Declare os scripts obrigatórios: `build`, `typecheck`, `test`, `test:watch`, `test:coverage`.
6. Para depender de outro pacote do workspace, use o protocolo `workspace:*`.
7. Rode `pnpm install` e depois `pnpm check`.

O checklist completo de conformidade está em
[`specs/001-monorepo-skeleton/contracts/package-structure.md`](specs/001-monorepo-skeleton/contracts/package-structure.md).

### Fronteiras entre pacotes

Importe sempre pelo nome do pacote, nunca por caminho relativo que atravesse a fronteira do
workspace:

```ts
import { algo } from "@open-nav-charts/domain"; // correto
import { algo } from "../../packages/domain/src/index.js"; // proibido
```

A superfície pública de um pacote é exatamente o que está declarado no campo `exports`.

## Convenções

- **Branches**: GitFlow. `main` é produção e `develop` é a linha de integração; trabalho novo
  sai de `develop` numa branch `feature/<nome>` e volta para lá. `release/*` sai de `develop`
  e `hotfix/*` sai de `main` — ambas entram em `main` **e** em `develop`.
- **Commits**: Conventional Commits com descrição em português — `feat(core): adiciona projeção mercator`
- **Testes**: Vitest, arquivos `*.test.ts` ao lado do código que cobrem
- **Estilo**: aplicado por Biome; não formate à mão contra a configuração

As regras completas estão na [constituição do projeto](.specify/memory/constitution.md).
