# Research: Aplicação web de consulta a cartas

**Feature**: `006-frontend-charts-spa` | **Data**: 2026-08-15

Cada decisão abaixo foi verificada neste ambiente (Node v22.17.1, pnpm 9.9.0), não apenas
consultada em documentação. Os itens R2, R3 e R7 registram incompatibilidades reais que só
apareceram na execução e que teriam quebrado a implementação.

---

## R1. Biblioteca de interface e framework

**Decisão**: React 19.2.8 com Mantine 9.5.1 (`@mantine/core` + `@mantine/hooks`).

**Rationale**: O Mantine foi determinado pelo solicitante. Ele é distribuído exclusivamente
para React — `@mantine/core@9.5.1` declara `peerDependencies: { react: "^19.2.0",
"react-dom": "^19.2.0", "@mantine/hooks": "9.5.1" }`. Portanto React não é uma escolha
adicional, é consequência direta do Mantine, e a versão maior está fixada pelo peer: React
19.2 ou superior. A constituição já converge com isso ao exigir componentes funcionais e
hooks (Princípio III).

**Atenção**: `@mantine/hooks` deve ser fixado na **mesma versão exata** de `@mantine/core`
(peer `9.5.1`, sem intervalo). Divergir quebra a instalação.

**Alternativas consideradas**: nenhuma viável — trocar de framework exigiria abandonar o
Mantine, contrariando o pedido.

---

## R2. Versão do roteador — conflito de engine resolvido

**Decisão**: `react-router@7.18.2`, **não** a 8.x.

**Rationale**: `react-router@8.3.0` é a versão corrente, mas declara
`engines.node: ">=22.22.0"`. O ambiente roda **Node v22.17.1** e o repositório tem
`engine-strict=true` no `.npmrc`, o que transforma essa divergência em falha de instalação,
não em aviso. Verificado empiricamente:

```
ERR_PNPM_UNSUPPORTED_ENGINE  Unsupported environment
Your Node version is incompatible with "react-router@8.3.0".
Expected version: >=22.22.0 / Got: v22.17.1
```

A 7.18.2 exige apenas `engines.node: ">=20.0.0"` e peers `react: ">=18"`, instalando sem
erro. A constituição fixa `engines.node: "22.x"` e `.nvmrc` com `22`, sem exigir um patch
mínimo — adotar a 8.x obrigaria a elevar o piso de Node de todo o monorepo, uma mudança de
alcance muito maior do que esta feature.

**Alternativas consideradas**:
- *react-router 8 + elevar Node*: rejeitado — afeta todos os pacotes e o CI por uma feature
  de frontend; a 7.x entrega roteamento declarativo equivalente ao que a spec pede.
- *Roteador próprio sobre a History API*: rejeitado — reimplementaria correspondência de
  rotas e histórico (FR-003, FR-004) sem ganho.

**Revisão futura**: ao elevar o Node do monorepo para ≥ 22.22, migrar para a 8.x.

---

## R3. Ambiente de teste de componentes — conflito de engine resolvido

**Decisão**: Vitest 4.1.10 com `environment: "jsdom"` em `jsdom@29.1.1`, mais
`@testing-library/react@16.3.2` e `@testing-library/user-event`.

**Rationale**: A constituição fixa Vitest como framework único (Princípio IV), então a
questão era só o ambiente de DOM. `jsdom@30.0.1` (corrente) declara
`engines.node: "^22.22.2 || ^24.15.0 || >=26.0.0"` e falha na instalação pelo mesmo motivo
do R2, verificado empiricamente. A `29.1.1` aceita `^22.13.0` e instala sem erro.

Testing Library foi escolhida por consultar a árvore por papel acessível e texto visível, o
que faz os testes exercitarem a mesma superfície que SC-007 exige (operação por teclado e
foco visível).

**Alternativas consideradas**:
- *Vitest Browser Mode com Playwright*: rejeitado nesta versão — exige baixar navegadores no
  CI e um segundo runner; jsdom cobre os testes de componente, e o comportamento realmente
  dependente de navegador (abertura de nova aba, R6) é validado manualmente pelo quickstart.
- *happy-dom*: rejeitado — menor fidelidade em foco e eventos de teclado, justamente o que
  SC-007 mede.

---

## R4. Build e configuração de estilos

**Decisão**: Vite 8.2.1 com `@vitejs/plugin-react@6.0.5`, mais PostCSS com
`postcss-preset-mantine` e `postcss-simple-vars`.

