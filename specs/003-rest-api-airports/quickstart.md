# Quickstart: API REST de Aeródromos e Cartas

**Feature**: `003-rest-api-airports` | **Data**: 2026-08-15

Guia de validação ponta a ponta. Cada cenário abaixo prova um requisito da
[spec.md](./spec.md) contra a API rodando de verdade. Os detalhes de formato estão em
[contracts/rest-api.md](./contracts/rest-api.md); aqui só o que se executa e o que se espera.

---

## Pré-requisitos

- Node.js 22 (`nvm use`) e pnpm via Corepack
- Docker, para PostgreSQL e MinIO
- Credenciais da AISWEB no `.env`, **apenas** para popular o acervo — a API não as usa

---

## Preparação

### 1. Infraestrutura e dependências

```bash
docker compose up -d
pnpm install
```

### 2. Variáveis de ambiente

A API reaproveita as variáveis já descritas no `.env.example` (`DATABASE_URL` e as `S3_*`) e
acrescenta duas próprias:

| Variável | Exemplo | Uso |
|----------|---------|-----|
| `API_PORT` | `3000` | Porta de escuta |
| `API_LOG_LEVEL` | `info` | Verbosidade dos logs |

`AISWEB_API_KEY` e `AISWEB_API_PASS` **não** são exigidas pela API — ela nem as lê.

### 3. Popular o acervo

A API é somente-leitura; quem alimenta o acervo é a rotina de coleta.

```bash
pnpm --filter @open-nav-charts/jobs start decea-crawler --only SBGL,SBSP,SBBR
```

As migrações — incluindo a coluna `search_text` desta feature — são aplicadas
automaticamente na inicialização da rotina.

### 4. Subir a API

```bash
pnpm --filter @open-nav-charts/api start
```

Esperado: uma linha de log em JSON confirmando a porta de escuta. Faltando variável
obrigatória, o processo **não sobe** e lista todas as ausências de uma vez (FR-034).

---

## Cenários de validação

### C1 — Catálogo paginado (História 1)

```bash
curl -s "http://localhost:3000/v1/airports?page=1&pageSize=2" | jq
```

**Esperado**: `items` com 2 aeródromos, `total` refletindo o acervo, `hasNext: true` se
houver mais. Nenhum item traz `runways` (FR-008).

Percorrer todas as páginas e conferir que nenhum ICAO se repete (SC-008):

```bash
curl -s "http://localhost:3000/v1/airports?pageSize=100" | jq -r '.items[].icao' | sort | uniq -d
```

**Esperado**: saída vazia — nenhum duplicado.

### C2 — Filtro e busca (FR-005, FR-006)

```bash
curl -s "http://localhost:3000/v1/airports?state=RJ" | jq '.items[].state'
curl -s "http://localhost:3000/v1/airports?search=galeao" | jq '.items[].name'
```

**Esperado**: o filtro devolve apenas `"RJ"`. A busca por `galeao`, **sem acento**, encontra
"Galeão" — é a prova da normalização decidida em [research.md R5](./research.md). Testar
também `search=GALEÃO` e `search=Galeao`: os três devolvem o mesmo resultado.

### C3 — Limite de página (FR-003)

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/v1/airports?pageSize=500"
```

**Esperado**: `400`, com corpo `INVALID_PAGINATION` mencionando o limite de 100.

### C4 — Detalhe do aeródromo (História 2)

```bash
curl -s "http://localhost:3000/v1/airports/sbgl" | jq
```

**Esperado**: `200` com os dados e `runways` preenchido. O ICAO em minúsculas devolve o mesmo
recurso que em maiúsculas (FR-011).

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/v1/airports/XX"    # 400
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/v1/airports/SBXX"  # 404
```

**Esperado**: `400` para formato inválido e `404` para ICAO válido inexistente — a distinção
exigida por FR-012.

### C5 — Procedimentos (História 3)

```bash
curl -s "http://localhost:3000/v1/airports/SBGL/procedures" | jq '.items[0]'
```

**Esperado**: `id`, `name`, `type`, `amendment` e `hasChart`. Confirmar que **não** aparecem
`storageKey`, `sourceUrl` nem `archivedAt` (FR-017):

