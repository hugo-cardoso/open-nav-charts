# Research: Otimização do tempo de execução do coletor DECEA

**Feature**: [spec.md](./spec.md) · **Plano**: [plan.md](./plan.md) · **Data**: 2026-10-08

Todas as descobertas sobre a fonte abaixo foram **sondadas ao vivo** contra a AISWEB em
2026-10-08, com as credenciais de produção, a partir de uma máquina local. Os tempos citados são
dessa máquina; os de produção (Railway) são estimados a partir da linha de base de 7 min 30 s.

---

## R1 — O indicador de atualização é global

**Pergunta**: a fonte publica a data da última atualização dos dados de um aeródromo, para
permitir pular os que não mudaram?

**Achado**:

| Consulta | `lastupdate` | `emenda` |
|----------|--------------|----------|
| `area=cartas&icaoCode=SBGL&especie=IFR` | `{ts '2026-09-30 17:35:34'}` | `2026-10-01` |
| `area=cartas&icaoCode=SBSP&especie=IFR` | `{ts '2026-09-30 17:35:34'}` | `2026-10-01` |
| `area=cartas&icaoCode=SDCO&especie=IFR` | `{ts '2026-09-30 17:35:34'}` | `2026-10-01` |
| `area=cartas&icaoCode=SSZW&especie=IFR` (0 cartas) | `{ts '2026-09-30 17:35:34'}` | `2026-10-01` |
| `area=cartas&especie=IFR` (sem aeródromo) | `{ts '2026-09-30 17:35:34'}` | `2026-10-01` |
| `area=cartas&icaoCode=SDCO&especie=VFR` | `{ts '2026-09-22 15:00:04'}` | — |

- O valor é idêntico em todos os aeródromos, inclusive nos sem carta: é o **momento da última
  alteração do conjunto IFR inteiro**, não de um aeródromo. A espécie VFR tem indicador próprio.
- Os atributos vêm com espaços de preenchimento (`emenda="     2026-10-01     "`); o parser já usa
  `trimValues`, mas o teste deve cobrir.
- ~~A listagem do catálogo e o detalhamento trazem `<dt>`, que vale a data da consulta~~ —
  **corrigido na implementação (2026-10-08)**: `<dt>` é a data da última alteração do registro
  ROTAER **de cada aeródromo**. Igual na listagem e no detalhamento, varia por aeródromo (707 com
  `2018-07-19`, a carga inicial; o resto espalhado pelos meses). As três primeiras amostras
  caíram em "hoje" por coincidência. Ver R10.

**Decisão**: o atalho por aeródromo é feito por **comparação de conteúdo** (R4) entre o publicado e
o persistido. O indicador global (`lastupdate` + `emenda`) é registrado e serve só para decidir
**quando revalidar as pistas de todos** (R5), que é o único dado que a consulta em lote não traz.

**Alternativas consideradas**:
- *Pular tudo quando o indicador não muda*: o indicador cobre só as cartas IFR; mudanças de
  cadastro ou de pistas passariam despercebidas indefinidamente. Rejeitada.
- *Usar o indicador por aeródromo (premissa original da spec)*: inviável, ele não existe.

---

## R2 — Cartas IFR em uma única consulta

**Achado**: `area=cartas&especie=IFR` **sem `icaoCode`** devolve todas as cartas IFR — 1.807 itens,
~2 MB, ~4,7 s. Cada `<item>` traz `<IcaoCode>`. `rowstart`/`rowend` são **ignorados** nessa consulta
(com `rowend=5` voltaram as 1.807). O atributo `total` confere com a contagem de itens.

- As cartas cobrem **247 aeródromos**; os outros ~4.244 não têm carta IFR.
- **32 ICAOs com carta não constam no catálogo `type=AD`** (`SBEN`, `SBFS`, `SBLB`, `SBLI`, `SBPW`,
  `SBRC`, `SBWA`…`SBXT`). A rotina atual nunca os coleta, porque só consulta cartas de aeródromos
  do catálogo.

**Decisão**: substituir as ~4.491 consultas de cartas por **uma** consulta em lote, agrupar por ICAO
em memória e **descartar as cartas de ICAOs fora do catálogo**, contabilizando-as no resumo
(preserva o FR-012; além disso, a chave estrangeira `airport_procedure.airport_icao` exige o
aeródromo).

**Conferência de truncamento**: a regra existente (`total` ≠ número de itens ⇒ falha retentável)
continua valendo, agora com peso maior — uma resposta truncada faria cartas parecerem retiradas.
Persistindo a falha após as tentativas, a execução **aborta sem gravar nada** (não há decisão
segura sem a lista completa).

