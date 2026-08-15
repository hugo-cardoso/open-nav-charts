# Phase 1 — Data Model: Coletor de aeroportos e cartas IFR do DECEA

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

Modelo de dados persistido em PostgreSQL, definido em `packages/domain` e exposto à futura API
REST (FR-031). O esquema é declarado em TypeScript com Drizzle e materializado em migrações SQL
versionadas (FR-032).

## Visão geral

```text
Airport (1) ──< (N) AirportRunway
    │
    └──< (N) AirportProcedure ──── objeto no bucket: /<icao>/<id>.pdf
```

O código ICAO é a chave natural do agregado: pistas e procedimentos referenciam o aeródromo por
ICAO e desaparecem com ele.

---

## Airport

Aeródromo do tipo `AD` publicado pela AISWEB. Raiz do agregado.

| Campo | Tipo | Nulo | Regra |
|-------|------|------|-------|
| `icao` | `char(4)` PK | não | Chave natural. Sempre maiúsculo. `^[A-Z]{4}$` |
| `name` | `text` | não | Sem espaços nas bordas. Não vazio |
| `city` | `text` | sim | Ausente quando a fonte não informa (História 1, cenário 4) |
| `state` | `char(2)` | sim | UF brasileira em maiúsculo quando presente |
| `latitude` | `numeric(9,6)` | sim | Graus decimais, `-90..90` |
| `longitude` | `numeric(9,6)` | sim | Graus decimais, `-180..180` |
| `created_at` | `timestamptz` | não | Default `now()` |
| `updated_at` | `timestamptz` | não | Atualizado a cada upsert |

**Regras de validação**
- `icao` é obrigatório e único — um registro por aeródromo (FR-010).
- `name` obrigatório: sua ausência torna o aeródromo **falho** e dispara retry (FR-021).
- `city`, `state`, `latitude`, `longitude` são opcionais: ausência é registrada no relatório sem
  interromper a rotina.
- `latitude` e `longitude` são gravadas juntas ou nenhuma das duas — meia coordenada é inútil.

**Índices**: PK em `icao`; índice em `state` para a futura consulta por UF da API REST.

**Ciclo de vida**: criado no primeiro encontro; atualizado por upsert em `icao` nas reexecuções
(FR-010, FR-024). Nunca removido por esta rotina — a AISWEB não publica lista de aeródromos
extintos, e apagar por ausência arriscaria destruir dados após uma coleta parcial.

---

## AirportRunway

Pista pertencente a um aeródromo. Entidade dependente, sem identidade própria fora do agregado.

| Campo | Tipo | Nulo | Regra |
|-------|------|------|-------|
| `id` | `uuid` PK | não | Identidade técnica (a fonte não fornece uma estável) |
| `airport_icao` | `char(4)` FK → `airport.icao` | não | `ON DELETE CASCADE` |
| `ident` | `text` | não | Designação da pista (ex.: `10/28`). Não vazio |
| `length_m` | `integer` | sim | Positivo quando presente |
| `width_m` | `integer` | sim | Positivo quando presente |

**Regras de validação**
- `(airport_icao, ident)` é único: a mesma pista não se repete no aeródromo.
- Dimensões ausentes ou não numéricas são gravadas como nulas, não como zero — zero afirmaria que
  a pista tem comprimento nulo, o que é falso.
- Um aeródromo sem nenhuma pista é válido (edge case da spec).

**Ciclo de vida**: substituição integral por aeródromo a cada processamento (apaga e reinsere
dentro da mesma transação). A lista é pequena e sem identificador estável na fonte, o que torna a
substituição mais simples e mais correta que um *diff* por `ident`.

---

## AirportProcedure

Carta de navegação por instrumentos (IFR) de um aeródromo.

| Campo | Tipo | Nulo | Regra |
|-------|------|------|-------|
| `id` | `text` PK | não | Identificador da carta na AISWEB (FR-014) |
| `airport_icao` | `char(4)` FK → `airport.icao` | não | `ON DELETE CASCADE` |
| `name` | `text` | não | Sem espaços nas bordas. Não vazio |
| `type` | `text` | não | Sigla da carta: `IAC`, `SID`, `STAR`, `VAC`, `ADC`… Espécie IFR (FR-011) |
| `amendment` | `text` | sim | Elemento `<amdt>` da carta (ex.: `2601A1`) — **não** o atributo `emenda` do envelope |
| `source_url` | `text` | sim | Campo `link` da fonte, para auditoria e refetch |
| `storage_key` | `text` | sim | Chave no bucket: `<ICAO>/<id>.pdf`. Nula até o arquivamento |
| `archived_at` | `timestamptz` | sim | Momento do arquivamento bem-sucedido |
| `created_at` | `timestamptz` | não | Default `now()` |
| `updated_at` | `timestamptz` | não | Atualizado a cada upsert |