```bash
curl -s "http://localhost:3000/v1/airports/SBGL/procedures" | jq 'tostring | test("storageKey|sourceUrl")'
```

**Esperado**: `false`.

### C6 — Carta em PDF (História 4) — o cenário central

```bash
PROC=$(curl -s "http://localhost:3000/v1/airports/SBGL/procedures" \
  | jq -r '[.items[] | select(.hasChart)][0].id')

curl -s -i "http://localhost:3000/v1/airports/SBGL/procedures/$PROC/chart" | head -20
```

**Esperado**: `HTTP/1.1 302 Found`, com `Location` apontando para o endpoint do bucket
contendo os parâmetros de assinatura (`X-Amz-Signature`, `X-Amz-Expires=300`) e
`Cache-Control: no-store`. **Nenhum byte de PDF no corpo** — é a prova de FR-019 e SC-004.

Seguir o redirect e confirmar que chega o PDF:

```bash
curl -sL "http://localhost:3000/v1/airports/SBGL/procedures/$PROC/chart" \
  -o /tmp/carta.pdf && file /tmp/carta.pdf
```

**Esperado**: `PDF document`.

### C7 — Expiração da URL assinada (FR-020)

```bash
LOCATION=$(curl -s -o /dev/null -w "%{redirect_url}" \
  "http://localhost:3000/v1/airports/SBGL/procedures/$PROC/chart")

curl -s -o /dev/null -w "%{http_code}\n" "$LOCATION"   # 200 — dentro da validade
```

Para verificar a expiração sem esperar 5 minutos, reduzir temporariamente a validade na
configuração e repetir. **Esperado**: após o prazo, o bucket responde `403`, e o consumidor
precisa pedir a carta novamente à API.

### C8 — Distinção entre erros da carta (FR-021, FR-022)

```bash
# Procedimento sem documento arquivado
SEM=$(curl -s "http://localhost:3000/v1/airports/SBGL/procedures" \
  | jq -r '[.items[] | select(.hasChart | not)][0].id')
curl -s "http://localhost:3000/v1/airports/SBGL/procedures/$SEM/chart" | jq -r '.error.code'

# Procedimento de SBGL pedido sob outro aeródromo
curl -s "http://localhost:3000/v1/airports/SBSP/procedures/$PROC/chart" | jq -r '.error.code'
```

**Esperado**: `CHART_NOT_AVAILABLE` no primeiro e `PROCEDURE_NOT_FOUND` no segundo. Códigos
distintos, ambos `404` — é o que FR-022 exige e o que impede o vazamento de FR-021.

### C9 — Saúde (História 5)

```bash
curl -s http://localhost:3000/health | jq
docker compose stop postgres && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/health
docker compose start postgres
```

**Esperado**: `200` com `status: "ok"`; com o banco parado, `503` com `status: "degraded"` —
o processo continua no ar, distinguindo serviço de dependência (FR-029).

### C10 — Limitação de taxa (FR-030)

```bash
for i in $(seq 1 130); do
  curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/v1/airports?pageSize=1"
done | sort | uniq -c
```

**Esperado**: as primeiras 120 em `200` e as seguintes em `429`, com `Retry-After`.

### C11 — Erros não vazam detalhe interno (FR-035, SC-009)

```bash
curl -s "http://localhost:3000/v1/rota-inexistente" | jq
```

**Esperado**: envelope `{ "error": { "code": "ROUTE_NOT_FOUND", ... } }`, sem rastreamento de
pilha, sem SQL e sem nome de recurso de infraestrutura.

---

## Suíte automatizada

```bash
pnpm --filter @open-nav-charts/api test              # unitário + contrato HTTP
pnpm --filter @open-nav-charts/api test:integration  # exige Docker
pnpm check                                           # portão completo de pré-merge
```

`pnpm check` roda lint, build, tipos e testes em sequência, abortando no primeiro que falhar.

---

## Encerramento

```bash
docker compose down     # mantém os dados
docker compose down -v  # apaga banco e bucket
```

Ao receber `SIGTERM`/`SIGINT`, a API conclui as requisições em curso antes de encerrar e só
então fecha o pool do banco e o cliente S3 (FR-033).
