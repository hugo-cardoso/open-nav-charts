# Rotina `decea-crawler`

Coleta da API AISWEB do DECEA todos os aeródromos do tipo `AD`, enriquece cada um com coordenadas
e pistas, coleta as cartas IFR dele e arquiva os PDFs correspondentes em um bucket compatível com S3.

Desde a feature 007 a coleta é **incremental**: catálogo e cartas chegam em duas consultas em lote,
e só os aeródromos que mudaram na fonte — ou cujas pistas precisam ser revalidadas — geram trabalho.
Desenho completo em [`specs/007-decea-crawler-optimization/`](../../../../../specs/007-decea-crawler-optimization/).

Documentação do host, configuração e códigos de saída: [`apps/jobs/README.md`](../../../README.md).

---

## Utilização

```bash
pnpm --filter @open-nav-charts/jobs start decea-crawler [opções]
```

### Opções

| Opção | Padrão | Finalidade |
| ----- | ------ | ---------- |
| `--page-size <n>` | `5000` | Itens por página do catálogo; o padrão cobre o catálogo inteiro numa página |
| `--concurrency <n>` | `4` | Aeródromos processados em simultâneo — e, portanto, requisições simultâneas à fonte |
| `--max-attempts <n>` | `3` | Tentativas por aeródromo e por consulta em lote antes de desistir |
| `--skip-documents` | desligado | Coleta metadados sem baixar os PDFs nem listar o bucket |
| `--only <ICAO,ICAO>` | — | Restringe a gravação aos ICAOs indicados e sempre revalida as pistas deles |
| `--force` | desligado | Ignora o atalho: revalida as pistas de todos e grava o que diferir |
| `--revalidation-days <n>` | `7` | Idade a partir da qual as pistas de um aeródromo vencem |
| `--revalidation-budget <n>` | `1000` | Máximo de aeródromos revalidados **por idade** numa execução |

Os padrões são os valores de produção. As opções existem para diagnóstico e para encurtar o ciclo
de verificação manual — não para afinar desempenho: subir `--concurrency` acima de 4 pressiona a
fonte e arrisca limitação de taxa.

### Receitas

```bash
# Varredura completa (o modo de produção)
pnpm --filter @open-nav-charts/jobs start decea-crawler

# Verificação rápida contra um aeródromo conhecido
pnpm --filter @open-nav-charts/jobs start decea-crawler --only SBGL

# Só metadados: não toca no bucket
pnpm --filter @open-nav-charts/jobs start decea-crawler --skip-documents

# Suspeita de inconsistência: revalidar tudo, sem atalho
pnpm --filter @open-nav-charts/jobs start decea-crawler --force

# Investigar um conjunto específico, sem concorrência para a saída ficar legível
pnpm --filter @open-nav-charts/jobs start decea-crawler --only SBGR,SBSP --concurrency 1
```

---

## O que faz, passo a passo

```text
1. Em paralelo, cada consulta à fonte envolvida em RetryPolicy:
     listAirports(0, 5000)        catálogo AD inteiro, já com nome, cidade, UF e coordenadas
     fetchIfrChartCatalog()       todas as cartas IFR + lastupdate + emenda (AIRAC)
     snapshots.loadAll()          o que está na base: aeródromos, pistas, cartas, revalidação
     archiver.listArchivedKeys()  as chaves do bucket, numa listagem só
2. syncState.observe()            registra desde quando o par lastupdate/AIRAC vale
3. planSync()                     função pura: para cada aeródromo, inalterado | gravar | revalidar pistas
4. fila única, 4 em simultâneo:   ProcessAirport.execute() só para quem tem trabalho
5. markRunwaysChecked()           em lote, as revalidações que não mudaram nada
6. resumo final
```

`DeceaCrawlerJob` cuida da **varredura** (leituras em lote, plano e fila); `planSync` cuida da
**decisão**; `ProcessAirport` cuida de **um aeródromo**. Essa divisão é o que permite à política de
tentativas envolver o caso de uso inteiro sem que ele saiba que está sendo repetido. Sem o catálogo
ou sem o lote de cartas não há decisão segura: a falha deles encerra a execução sem gravar nada.

### O atalho: quem entra na fila

