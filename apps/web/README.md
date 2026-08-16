# @open-nav-charts/web

Aplicação web de consulta ao acervo de cartas aeronáuticas. Consome a API REST de
`@open-nav-charts/api` e permite buscar aeródromos, inspecionar os procedimentos publicados e
abrir a carta de um procedimento.

Somente leitura: a aplicação não cria nem altera dados do acervo.

## Idioma

**Os textos da interface são em inglês**, por decisão de produto — o público-alvo lê cartas e
fraseologia nesse idioma. Isto é uma exceção registrada ao Princípio VI da constituição, com
escopo e prazo definidos em [`specs/006-frontend-charts-spa/plan.md`](../../specs/006-frontend-charts-spa/plan.md).

A exceção vale **apenas** para as cadeias renderizadas ao usuário final. Comentários de
código, documentação (incluindo este arquivo), mensagens de commit e specs permanecem em
português do Brasil.

Todo texto visível vive em dois arquivos, o que torna a auditoria de idioma uma inspeção
simples:

- `src/i18n/messages.ts` — rótulos, ações e estados
- `src/errors/error-messages.ts` — mensagens de erro por código

## Requisitos

- Node.js 22 (fixado em `.nvmrc` e `engines.node`)
- pnpm 9
- A API em execução, para qualquer tela além da inicial

## Configuração

```bash
cp .env.example .env
```

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `VITE_API_BASE_URL` | sim | URL base da API, sem barra final. Ex.: `http://localhost:3000` |

As variáveis são lidas no momento do build: alterá-las exige reiniciar o servidor de
desenvolvimento. Se estiver ausente ou malformada, a aplicação falha de forma explícita na
inicialização, em vez de emitir requisições para um endereço indefinido.

## Comandos

```bash
pnpm dev             # Servidor de desenvolvimento em http://localhost:5173
pnpm build           # Build de produção em dist/
pnpm preview         # Serve o build localmente
pnpm test            # Suíte Vitest
pnpm test:watch      # Vitest em modo observação
pnpm test:coverage   # Cobertura
pnpm typecheck       # Verificação de tipos (tsc --noEmit)
```

A partir da raiz do monorepo, use `pnpm --filter @open-nav-charts/web <script>`.

## Versões travadas por conflito de engine

⚠️ **Duas dependências estão propositalmente abaixo da versão mais recente.** O repositório
usa `engine-strict=true`, então uma divergência de `engines.node` **falha a instalação** em
vez de emitir aviso.

| Pacote | Versão usada | Versão corrente | Motivo |
|--------|--------------|-----------------|--------|
| `react-router` | 7.x | 8.x | A 8.x exige Node `>=22.22.0` |
| `jsdom` | 29.x | 30.x | A 30.x exige Node `^22.22.2` |

Elevar qualquer uma delas exige antes elevar o Node de **todo** o monorepo. Detalhes em
[`research.md`](../../specs/006-frontend-charts-spa/research.md) (R2 e R3).

## Organização do código

A estrutura é **feature-based**: o primeiro corte é por domínio, não por papel técnico.

```text
src/
├── app.tsx            # Composição de rotas
├── main.tsx           # Provedores e ponto de entrada
├── features/
│   ├── airports/      # Busca, detalhe e pistas de aeródromos
│   └── procedures/    # Procedimentos e acesso às cartas
└── shared/            # Transversal: cliente HTTP, erros, tema, i18n, layout, testes
```

Cada feature agrupa `api/`, `hooks/`, `components/` e `pages/` do seu domínio, e expõe um
`index.ts` que é sua **API pública**.

Três regras sustentam a fronteira:

1. **Importe features pelo barrel**, nunca por caminho interno. `features/airports/index.js`,
   não `features/airports/pages/airport-page.js`. O interior pode mudar sem quebrar quem
   consome.
2. **`shared/` não importa de `features/`.** A dependência é sempre feature → shared.
3. **Vocabulário de domínio comum vive em `shared/domain/`.** O código ICAO é usado pelas
   duas features; mantê-lo em `airports` faria `procedures` depender dela sem necessidade.

Para verificar que a fronteira segue íntegra:

```bash
# Nenhum cruzamento entre features fora dos barrels
grep -rn 'from "\.\./\.\./\(airports\|procedures\)/' src/features/ | grep -v '/index.js"'

# shared/ nunca depende de uma feature
grep -rn 'features/' src/shared/
```

Ambos devem sair vazios.

## Notas de implementação

Três decisões que não são óbvias ao ler o código:

**A carta abre por navegação, nunca por `fetch`.** A rota de carta da API responde `302` para
uma URL assinada válida por 300 segundos. `buildChartUrl` apenas monta o endereço; a URL
assinada só é gerada quando o navegador de fato navega, no clique. Por isso a URL **não pode**
ser armazenada, cacheada ou pré-carregada — fazê-lo produziria links expirados justamente no
caso que FR-017 existe para evitar.

**As mensagens de erro da API não vão para a tela.** A API responde
`{ error: { code, message } }`, com `message` em português. A interface deriva o texto exibido
sempre de `code`, através de `src/errors/error-messages.ts`.

**Os testes usam `src/testing/render.tsx`, não o `render` cru.** O `MantineProvider` chama
`window.matchMedia` na montagem, e jsdom não implementa essa API — sem os stubs de
`src/testing/setup-tests.ts`, todo teste de componente falha. O utilitário também monta os
provedores de tema, cache e roteamento.

## Documentos da feature

- [Especificação](../../specs/006-frontend-charts-spa/spec.md)
- [Plano de implementação](../../specs/006-frontend-charts-spa/plan.md)
- [Pesquisa técnica](../../specs/006-frontend-charts-spa/research.md)
- [Contrato do cliente de API](../../specs/006-frontend-charts-spa/contracts/api-client.md)
- [Contrato de rotas e estados](../../specs/006-frontend-charts-spa/contracts/ui-routes.md)
- [Guia de execução e validação](../../specs/006-frontend-charts-spa/quickstart.md)
