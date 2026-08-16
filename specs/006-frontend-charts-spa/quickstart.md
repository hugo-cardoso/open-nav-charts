# Quickstart: Aplicação web de consulta a cartas

**Feature**: `006-frontend-charts-spa` | **Data**: 2026-08-15

Como executar `apps/web` e validar que a feature funciona de ponta a ponta. Os cenários da
seção 4 mapeiam diretamente as histórias de usuário e os critérios de sucesso da
[spec.md](./spec.md).

---

## 1. Pré-requisitos

| Item | Versão | Verificação |
|------|--------|-------------|
| Node.js | 22.x | `node -v` |
| pnpm | 9.9.0 | `pnpm -v` |
| Docker | com Compose | `docker compose version` |

O repositório usa `engine-strict=true`: uma versão de Node divergente **falha a instalação**,
não emite aviso. Foi por isso que `react-router` ficou na 7.x e `jsdom` na 29.x — as versões
correntes exigem patches de Node acima do ambiente (ver R2 e R3 em [research.md](./research.md)).

## 2. Subir a API e suas dependências

A aplicação web consome a API; sem ela, apenas a tela inicial funciona.

```bash
# 1. Infraestrutura local (PostgreSQL + MinIO)
docker compose up -d

# 2. Variáveis de ambiente, se ainda não existirem
cp .env.example .env

# 3. Migrações do banco
pnpm --filter @open-nav-charts/domain migrate

# 4. API em http://localhost:3000
pnpm --filter @open-nav-charts/api start
```

Confirme que respondeu:

```bash
curl -s http://localhost:3000/health
curl -s "http://localhost:3000/v1/airports?pageSize=1"
```

Se o acervo estiver vazio, a busca funciona mas não devolve resultados — é o estado `empty`,
não uma falha. Para popular, execute o job de coleta (`apps/jobs`).

## 3. Executar a aplicação web

```bash
# Configuração: aponta para a API local
cp apps/web/.env.example apps/web/.env

# Dependências (a partir da raiz)
pnpm install

# Servidor de desenvolvimento
pnpm --filter @open-nav-charts/web dev
```

`apps/web/.env` precisa conter:

```
VITE_API_BASE_URL=http://localhost:3000
```

A aplicação sobe em `http://localhost:5173`. Nenhum proxy é necessário: a API responde
`Access-Control-Allow-Origin: *` (R8).

### Demais comandos

```bash
pnpm --filter @open-nav-charts/web build      # Build de produção
pnpm --filter @open-nav-charts/web preview    # Serve o build localmente
pnpm --filter @open-nav-charts/web test       # Vitest
pnpm --filter @open-nav-charts/web typecheck  # tsc --noEmit

pnpm check                                    # Portão completo do monorepo
```

`pnpm check` executa lint, build, typecheck e testes de todos os pacotes — é o portão que a
constituição exige antes de qualquer merge.

---

## 4. Cenários de validação

Executados manualmente no navegador contra a API local, com o acervo populado. Cada cenário
cita o requisito e o critério que verifica.

### C1 — Tela inicial (História 2 · FR-001, FR-002, SC-003)

1. Abrir `http://localhost:5173/`.
2. **Esperado**: nome do produto, descrição do acervo e um acionamento visível para a busca.
3. Acionar o acesso ao painel.
4. **Esperado**: navegação para `/search`, com o campo de busca pronto.
5. **Esperado**: nenhuma requisição à API na aba de rede durante o carregamento da tela
   inicial.

### C2 — Busca até a carta (História 1 · FR-006, FR-013, FR-016, SC-001)

1. Em `/search`, digitar um ICAO existente no acervo (ex.: `SBGL`).
2. **Esperado**: o aeródromo aparece com ICAO, nome e localidade.
3. Selecionar o aeródromo.
4. **Esperado**: URL passa a `/airports/SBGL`; cabeçalho com dados do aeródromo e lista de
   procedimentos com nome e tipo.
5. Acionar um procedimento com carta disponível.
6. **Esperado**: o PDF abre em **nova aba**; a aba original permanece em `/airports/SBGL`
   com os dados carregados.
7. **Verificar SC-001**: da tela inicial até a carta, no máximo três acionamentos.

### C3 — Procedimento sem carta (FR-015)

1. Localizar um procedimento com `hasChart: false`.
2. **Esperado**: indicação textual de carta indisponível.
3. **Esperado**: **nenhum** controle de abertura — nem habilitado, nem desabilitado.

### C4 — Estados vazio, inválido e de falha (FR-010, FR-020, FR-022, SC-006)

1. Abrir `/search` sem parâmetros → **esperado**: estado `idle`, convite a buscar (não uma
   lista vazia).
2. Buscar `ZZZZ` → **esperado**: "nenhum resultado" com sugestão de revisar o termo.
3. Informar um filtro de estado com 1 letra → **esperado**: mensagem **junto ao campo**, com
   o texto digitado preservado.
4. Parar a API (`Ctrl+C`) e repetir uma busca → **esperado**: mensagem em inglês compreensível,
   com ação de nova tentativa; **nenhum** texto em português e nenhum detalhe técnico.
5. Religar a API e acionar a nova tentativa → **esperado**: a busca refaz com o termo e os
   filtros preservados (FR-021).
6. **Verificar SC-006**: em nenhum passo houve área em branco sem explicação.

### C5 — Consulta na URL e histórico (História 4 · FR-003, FR-004, SC-008)