**Rationale**: Vite é imposto pelo Princípio II. O Mantine distribui CSS que depende do
`postcss-preset-mantine` para resolver suas funções de tema e consultas de mídia — sem ele,
mixins responsivos não são processados, o que atinge diretamente FR-025.

`@vitejs/plugin-react@6.0.5` declara peers `@rolldown/plugin-babel` e
`babel-plugin-react-compiler`; ambos estão marcados como `optional: true` em
`peerDependenciesMeta` (verificado), então **não** precisam ser instalados e não quebram o
`engine-strict`.

**Verificação executada**: build de produção real com React 19 + Mantine 9 + Vite 8:

```
vite v8.2.1 building client environment for production...
✓ 809 modules transformed.
dist/assets/index-*.css  230.90 kB │ gzip: 33.76 kB
dist/assets/index-*.js   244.69 kB │ gzip: 75.49 kB
✓ built in 402ms
```

`@mantine/core/styles.css` **MUST** ser importado antes dos estilos próprios da aplicação;
a ordem de importação define a precedência das camadas.

---

## R5. Armadilha de teste: `matchMedia` ausente no jsdom

**Decisão**: o arquivo de setup do Vitest MUST instalar stubs de `window.matchMedia` e
`ResizeObserver`.

**Rationale**: Descoberto na execução, não na documentação. Renderizar qualquer componente
dentro de `MantineProvider` sob jsdom falha imediatamente:

```
TypeError: window.matchMedia is not a function
 ❯ setColorSchemeAttribute .../use-provider-color-scheme.ts:13:11
```

O provider resolve o esquema de cores por `matchMedia` na montagem, e jsdom não implementa
essa API. Sem o stub, **todo** teste de componente falha — não é um caso de borda. Com o
stub aplicado, a mesma suíte passa (`Test Files 1 passed / Tests 1 passed`, verificado).

`ResizeObserver` é stubbado pelo mesmo motivo: componentes de layout responsivo do Mantine o
utilizam, e sua ausência produz falhas intermitentes conforme os componentes usados.

**Consequência para o plano**: os testes MUST renderizar através de um utilitário próprio
que já envolve o componente em `MantineProvider` (e nos demais provedores), em vez de chamar
`render` diretamente. Isso evita repetir a montagem de contexto em cada arquivo.

---

## R6. Abertura da carta e o redirect 302

**Decisão**: a abertura da carta é uma **navegação do navegador** para
`GET /v1/airports/:icao/procedures/:id/chart`, em nova aba, disparada no momento do clique.
A aplicação MUST NOT buscar essa rota via `fetch`.

**Rationale**: A rota não devolve o documento; ela responde `302` com `Location` apontando
para uma URL assinada do repositório de objetos, com `Cache-Control: no-store`
(`procedures-router.ts:42-43`). O TTL da assinatura é de **300 segundos**
(`CHART_URL_TTL_SECONDS` em `chart-service.ts:12`).

Três consequências que sustentam requisitos da spec:

1. **FR-017 (link não expira na mão do usuário)**: como o endereço é resolvido a cada
   acionamento e a assinatura só vive 300 s, a aplicação MUST NOT guardar a URL assinada em
   estado nem em cache. Pré-carregar a carta ao listar procedimentos produziria links
   expirados — é justamente o que o requisito proíbe.
2. **FR-016 (painel preservado)**: navegar em nova aba mantém a aplicação montada, sem
   perder resultados de busca já carregados.
3. **Evita o problema de CORS no redirect**: seguir o `302` por `fetch` exigiria que o
   destino (o repositório de objetos) também respondesse cabeçalhos CORS para a origem da
   aplicação, o que não está sob controle desta feature. Navegação direta não passa por essa
   verificação.

**Alternativas consideradas**:
- *Visualizador de PDF embutido*: descartado pelo solicitante durante a especificação.
- *`fetch` seguido de `blob:`*: rejeitado — depende de CORS no repositório de objetos, faz o
  documento inteiro trafegar pela aplicação e desperdiça o desenho de redirect da API.

---

## R7. Consumo da API e tradução de erros

**Decisão**: um cliente de API próprio, tipado à mão a partir do código da API, com
`@tanstack/react-query@5.101.4` para estado de servidor. A interface MUST exibir texto
derivado do campo `error.code`, **nunca** do campo `error.message`.