**Alternativas consideradas**: manter uma consulta por aeródromo, só que em paralelo com o
detalhamento — corta metade da latência, mas ainda faz ~4.491 requisições. Rejeitada.

---

## R3 — Catálogo inteiro em uma única consulta

**Achado**: `area=rotaer&type=AD&rowstart=0&rowend=5000` devolve os **4.491** aeródromos em ~6,5 s
(~2 MB). Cada item já traz `AeroCode`, `name`, `city`, `uf`, `lat`, `lng` — os mesmos valores do
detalhamento (conferido em `SBGL`: `-22.81` / `-43.250555555556`, mesmo nome e cidade). Nenhum item
veio sem nome ou coordenada. **Pistas não vêm** na listagem.

- `rowend=500` → 1,5 s; `1000` → 1,9 s; `5000` → 6,5 s. O custo é linear no volume, sem
  penalidade por página grande.
- Consultar várias pistas de uma vez (`icaoCode=SBGL,SBSP`) **não funciona** (resposta sem
  aeródromo) — o detalhamento continua individual.
- `SI5J` e `SJZ1` constam no catálogo, mas continuam com detalhamento vazio.

**Decisão**: a paginação existente é mantida (`Math.ceil`, encerramento em página vazia), com o
**tamanho de página padrão passando de 100 para 5.000** — na prática, uma página. O catálogo
passa a ser a fonte de nome, cidade, UF e coordenadas; o detalhamento fica restrito às pistas.

**Equivalência (FR-012)**: um aeródromo só é gravado depois de ter pistas coletadas com sucesso
pelo menos uma vez. `SI5J`/`SJZ1` (detalhamento vazio) continuam como falha definitiva e fora da
base, exatamente como hoje — embora o catálogo traga dados deles.

**Alternativas consideradas**: manter páginas de 100 — 45 requisições sequenciais (~1,2 s cada)
contra 1 de 6,5 s; nenhum ganho de memória relevante (~2 MB). Rejeitada.

---

## R4 — Comparação de conteúdo como atalho por aeródromo

**Decisão**: carregar do banco, **uma vez por execução**, o retrato do que está persistido
(aeródromos, pistas, cartas e o momento da última coleta de pistas — ~4,5 mil + ~9 mil + ~1,8 mil
linhas, em três consultas) e comparar em memória com o publicado. Uma função pura decide, por
aeródromo, um de três destinos:

| Destino | Quando | Efeito |
|---------|--------|--------|
| **inalterado** | Cadastro e cartas iguais, documentos presentes, pistas não pendentes | Nada é feito |
| **gravar** | Qualquer diferença em cadastro ou cartas, ou documento a arquivar | Arquiva → transação → remove órfãos (ordem da feature 002) |
| **revalidar pistas** | Pistas pendentes (R5) | Consulta o detalhamento; se algo mudou, segue como **gravar**; senão, só marca a revalidação |

Pontos que a comparação precisa respeitar para não acusar falsas diferenças:

- **Coordenadas**: a fonte publica até 12 casas e o banco guarda `numeric(9,6)`. A comparação
  arredonda o valor da fonte para 6 casas — a mesma regra do mapeador — antes de comparar.
- **Textos**: aparados como no parser; `null` e ausente são equivalentes.
- **`archived_at`**: não entra na comparação. Hoje ele é sobrescrito com "agora" em toda execução;
  passa a ser preservado enquanto `storage_key` não mudar, ou seja, passa a significar **quando o
  documento foi arquivado**, que é o que o nome diz. `updated_at` de aeródromo e carta passa
  igualmente a refletir a última mudança real.
- **Pistas**: quando não revalidadas nesta execução, valem as persistidas.

**Alternativas consideradas**:
- *Hash do conteúdo gravado em coluna*: mais uma coluna a manter coerente; a comparação direta é
  barata em memória para este volume. Rejeitada.
- *Upsert com `ON CONFLICT … WHERE` diferente*: empurraria a decisão para o SQL, mas ainda
  custaria uma ida ao banco por aeródromo. Rejeitada.

---

## R5 — Política de revalidação das pistas

Decisão da spec (FR-003/FR-006, opção A): pistas são buscadas de novo quando o indicador das cartas
ou o ciclo AIRAC mudarem, mais uma revalidação periódica de 7 dias.

**Modelo**:

- `source_sync_state` guarda o último `lastupdate` e `emenda` vistos e **`observed_at`**, o
  momento em que esse par foi observado pela primeira vez.