1. Buscar com termo e filtro de estado; avançar para a página 2.
2. **Esperado**: a URL reflete `search`, `state` e `page`.
3. Recarregar (F5) → **esperado**: mesmos resultados, mesma página, campos preenchidos.
4. Copiar a URL para uma janela anônima → **esperado**: mesmo conteúdo.
5. Entrar em um aeródromo e acionar "voltar" → **esperado**: retorno à busca com termo e
   filtros intactos (FR-011).
6. **Esperado**: o "voltar" **não** percorre cada tecla digitada — a digitação usa `replace`.
7. Abrir `/airports/ZZZZ` → **esperado**: "não encontrado" com caminho de volta à busca.
8. Abrir `/qualquer-coisa` → **esperado**: tela de endereço desconhecido (FR-005).

### C6 — Responsividade (FR-025, FR-026, SC-005)

Repetir C2 em cada largura, pelas ferramentas de desenvolvimento:

| Largura | Verificar |
|---------|-----------|
| 320 px | Sem rolagem horizontal; filtros empilhados; alvos de toque confortáveis |
| 768 px | Layout intermediário coerente; nada sobreposto |
| 1440 px | Aproveitamento da largura; conteúdo não esticado sem limite |

**Esperado em todas**: fluxo completável, nenhum elemento cortado ou inacessível.

### C7 — Acessibilidade por teclado (SC-007)

1. A partir de `/`, percorrer as histórias P1 e P2 usando **apenas** `Tab`, `Shift+Tab`,
   `Enter` e as setas.
2. **Esperado**: foco sempre visível; ordem de foco correspondente à ordem visual.
3. **Esperado**: a carta abre por `Enter` sobre o link do procedimento.
4. **Esperado**: campo de busca e filtros possuem rótulo associado (não apenas `placeholder`).

### C8 — Expiração da URL da carta (FR-017 · R6)

Este cenário existe porque a URL assinada vive **300 segundos**.

1. Abrir `/airports/:icao` e deixar a aba parada por **mais de 6 minutos**.
2. Sem recarregar, acionar a carta de um procedimento.
3. **Esperado**: o PDF abre normalmente — a URL é resolvida no clique, não no carregamento
   da lista.
4. **Falha, se ocorrer**: erro de link expirado do repositório de objetos, o que indicaria
   que a URL assinada foi pré-carregada ou armazenada — violação explícita de FR-017.

### C9 — Concorrência de digitação (FR-012)

1. Com a rede limitada a "3G lento" nas ferramentas de desenvolvimento, digitar `SBGL`
   rapidamente, letra a letra.
2. **Esperado**: a lista final corresponde a `SBGL`, e não a um termo parcial cuja resposta
   chegou atrasada.

---

## 5. Testes automatizados

```bash
pnpm --filter @open-nav-charts/web test
```

Cobertura esperada, conforme o Princípio IV:

| Alvo | O que verifica |
|------|----------------|
| `src/errors/error-messages.ts` | Todo `ErrorCode` mapeia para texto em inglês; código desconhecido recai em `INTERNAL_ERROR` |
| `src/api/*` | Montagem de query (omissão de padrões), normalização de ICAO, conversão de falha em `ApiFailure` |
| `src/hooks/use-search-params.ts` | Consulta ↔ URL; troca de filtro redefine `page`; parâmetros malformados são saneados |
| Componentes de resultado | Os cinco estados de tela renderizam o conteúdo correto |
| Lista de procedimentos | `hasChart: false` não renderiza controle de abertura |
| Apresentação | Campos nulos são omitidos, sem rótulo órfão nem `"null"` na tela |

**Determinismo (Princípio IV)**: o `fetch` global é sempre stubbado — nenhum teste toca a
rede real, e não há dependência de relógio do sistema.

### Armadilha conhecida do ambiente de teste

Renderizar qualquer componente sob `MantineProvider` em jsdom falha com
`TypeError: window.matchMedia is not a function` (R5, reproduzido durante a pesquisa). Por
isso `src/testing/setup-tests.ts` instala stubs de `matchMedia` e `ResizeObserver`, e os
testes MUST renderizar pelo utilitário `src/testing/render.tsx`, que já monta os provedores,
em vez de chamar `render` diretamente.

## 6. Solução de problemas

| Sintoma | Causa provável | Ação |
|---------|----------------|------|
| `ERR_PNPM_UNSUPPORTED_ENGINE` na instalação | Alguma dependência exige Node acima do local | Conferir as versões fixadas na tabela de [research.md](./research.md); não elevar versão sem verificar `engines` |
| `window.matchMedia is not a function` | Teste renderizou sem o setup | Usar `src/testing/render.tsx` e conferir `setupFiles` no `vitest.config.ts` |
| Requisições para `undefined/v1/airports` | `VITE_API_BASE_URL` ausente | Criar `apps/web/.env`; reiniciar o servidor (variáveis são lidas no build) |
| Busca sempre vazia | Acervo sem dados | Rodar o job de coleta em `apps/jobs` |
| Erro de CORS no console | API não está no ar | A API responde `Access-Control-Allow-Origin: *`; o erro costuma ser conexão recusada disfarçada |
| Carta abre com "link expirado" | URL assinada pré-carregada | Violação de FR-017 — montar a URL no acionamento (ver C8) |
| Estilos do Mantine ausentes | `@mantine/core/styles.css` não importado, ou importado após os estilos próprios | Importar antes dos estilos da aplicação em `src/main.tsx` |
