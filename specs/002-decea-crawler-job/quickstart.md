# Phase 1 — Quickstart: validação do coletor DECEA

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Modelo**: [data-model.md](./data-model.md)

Guia de execução e validação ponta a ponta. Cada cenário abaixo prova uma história da spec e é
verificável sem ler código. O alvo de tempo é o SC-005: do zero ao primeiro dado coletado em menos
de 10 minutos.

---

## Pré-requisitos

| Item | Verificação |
|------|-------------|
| Node.js 22 | `node --version` → `v22.x` |
| pnpm | `pnpm --version` |
| Docker + Compose | `docker compose version` |
| Credenciais AISWEB | `apiKey` e `apiPass` obtidos junto ao DECEA |

---

## Setup (uma vez)

```bash
# 1. Dependências do workspace
pnpm install

# 2. Configuração local
cp .env.example .env
#    Preencher AISWEB_API_KEY e AISWEB_API_PASS.
#    As demais variáveis já vêm apontando para os contêineres locais.

# 3. Banco e bucket (FR-029)
docker compose up -d

# 4. Esquema do banco (FR-032)
pnpm --filter @open-nav-charts/domain migrate
```

`docker compose up -d` sobe PostgreSQL 17 (porta 5432) e MinIO (API 9000, console 9001), criando o
bucket `onc-charts` automaticamente. Console do MinIO: <http://localhost:9001>
(`minioadmin`/`minioadmin`).

**Validação do setup**

```bash
docker compose ps                      # ambos os serviços "healthy"
psql "$DATABASE_URL" -c '\dt'          # tabelas airport, airport_runway, airport_procedure
```

---

## Cenário 1 — Configuração ausente falha rápido (FR-005, História 4)

```bash
env -u AISWEB_API_KEY -u S3_BUCKET pnpm --filter @open-nav-charts/jobs start decea-crawler
```

**Esperado**: encerra imediatamente, **sem** processar nada, código de saída `2`, listando as duas
variáveis ausentes de uma vez:

```text
Configuração inválida:
  - AISWEB_API_KEY: obrigatória, não definida
  - S3_BUCKET: obrigatória, não definida
```

Confirme com `echo $?` → `2`.

---

## Cenário 2 — Coleta de um aeródromo ponta a ponta (Histórias 1, 2 e 3)

O caminho mais curto para validar tudo. `--only` evita esperar o catálogo inteiro.

```bash
pnpm --filter @open-nav-charts/jobs start decea-crawler --only SBGR
```

**Esperado**: progresso na tela, resumo final e código `0`.

```bash
# Aeródromo com coordenadas e pistas (FR-009)
psql "$DATABASE_URL" -c \
  "select icao, name, city, state, latitude, longitude from airport where icao='SBGR';"
psql "$DATABASE_URL" -c \
  "select ident, length_m, width_m from airport_runway where airport_icao='SBGR';"

# Cartas: todas IFR, com id/nome/tipo/emenda (FR-011, FR-013)
psql "$DATABASE_URL" -c \
  "select id, name, type, amendment, storage_key from airport_procedure
   where airport_icao='SBGR' limit 10;"
psql "$DATABASE_URL" -c \
  "select type, count(*) from airport_procedure group by type order by 2 desc;"
#   Esperado: apenas siglas da espécie IFR — ADC, AOC, ARC, ATCSMAC, GMC, IAC,
#   LC, OTR, PATC, PDC, SID, STAR, VAC. Qualquer outra sigla indica que o
#   parâmetro especie=IFR deixou de ser honrado pela API.

# Documentos arquivados em /<ICAO>/<id>.pdf (FR-017)
docker compose exec minio mc ls --recursive local/onc-charts/SBGR/
```

**Validação do PDF** — baixe um objeto e confirme que é um PDF real (FR-019):

```bash
docker compose exec minio mc cat local/onc-charts/SBGR/<id>.pdf | head -c 5   # → %PDF-
```

---

## Cenário 3 — Reexecução é idempotente (FR-018, FR-024, SC-004)

```bash
psql "$DATABASE_URL" -c "select count(*) from airport_procedure;"   # anote
pnpm --filter @open-nav-charts/jobs start decea-crawler --only SBGR
psql "$DATABASE_URL" -c "select count(*) from airport_procedure;"   # idêntico
```