- `airport.runways_checked_at` guarda o momento da última coleta **bem-sucedida** do detalhamento.
- Um aeródromo tem pistas **pendentes** quando:
  1. `runways_checked_at` é nulo (nunca coletado, ou aeródromo novo); **ou**
  2. `runways_checked_at < observed_at` (o conjunto mudou depois da última coleta); **ou**
  3. `runways_checked_at < agora − 7 dias` (revalidação periódica); **ou**
  4. o ICAO foi pedido em `--only`, ou a execução é `--force`.

Comparar com `observed_at`, em vez de "o indicador mudou nesta execução?", é o que torna o modelo
robusto: um aeródromo que falhou, ou não chegou a ser processado por interrupção, continua com
`runways_checked_at` antigo e segue pendente nas execuções seguintes, sem precisar de estado extra.
Por isso o novo par pode ser gravado **logo no início** da execução.

Valor de indicador ilegível ou ausente é gravado como `null` e, sendo diferente do registrado,
conta como mudança (conservador). `null` seguido de `null` não conta.

**Distribuição da revalidação periódica (FR-007)**: os casos 1, 2 e 4 são processados por inteiro.
O caso 3 — e apenas ele — é limitado a um **orçamento por execução** (padrão **1.000**
aeródromos, os de coleta mais antiga primeiro). Sem isso, como todos os aeródromos tiveram as
pistas coletadas na mesma execução, todos venceriam juntos 7 dias depois. Com o orçamento, a
revalidação se espalha sozinha por ~5 execuções e permanece espalhada.

**Estimativa de custo do detalhamento** (único item que escala com o catálogo):

| Origem | Medida | Por detalhamento |
|--------|--------|------------------|
| Local, 2026-10-08 | 5 amostras (`SSZW`, `SNAO`, `SDCO`, `SBCB`, `SWBR`) | 0,31 – 0,55 s |
| Produção, linha de base | 450 s × 4 linhas ÷ 4.441 aeródromos | ~0,4 s para **duas** consultas + banco |

Assumindo ~0,2 s por detalhamento em produção, com 4 simultâneos: orçamento de 1.000 ≈ 50 s;
revalidação total (virada AIRAC, primeira execução ou `--force`) ≈ 4.491 × 0,2 ÷ 4 ≈ **3 min 45 s**.
A medição real é parte do quickstart.

**Alternativas consideradas**:
- *Revalidar todas as pistas em toda execução*: ~3–4 min fixos por execução, sem margem para a
  meta. Rejeitada pela própria decisão da spec.
- *Jitter determinístico por ICAO* (vencimento em 7 dias ± deslocamento): espalha desde o início,
  mas acrescenta uma regra de difícil explicação. O orçamento resolve com um número só.

---

## R6 — Conferência dos documentos arquivados

**Hoje**: um `HeadObject` por carta, em série dentro do aeródromo — ~1.807 requisições ao bucket
por execução.

**Decisão**: listar as chaves do bucket **uma vez** por execução (`ListObjectsV2`, 1.000 chaves por
página ⇒ 2 requisições para ~1.807 objetos) e conferir por pertinência num conjunto em memória.
`ChartStorage` ganha `listKeys(): Promise<ReadonlySet<string>>`; `exists()` continua disponível.

Isso também cobre o caso de borda "documento apagado do bucket à mão": a carta não muda na fonte,
mas a chave some da listagem, o aeródromo cai em **gravar** e o documento é baixado de novo.

**Alternativas consideradas**:
- *Confiar só em `storage_key` do banco*: perderia o caso do documento apagado. Rejeitada.
- *`HeadObject` em paralelo*: ainda 1.807 requisições. Rejeitada.

---

## R7 — Concorrência e ausência de barreira

**Decisão**: depois das consultas em lote e da comparação, os aeródromos com trabalho (destinos
**gravar** ou **revalidar pistas**) entram numa **fila única** atendida por `concurrency` linhas
de trabalho (padrão 4) — sem divisão por página. O `p-limit` sobre a fila inteira já garante que
uma linha livre pegue o próximo item imediatamente (FR-009).

Dentro de um aeródromo, o detalhamento e o download dos PDFs continuam em sequência, então cada
linha tem no máximo uma requisição à fonte em voo: **4 requisições simultâneas, como hoje**
(FR-011). As duas consultas em lote acontecem antes da fila, em paralelo entre si (2 requisições).

A unidade de tentativa continua sendo o aeródromo (detalhamento + documentos + transação), com a
mesma `RetryPolicy`. As consultas em lote têm cada uma a sua própria `RetryPolicy`; falhando
definitivamente, a execução termina como falha sem alterar a base.

