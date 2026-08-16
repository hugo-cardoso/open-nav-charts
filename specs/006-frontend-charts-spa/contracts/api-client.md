# Contrato: cliente da API REST

**Feature**: `006-frontend-charts-spa` | **Data**: 2026-08-15

Contrato entre `apps/web` e `@open-nav-charts/api`. Esta feature **consome** a API e
**não** a altera. Nenhuma modificação em `apps/api` é prevista ou permitida por este plano.

---

## Aviso: a fonte da verdade é o código

`specs/003-rest-api-airports/contracts/rest-api.md` está **desatualizado**. Ele documenta
`city`, `state`, `latitude` e `longitude` na raiz de cada aeródromo, mas a feature 005 os
agrupou sob um objeto `location` e acrescentou `country`. A forma real, verificada em
`apps/api/src/presentation/responses.ts:69-81`, é a que este contrato descreve.

O cliente MUST seguir o código da API. Se um teste de integração deste pacote falhar por
forma de resposta, o código da API decide — não o documento da feature 003.

## Base e configuração

| Item | Valor |
|------|-------|
| Prefixo de recursos | `/v1` |
| Origem | Variável de build `VITE_API_BASE_URL` |
| Métodos | Somente `GET` — a API recusa qualquer outro (`405 METHOD_NOT_ALLOWED`) |
| CORS | `Access-Control-Allow-Origin: *`; nenhum proxy necessário (R8) |
| Credenciais | Nenhuma. O cliente MUST NOT enviar cookies nem cabeçalhos de autorização |

`VITE_API_BASE_URL` MUST ser validada na inicialização: ausente ou malformada é falha de
configuração, e a aplicação deve dizer isso claramente em vez de emitir requisições a
`undefined/v1/airports`. Barras finais devem ser normalizadas antes de compor a URL.

---

## Operações consumidas

### `listAirports(query): Promise<PageResponse<AirportSummary>>`

`GET /v1/airports`

| Parâmetro | Envio | Restrição da API | Requisito |
|-----------|-------|------------------|-----------|
| `search` | omitido se nulo | 1 a 100 caracteres | FR-006 |
| `state` | omitido se nulo | exatamente 2 letras | FR-008 |
| `country` | omitido se nulo | exatamente 2 letras | FR-008 |
| `page` | omitido se `1` | inteiro ≥ 1 | FR-009 |
| `pageSize` | fixo pela aplicação | 1 a 100 | FR-009 |

Parâmetros em valor padrão MUST ser omitidos da query string, não enviados vazios — `search=`
seria recusado com `400 INVALID_SEARCH`.

**Garantias da API aproveitadas**: ordenação estável por `icao`; `total` reflete o conjunto
filtrado; página além do fim devolve `items: []` com `200`, não `404` — logo, ultrapassar o
fim é estado `empty`, nunca `failure`.

**Erros**: `INVALID_PAGINATION` · `INVALID_STATE` · `INVALID_COUNTRY` · `INVALID_SEARCH`

### `getAirport(icao): Promise<AirportDetail>`

`GET /v1/airports/:icao` — aceita qualquer caixa; a API normaliza para maiúsculas.

**Erros**: `INVALID_ICAO` (400, formato) · `AIRPORT_NOT_FOUND` (404, inexistente). A
distinção importa: o primeiro é erro de entrada, o segundo alimenta a tela de FR-005.

### `listProcedures(icao, type): Promise<CollectionResponse<Procedure>>`

`GET /v1/airports/:icao/procedures`

Não é paginado. `type` é omitido quando nulo e normalizado para maiúsculas quando presente.
Aeródromo existente sem procedimentos devolve `items: []` com `200` — estado `empty`.

**Erros**: `INVALID_ICAO` · `INVALID_PROCEDURE_TYPE` · `AIRPORT_NOT_FOUND`

### `buildChartUrl(icao, procedureId): string`

`GET /v1/airports/:icao/procedures/:id/chart`

**Esta operação não é uma requisição.** É a construção de uma URL para navegação do
navegador. O cliente MUST NOT chamá-la via `fetch`.

Motivo: a rota responde `302` com `Location` apontando para uma URL assinada do repositório
de objetos, válida por **300 segundos**, com `Cache-Control: no-store`. Seguir esse redirect
por `fetch` exigiria CORS no repositório de objetos, que está fora do controle desta feature,
e faria o documento trafegar pela aplicação — desperdiçando o desenho da API, cujo objetivo
explícito é que o PDF não a atravesse.

Consequências obrigatórias:

- A URL MUST ser montada **no instante do acionamento** e usada imediatamente (FR-017).
- A URL assinada resultante MUST NOT ser armazenada, cacheada ou pré-carregada (§5 do
  data-model).
- A navegação MUST abrir em nova aba, preservando a aplicação montada (FR-016).
- O controle MUST ser um link real, para que o navegador ofereça seus próprios recursos
  (abrir em nova janela, copiar endereço) e o fluxo permaneça operável por teclado (SC-007).