**Regras de validação**
- `id` é único globalmente (FR-014); reexecuções fazem upsert, nunca duplicam.
- `name` e `type` são obrigatórios; ausência torna a carta inválida e o aeródromo falho.
- `amendment` é opcional na persistência: nem toda carta publica emenda, e recusar a carta inteira
  por isso perderia dado útil. FR-013 é atendido gravando o valor sempre que a fonte o fornece.
- `type` guarda a **sigla** da carta (`IAC`, `SID`, `STAR`, `VAC`…), não a string `IFR`. A espécie
  IFR compreende 13 siglas; a seleção ocorre apenas pelo parâmetro `especie=IFR` na origem, pois a
  resposta não permite reclassificar localmente (research R2).
- `amendment` vem do elemento `<amdt>` de cada carta. O atributo `emenda` do envelope `<cartas>` é
  a data AIRAC do conjunto e **não** deve ser usado — gravaria o mesmo valor em todas as cartas.
- `storage_key` nula com a carta presente significa metadado coletado e documento pendente —
  estado legítimo entre a História 2 e a História 3.

**Índices**: PK em `id`; índice em `airport_icao` para listar cartas de um aeródromo (consulta
central da futura API REST).

**Ciclo de vida**: *diff* por aeródromo a cada processamento (R8) — presentes na fonte são
inseridas/atualizadas; ausentes são removidas do banco e têm o objeto apagado do bucket após o
commit (FR-015, FR-020).

---

## Objeto no bucket

Não é tabela, mas faz parte do modelo por ser o dado que `storage_key` endereça.

| Aspecto | Valor |
|---------|-------|
| Chave | `<ICAO em maiúsculo>/<id da carta>.pdf` (FR-017) |
| Conteúdo | PDF íntegro, iniciando com `%PDF-`, tamanho > 0 (FR-019) |
| `Content-Type` | `application/pdf` |
| Relação | 1:1 com `AirportProcedure`; a chave é derivável, nunca aleatória |

A chave determinística é o que torna o upload idempotente: reexecutar sobrescreve o mesmo objeto
em vez de acumular cópias (FR-024), e permite verificar a existência antes de baixar (FR-018).

---

## Transação e consistência

O processamento de um aeródromo grava banco e bucket, que não compartilham transação. A ordem
adotada:

1. Baixar e arquivar no bucket os documentos das cartas ainda não arquivadas.
2. Em **uma transação**: upsert do `Airport`, substituição das `AirportRunway`, *diff* das
   `AirportProcedure` (com `storage_key` das recém-arquivadas).
3. Após o commit: remover do bucket os objetos das cartas que saíram de vigência.

**Por que esta ordem**: cada falha possível degrada para um estado inofensivo e autocorrigível.
Falha entre 1 e 2 deixa um objeto no bucket sem registro — a execução seguinte o sobrescreve ou o
remove no *diff*. Falha em 3 deixa um objeto órfão, também limpo na execução seguinte. A ordem
inversa (apagar antes do commit) produziria o único estado realmente ruim: um registro no banco
apontando para um documento que não existe mais.

---

## Rastreabilidade

| Requisito | Onde é atendido |
|-----------|-----------------|
| FR-009 | Campos de `Airport` + tabela `AirportRunway` |
| FR-010 | PK `airport.icao` + upsert |
| FR-011 | Parâmetro `especie=IFR` na origem (a resposta não permite refiltrar) |
| FR-012 | Alerta no relatório para `type` fora das 13 siglas conhecidas, sem descartar a carta |
| FR-013 | `id`, `name`, `type`, `amendment` (de `<amdt>`) + FK `airport_icao` |
| FR-014 | PK `airport_procedure.id` + upsert |
| FR-015 | *Diff* de procedimentos por aeródromo |
| FR-017 | `storage_key` no formato `<ICAO>/<id>.pdf` |
| FR-018 | Verificação de existência por chave determinística |
| FR-019 | Validação de assinatura `%PDF-` antes de gravar |
| FR-020 | Remoção do objeto após o commit |
| FR-024 | Upserts por chave natural + chave de objeto determinística |
| FR-031 | Todo este modelo reside em `packages/domain` |
| FR-032 | Migrações SQL geradas por drizzle-kit |