Um aeródromo é **gravado** quando o publicado difere do persistido — cadastro, cartas (incluídas,
alteradas ou retiradas) ou documento ausente do bucket. A comparação ignora o que é registro da
coleta (`archived_at`, `updated_at`) e arredonda as coordenadas da fonte às 6 casas do banco; sem
isso, toda execução acusaria mudança.

As **pistas** são o único dado que o catálogo em lote não traz, então o detalhamento só é
consultado quando elas estão pendentes, nesta ordem de precedência:

| Motivo | Quando |
| ------ | ------ |
| `pedidos` | `--force`, ou o ICAO está em `--only` |
| `novos` | O aeródromo ainda não está na base |
| `pendentes` | Nunca houve coleta bem-sucedida das pistas |
| `ROTAER` | O `<dt>` do registro do aeródromo mudou desde a última coleta |
| `AIRAC` | O par `lastupdate`/`emenda` do lote de cartas mudou depois da última coleta |
| `idade` | A última coleta tem mais de `--revalidation-days`; no máximo `--revalidation-budget` por execução, os mais antigos primeiro |

O orçamento existe porque, sem ele, os aeródromos coletados juntos venceriam juntos dias depois. A
comparação com o **momento** em que o par AIRAC foi observado — e não com "mudou nesta execução?" —
é o que mantém pendente quem falhou ou ficou para trás numa execução interrompida.

### O aeródromo é a unidade atômica de repetição

Uma falha em qualquer etapa reexecuta o **aeródromo inteiro**, até 3 tentativas. É seguro porque
cada etapa é idempotente: upsert por ICAO, upsert por id de carta, upload por chave determinística.
Repetir não duplica.

### Ordem de gravação dentro de `ProcessAirport`

Base de dados e bucket não compartilham transação, então a ordem é escolhida para que qualquer
falha degrade para um estado inofensivo e autocorrigível:

1. **Arquivar** no bucket os documentos ainda não arquivados;
2. **Uma transação**: upsert do aeródromo, substituição das pistas, *diff* das cartas;
3. **Após o commit**: remover do bucket os objetos das cartas que saíram de vigência.

Falha entre 1 e 2 deixa um objeto órfão no bucket — a execução seguinte sobrescreve-o ou remove-o.
Falha em 3 deixa igualmente um órfão, também limpo depois. A ordem inversa (apagar antes do commit)
produziria o único estado realmente mau: um registro no banco de dados apontando para um documento
que já não existe.

---

## Classificação de erros

Determina o que consome as 3 tentativas e o que falha de imediato:

| Situação | Classe | Efeito |
| -------- | ------ | ------ |
| Timeout, DNS, conexão recusada | Retentável | Nova tentativa com *backoff* |
| HTTP 5xx, HTTP 429 | Retentável | Nova tentativa com *backoff* |
| `total` das cartas divergente da contagem de itens | Retentável | Resposta truncada; vale repetir |
| HTTP 4xx (exceto 429) | Definitivo | Aeródromo falho, sem repetir |
| XML malformado ou envelope vazio | Definitivo | Aeródromo falho, sem repetir |
| Campo obrigatório ausente (`AeroCode`, `name`, `id`/`nome`/`tipo` da carta) | Definitivo | Aeródromo falho |
| PDF inválido ou vazio | Definitivo | **A carta** falha; as restantes do aeródromo prosseguem |
| HTTP 401/403 | Abortivo | Encerra a execução inteira com código `3` |

Repetir um `400` só desperdiça tempo e agrava a limitação de taxa — por isso erros definitivos não
consomem tentativas. E 401/403 aborta tudo em vez de marcar 4441 aeródromos como falhos: com
credencial inválida todos falhariam igualmente, e insistir só gera ruído.

O *backoff* é exponencial com *jitter*. Sem o *jitter*, os 4 workers voltariam a bater na fonte em
sincronia após uma falha coletiva.

---

## O que é persistido