**Rationale**: Verificado no código da API, e este é o ponto mais importante desta pesquisa.
Toda falha responde no envelope `{ error: { code, message } }` (`error-handler.ts`), onde
`code` pertence a uma lista fechada e estável em inglês (`ERROR_CODES` em `api-error.ts`),
mas `message` é **texto em português do Brasil** — por exemplo
`"O ICAO deve ter exatamente 4 letras."`.

Como FR-024 exige que todo texto visível esteja em inglês, repassar `message` à tela violaria
o requisito. Mapear `code` → texto em inglês na aplicação resolve isso sem alterar a API e
sem tocar no Princípio VI, que continua valendo para a API (suas mensagens são dirigidas a
quem integra, não ao usuário final desta interface).

O React Query foi escolhido por entregar, prontos, três comportamentos exigidos pela spec:
descarte de respostas obsoletas em digitação contínua (FR-012), estados de carregamento e
erro distintos (FR-010, FR-019) e nova tentativa preservando os parâmetros (FR-021). Seu peer
é `react: "^18 || ^19"`, compatível.

**Contrato observado no código** (a fonte da verdade é o código, não o contrato escrito da
feature 003): `GET /v1/airports` devolve cada item com a localidade **agrupada** em um objeto
`location` contendo `city`, `state`, `country`, `latitude` e `longitude`
(`responses.ts:69-81`). O documento `specs/003-rest-api-airports/contracts/rest-api.md` ainda
mostra esses campos na raiz do item — está **desatualizado** em relação à feature 005, que
introduziu o agrupamento e o país. O cliente MUST seguir o código.

**Alternativas consideradas**:
- *Traduzir no servidor por `Accept-Language`*: rejeitado — alteraria a API, que esta feature
  assume estável, e forçaria infraestrutura de i18n no backend.
- *`fetch` cru com `useState`/`useEffect`*: rejeitado — reimplementaria descarte de resposta
  obsoleta (FR-012) e controle de nova tentativa, exatamente onde erros de concorrência são
  sutis e difíceis de testar.

---

## R8. CORS

**Decisão**: nenhuma configuração de proxy é necessária; a aplicação chama a API diretamente
pela sua URL, lida de variável de ambiente de build.

**Rationale**: A API aplica `cors({ origin: "*", methods: ["GET"] })`
(`create-app.ts:40`), então qualquer origem pode ler suas respostas. Como a aplicação é
somente leitura e não envia credenciais, o curinga é suficiente e nenhuma alteração no
backend é exigida.

---

## R9. Configuração de TypeScript do pacote

**Decisão**: o pacote do frontend estende `tsconfig.base.json`, mas **sobrescreve**
`module`/`moduleResolution` para `preserve`/`bundler`, troca `types` de `["node"]` para
`["vite/client"]` e acrescenta `lib: ["DOM", "DOM.Iterable"]` e `jsx: "react-jsx"`.

**Rationale**: A base do monorepo é voltada a Node (`module: "NodeNext"`, `types: ["node"]`,
`lib: ["ES2023"]` sem DOM) — apropriada para a API e os jobs, inadequada para código de
navegador processado por bundler. As flags de rigor da base (`strict`,
`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`) são
**mantidas**, então o Princípio II continua satisfeito integralmente.

**Verificação executada**: `tsc` com TypeScript 7.0.2 (a versão do monorepo) sobre esta
configuração, com React 19, Mantine 9 e JSX — saída limpa, `EXIT=0`.

**Nota**: diferente dos demais pacotes, o build de produção é feito pelo Vite; o `tsc` atua
apenas como verificador de tipos (`noEmit`), o que é o papel do script `typecheck`.

---

## Versões fixadas

Todas instaladas e exercitadas em conjunto neste ambiente.

| Pacote | Versão | Observação |
|--------|--------|-----------|
| `react` / `react-dom` | 19.2.8 | exigido pelo peer do Mantine 9 |
| `@mantine/core` / `@mantine/hooks` | 9.5.1 | versões idênticas, obrigatório |
| `react-router` | 7.18.2 | **não** 8.x — engine de Node (R2) |
| `@tanstack/react-query` | 5.101.4 | estado de servidor |
| `vite` | 8.2.1 | Princípio II |
| `@vitejs/plugin-react` | 6.0.5 | peers de Babel são opcionais |
| `vitest` | 4.1.10 | versão do monorepo |
| `jsdom` | 29.1.1 | **não** 30.x — engine de Node (R3) |
| `@testing-library/react` | 16.3.2 | com `user-event` e `jest-dom` |
| `postcss-preset-mantine` | 1.18.0 | com `postcss-simple-vars` |
| `typescript` | 7.0.2 | herdado da raiz |