- Um link que abre em nova aba MUST incluir `rel="noopener noreferrer"`.

**Erros** (visíveis apenas na aba aberta, não capturáveis pela aplicação):
`INVALID_ICAO` · `INVALID_PROCEDURE_ID` · `PROCEDURE_NOT_FOUND` · `CHART_NOT_AVAILABLE` ·
`CHART_STORAGE_UNAVAILABLE`. Por isso FR-015 é preventivo: só oferecer abertura quando
`hasChart` for `true`.

---

## Tratamento de erros

Toda falha da API chega como `{ "error": { "code", "message" } }`. O cliente MUST converter
qualquer falha em `ApiFailure` e a interface MUST derivar o texto exibido do `code`.

**O campo `message` MUST NOT ser exibido ao usuário**: ele contém texto em português do
Brasil (por exemplo `"O ICAO deve ter exatamente 4 letras."`), e FR-024 exige interface em
inglês. Ele pode ser usado em log de diagnóstico, nunca na tela.

### Mapeamento `code` → texto em inglês

Reside em `src/errors/error-messages.ts`. Sendo uma tabela de dados pura, é testável sem
renderizar componente.

| `code` | Status | Texto exibido | `retryable` |
|--------|--------|---------------|-------------|
| `INVALID_ICAO` | 400 | "Airport codes must be exactly 4 letters." | não |
| `INVALID_PROCEDURE_ID` | 400 | "This procedure reference is not valid." | não |
| `INVALID_PAGINATION` | 400 | "That page is out of range." | não |
| `INVALID_STATE` | 400 | "State codes must be exactly 2 letters." | não |
| `INVALID_COUNTRY` | 400 | "Country codes must be exactly 2 letters." | não |
| `INVALID_SEARCH` | 400 | "Search terms must be between 1 and 100 characters." | não |
| `INVALID_PROCEDURE_TYPE` | 400 | "That procedure type is not valid." | não |
| `AIRPORT_NOT_FOUND` | 404 | "We couldn't find that airport." | não |
| `PROCEDURE_NOT_FOUND` | 404 | "We couldn't find that procedure." | não |
| `CHART_NOT_AVAILABLE` | 404 | "No chart is available for this procedure." | não |
| `ROUTE_NOT_FOUND` | 404 | "That address doesn't exist." | não |
| `METHOD_NOT_ALLOWED` | 405 | "That action isn't supported." | não |
| `RATE_LIMITED` | 429 | "Too many requests. Please wait a moment and try again." | sim |
| `CHART_STORAGE_UNAVAILABLE` | 502 | "The chart archive is unavailable right now." | sim |
| `SERVICE_UNAVAILABLE` | 503 | "The service is temporarily unavailable." | sim |
| `INTERNAL_ERROR` | 500 | "Something went wrong on our side." | sim |
| `NETWORK_ERROR` | — | "We couldn't reach the service. Check your connection." | sim |
| `UNEXPECTED_RESPONSE` | — | "We received an unexpected response." | sim |

`NETWORK_ERROR` e `UNEXPECTED_RESPONSE` são criados pelo cliente e não existem na API: o
primeiro cobre `fetch` rejeitado, o segundo cobre resposta que não obedece ao envelope
esperado. Um código desconhecido MUST recair no texto de `INTERNAL_ERROR`, para que uma
futura ampliação da lista da API nunca produza tela em branco.

### Erros de validação nos campos

Os códigos `INVALID_SEARCH`, `INVALID_STATE` e `INVALID_COUNTRY` MUST ser exibidos junto ao
campo correspondente, não como alerta global (FR-022). O texto do usuário MUST ser preservado
(FR-021).

### Limite de requisições

A API limita a 120 requisições por minuto. Como a busca dispara conforme a digitação, o
cliente MUST aplicar atraso antes de emitir a requisição (`useDebouncedValue` do
`@mantine/hooks`), tanto para respeitar o limite quanto para reduzir tráfego. `RATE_LIMITED`
oferece nova tentativa e a resposta traz `Retry-After`.

---

## Duplicação deliberada de tipos

Os tipos de `src/api/types.ts` espelham `apps/api/src/presentation/responses.ts` por cópia,
não por importação. Isso é deliberado e registrado aqui.

**Por quê**: os tipos de resposta vivem em uma camada interna da API, não em um entrypoint
público exportado. Importá-los cruzaria a fronteira de workspace por caminho interno, o que o
Princípio I proíbe. Extraí-los para um pacote compartilhado é uma refatoração da feature 003,
fora do escopo desta.

**Risco assumido**: uma mudança de forma na API não quebra a compilação do frontend. A
mitigação são testes do cliente sobre respostas de exemplo fiéis
(`src/testing/api-fixtures.ts`) — uma divergência aparece como teste vermelho, não como
defeito em produção.

**Encaminhamento**: se um segundo consumidor da API surgir, extrair os tipos de resposta para
um pacote `packages/api-contract` passa a valer o custo, e esta duplicação deve ser removida.