**Alternativas consideradas**: subir a concorrência para 8 — dobraria a vazão do detalhamento, mas
a spec mantém o limite para não arriscar limitação de taxa. Fica como alavanca futura, já exposta
em `--concurrency`.

---

## R8 — Orçamento de tempo resultante

Estimativa para produção, regime estável, com execuções diárias:

| Etapa | Requisições | Tempo estimado |
|-------|-------------|----------------|
| Catálogo em lote | 1 | ~7 s |
| Cartas em lote (em paralelo com o catálogo) | 1 | (~5 s, sobreposto) |
| Retrato do banco | 3 consultas | ~1–2 s |
| Listagem do bucket | ~2 | ~1 s |
| Pistas — revalidação periódica (orçamento) | ≤ 1.000 | ≤ ~50 s |
| Aeródromos com mudança real | poucas dezenas | segundos |
| **Total** | | **~1 min** (meta: 5 min) |

| Cenário | Estimativa | Critério |
|---------|-----------|----------|
| Regime estável | ~1 min | SC-001 (≤ 5 min) |
| Virada AIRAC (todas as pistas) | ~4 min | ≤ 5 min desejável; SC-002 (≤ 7 min 30 s) obrigatório |
| `--force` sobre base populada | ~4 min | SC-002 |
| Primeira execução após o deploy (`runways_checked_at` nulo em todos) | ~4 min | equivale a `--force` |

---

## R9 — Medição por etapa

**Decisão**: `RunReport` passa a acumular tempo por etapa (`catalog`, `charts`, `runways`,
`documents`, `database`) e os novos contadores (gravados, inalterados, pistas revalidadas, cartas
fora do catálogo, indicador e ciclo observados). Etapas paralelas somam o tempo de cada linha,
então o resumo informa a **duração total de parede** separadamente. O relógio vem do `Clock`
injetado, mantendo os testes determinísticos (Princípio IV).

---

## R10 — `<dt>`: indicador por aeródromo (descoberto na implementação)

**Achado**: ao recortar as fixtures reais, `SNAO` veio com `<dt>2023-09-14</dt>` e `SI5J` com
`2026-07-30`. Distribuição no catálogo inteiro: 707 aeródromos em `2018-07-19`, os demais
espalhados mês a mês, 31 com a data do dia. O detalhamento traz o mesmo valor.

**Decisão**: `<dt>` vira `AirportCatalogEntry.updatedOn` e é guardado em
`airport.source_updated_on` junto com `runways_checked_at`. Valor diferente do guardado torna as
pistas **pendentes** (motivo `source-updated`, exibido como "ROTAER"), sem orçamento. É um gatilho
**a mais** — a política da opção A (AIRAC + 7 dias) continua valendo como rede de segurança, já
que não há garantia documentada de que toda alteração de pista atualize `<dt>`.

---

## R11 — Host dos links das cartas (descoberto na validação)

**Achado**: os `<link>` das cartas apontam para `aisweb.decea.gov.br`, que em 2026-10-08 não
resolvia no DNS local nem no `8.8.8.8` (resolvia no `1.1.1.1`). `aisweb.decea.mil.br/download/`
responde ao mesmo `arquivo`/`apikey`. Na primeira execução real, toda carta falhou com
`fetch failed` e consumiu as 3 tentativas com *backoff*.

**Decisão**: o cliente tenta o `<link>` e, **só em falha de rede**, recorre à URL derivada do id
no host da API. Erro HTTP do link não troca de URL — o host respondeu. Já existia antes desta
feature; entra aqui porque bloqueava a validação e pode afetar a produção.

---

## Resumo das decisões

| # | Decisão |
|---|---------|
| R1 | Indicador global → só dispara a revalidação de pistas; atalho por comparação de conteúdo |
| R2 | Uma consulta para todas as cartas IFR; cartas de ICAO fora do catálogo descartadas |
| R3 | Catálogo inteiro numa página (padrão 5.000); detalhamento só para pistas |
| R4 | Retrato do banco em memória; destinos inalterado / gravar / revalidar pistas |
| R5 | `observed_at` + `runways_checked_at`; revalidação de 7 dias com orçamento de 1.000 |
| R6 | Uma listagem do bucket por execução no lugar de um `HeadObject` por carta |
| R7 | Fila única sem barreira; 4 requisições simultâneas à fonte |
| R8 | ~1 min em regime estável; ~4 min no pior caso |
| R9 | Tempo por etapa e novos contadores no resumo |
| R10 | `<dt>` por aeródromo dispara a revalidação das pistas, além de AIRAC e idade |
| R11 | Download recorre ao host da API quando o link não responde |