| Tabela | Conteúdo | Chave |
| ------ | -------- | ----- |
| `airport` | ICAO, nome, cidade, UF, país, latitude, longitude; e, para a rotina, `runways_checked_at` e `source_updated_on` | `icao` |
| `airport_runway` | Designação da pista, comprimento e largura em metros | `(airport_icao, ident)` único |
| `airport_procedure` | Id, nome, tipo, emenda, URL de origem, chave no bucket, `archived_at` | `id` |
| `source_sync_state` | Último `lastupdate`/`emenda` do lote IFR e desde quando vale (`observed_at`) | `source` |

`runways_checked_at` e `source_updated_on` são estado da coleta, não dado aeronáutico: não entram
na entidade `Airport` nem saem pela API. `archived_at` é o momento em que o documento foi
arquivado — só muda quando a chave muda.

No bucket, um objeto por carta em `<ICAO>/<id da carta>.pdf`, com `Content-Type: application/pdf`.
A chave é derivável, nunca aleatória — é isso que torna o upload idempotente e permite verificar a
existência antes de baixar.

**Campos opcionais ausentes** (cidade, UF, coordenadas) não impedem a gravação: o aeródromo é
persistido com o que há e a ausência entra nos alertas do resumo. Já `name` ausente torna o
aeródromo falho — sem nome o registro não serve para nada.

Latitude e longitude são gravadas **juntas ou nenhuma**: meia coordenada é inútil.

**O país é gravado como código ISO 3166-1 alpha-2** (`BR`), sempre em caixa alta. A fonte não o
informa em campo nenhum: o valor vem da constante `BRAZIL_COUNTRY_CODE` do pacote
`@open-nav-charts/aisweb-client`, porque é uma propriedade da própria fonte — o DECEA cobre
exclusivamente o Brasil, e outra fonte traria outro código. Diferente de cidade, UF e coordenadas,
o país não depende de nada vir preenchido: é gravado em toda coleta, sem condicional.

Aeródromos **nunca são removidos** por esta rotina. A AISWEB não publica lista de aeródromos
extintos, e apagar por ausência arriscaria destruir dados após uma coleta parcial.

---

## Peculiaridades da fonte

Cada uma destas foi descoberta contra respostas reais e tem teste a cobri-la. O contrato completo
está em [`specs/002-decea-crawler-job/contracts/aisweb-api.md`](../../../../../specs/002-decea-crawler-job/contracts/aisweb-api.md).

**O filtro IFR é o parâmetro `especie=IFR`, e só ele.** A resposta não ecoa a espécie consultada, e
o mesmo tipo (`VAC`) existe tanto em IFR como em VFR — nenhum campo permite reclassificar
localmente. Não há refiltro local, e isso é deliberado: uma allow-list descartaria em silêncio
qualquer tipo novo que o DECEA publique.

**A defesa é observabilidade.** A rotina acumula a distribuição de tipos e alerta quando surge um
fora das 13 siglas conhecidas da espécie IFR. A carta é persistida na mesma — a fonte é a
autoridade; o alerta só avisa que a lista de referência envelheceu. Na coleta de 2026-08-15
apareceu `AGMC`, um 14.º tipo ainda por confirmar com o DECEA.

**A emenda da carta é o elemento `<amdt>`, não o atributo `emenda` do envelope.** O atributo é a
data AIRAC do conjunto, igual para todas as cartas; usá-lo gravaria o mesmo valor em todas.

**As coordenadas `<lat>`/`<lng>` já vêm em graus decimais com sinal.** Não há conversão no caminho
principal; `latRotaer`/`lngRotaer` (sexagesimais) servem apenas de recurso se o par decimal faltar.

**A fonte publica pistas repetidas.** Em `SNAO`, `SNCW`, `SSNG` e `SSWN` o mesmo `ident` aparece
duas vezes, uma delas com dimensões espúrias (`09/27` com 24 m e com 1295 m). Como
`(airport_icao, ident)` é único, o parser deduplica mantendo a de maior comprimento — a pista real.
Sem isso, a violação do índice derrubaria o aeródromo inteiro.

**Alguns aeródromos não têm detalhamento.** `SI5J` e `SJZ1` constam na listagem mas a fonte devolve
`<aisweb></aisweb>`. É tratado como falha definitiva: repetir não faz o dado aparecer.

**A paginação usa `Math.ceil`.** Truncar perderia a última página parcial. A leitura do catálogo
também termina em página vazia, o que protege contra um catálogo que mude durante a execução.