**Esperado**: contagem inalterada, nenhuma duplicata, e no resumo os documentos aparecem em
"já existentes" — não em "arquivados", provando que não houve rebaixamento (FR-018).

---

## Cenário 4 — Metadados sem documentos (Independent Test da História 2)

Prova que a História 2 entrega valor sem depender da 3.

```bash
psql "$DATABASE_URL" -c "delete from airport where icao='SBSP';"
pnpm --filter @open-nav-charts/jobs start decea-crawler --only SBSP --skip-documents
```

**Esperado**: cartas persistidas com `storage_key` nula; nenhum objeto novo no bucket sob `SBSP/`.

---

## Cenário 5 — Falha de um aeródromo não derruba a execução (FR-022, História 4)

```bash
pnpm --filter @open-nav-charts/jobs start decea-crawler --only SBGR,ZZZZ,SBSP
```

`ZZZZ` não existe na fonte.

**Esperado**: `SBGR` e `SBSP` processados com sucesso; `ZZZZ` listado nas falhas do resumo; código
de saída `1` (concluiu com falhas — distinto de `0` e de `2`).

---

## Cenário 6 — Retry em falha transitória (FR-021, SC-006)

Com a rotina em execução, derrube a rede do contêiner ou desconecte brevemente e reconecte.

**Esperado**: linhas `tentativa 2/3` no progresso e o aeródromo concluindo com sucesso na
retomada, sem perda de dado. Falha nas 3 tentativas → aeródromo no relatório de falhas, execução
seguindo nos demais.

---

## Cenário 7 — Execução completa (SC-001, SC-002, SC-007)

```bash
pnpm --filter @open-nav-charts/jobs start decea-crawler
```

**Esperado**: 46 páginas de 100, 4 aeródromos simultâneos, progresso contínuo indicando a página
corrente (SC-007).

```bash
# Total coletado vs. total publicado pela fonte (SC-001)
psql "$DATABASE_URL" -c "select count(*) from airport;"

# Taxa de falha abaixo de 1% (SC-002) — conferir no resumo final
```

---

## Testes automatizados

```bash
pnpm test                    # unitários: sem rede, sem Docker (Princípio IV)
pnpm test:integration        # Testcontainers: PostgreSQL + MinIO efêmeros
pnpm check                   # lint + build + typecheck + test — portão de merge
```

`pnpm test` deve passar em uma máquina sem Docker e sem credenciais. Se falhar sem eles, algum
teste tem dependência de I/O real e viola o Princípio IV.

---

## Produção (Railway)

Nenhuma mudança de código — apenas variáveis (ver [contracts/jobs-cli.md](./contracts/jobs-cli.md)):

| Variável | Valor no Railway |
|----------|------------------|
| `S3_ENDPOINT` | `https://storage.railway.app` |
| `S3_REGION` | `auto` |
| `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | Do serviço de bucket |
| `S3_FORCE_PATH_STYLE` | `false` (buckets novos usam virtual-hosted style) |
| `DATABASE_URL` | Do serviço PostgreSQL |

Buckets do Railway não suportam acesso público (research R6): os PDFs serão servidos pela futura
API REST via presigned URL ou proxy, não por link direto.

---

## Diagnóstico

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| Sai com `2` na largada | Variável ausente | Conferir `.env` contra `.env.example` |
| Sai com `3` imediatamente | 401/403 da AISWEB | Validar `AISWEB_API_KEY`/`PASS` |
| `SignatureDoesNotMatch` no MinIO | Estilo de URL | `S3_FORCE_PATH_STYLE=true` no local |
| Emenda igual em todas as cartas | Lido o atributo `emenda` do envelope | Usar o elemento `<amdt>` de cada item (research R2) |
| Cartas VFR no banco | `especie=IFR` não honrado pela API | Conferir o alerta de tipos desconhecidos no resumo (research R2) |
| Coordenadas nulas em massa | Lido `latRotaer` em vez de `lat` | Usar `<lat>`/`<lng>`, já decimais (research R4) |
| Conexões esgotadas no Postgres | Pool menor que a concorrência | Pool ≥ `--concurrency` |