As peculiaridades abaixo foram sondadas ao vivo em 2026-10-08 e estão no adendo
[`specs/007-decea-crawler-optimization/contracts/aisweb-api.md`](../../../../../specs/007-decea-crawler-optimization/contracts/aisweb-api.md).

**As cartas IFR vêm todas numa consulta.** `area=cartas&especie=IFR` sem `icaoCode` devolve o
conjunto inteiro (1807 cartas, ~2 MB), cada uma com seu `<IcaoCode>`. `rowstart`/`rowend` são
ignorados nessa consulta. `total` divergente da contagem continua sendo truncamento, e agora aborta
a execução: uma lista incompleta faria cartas parecerem retiradas.

**O catálogo vem inteiro numa página.** Com `rowend=5000`, os 4491 aeródromos chegam numa resposta,
já com nome, cidade, UF e coordenadas iguais às do detalhamento. Só as pistas exigem o detalhamento,
que não aceita vários ICAOs por consulta.

**`lastupdate` é global.** O atributo do envelope de cartas tem o mesmo valor para todo aeródromo,
inclusive os sem carta: indica quando o conjunto IFR mudou, não qual aeródromo. Vem como
`{ts 'AAAA-MM-DD HH:MM:SS'}`, com espaços em volta; formato diferente vale como mudança.

**`<dt>` é a data do registro ROTAER do aeródromo.** Igual na listagem e no detalhamento, varia por
aeródromo (707 deles com `2018-07-19`, a carga inicial) — é o indicador por aeródromo que dispara a
revalidação das pistas (`ROTAER`).

**Há cartas IFR de aeródromos fora do catálogo `AD`.** 32 ICAOs (`SBEN`, `SBWA`…) têm cartas no
lote mas não estão no catálogo; nunca foram coletados e continuam fora da base, contados no resumo.

---

## Arquivos

| Arquivo | Responsabilidade |
| -------- | ---------------- |
| `decea-crawler-job.ts` | A varredura: leituras em lote, plano, fila e limite de concorrência |
| `sync-planner.ts` | A decisão por aeródromo: inalterado, gravar ou revalidar pistas (função pura) |
| `airport-comparison.ts` | Montagem e igualdade entre o publicado e o persistido (funções puras) |
| `process-airport.ts` | Executa o plano de um aeródromo — a unidade atômica de repetição |
| `chart-archiver.ts` | Lista o bucket, baixa, valida e envia o PDF |
| `chart-type-audit.ts` | Acumula a distribuição de tipos e sinaliza os desconhecidos |
| `pagination.ts` | Cálculo de páginas e deslocamentos (funções puras) |
| `procedure-diff.ts` | *Diff* entre as cartas da fonte e as persistidas (função pura) |

---

## Desempenho observado

Medido em 2026-10-08 contra a AISWEB real, a partir de uma máquina local, com banco e bucket do
`docker compose` e os valores padrão (feature 007):

| Cenário | Duração | O que aconteceu |
| ------- | ------- | --------------- |
| Primeira execução após a migração, bucket quase vazio | 5m16s | 4426 pistas revalidadas, 1663 PDFs baixados, 243 aeródromos gravados |
| **Regime estável** (execução seguinte, nada mudou) | **4s** | 4490 de 4491 inalterados, 0 requisições de detalhamento |
| Virada de AIRAC simulada (todas as pistas) | 1m48s | 4490 pistas revalidadas, nada gravado |
| `--force` | 1m48s | Mesmas contagens de antes no banco e no bucket |
| Revalidação por idade com orçamento | 27s | 1000 revalidadas por execução, o resto adiado |
| Um PDF apagado do bucket | 10s | 1 aeródromo gravado, 1 documento baixado de novo |

A linha de base anterior (feature 002, uma consulta de cartas e uma de detalhamento por aeródromo)
era de ~7m30s em produção. O pior caso agora é o da primeira execução — limitada pelo download dos
PDFs, que em produção já estão no bucket — e a virada de AIRAC fica em menos de 2 min.

A única falha recorrente é `SI5J`, que a fonte lista sem detalhamento publicado.
