<!--
Sync Impact Report — 1.1.0 (emenda de 2026-08-14)
- Version change: 1.0.0 → 1.1.0 (MINOR: expansão material de orientação)
- Modified principles: nenhum princípio alterado
- Added sections:
  - "Fluxo de Desenvolvimento" → subseção "Ramificação (GitFlow)": adota o modelo GitFlow,
    fixa `main` e `develop` como permanentes e define os prefixos `feature/*`, `release/*`
    e `hotfix/*` com origem, destino e regra de remoção após merge.
- Restructured sections:
  - "Fluxo de Desenvolvimento": conteúdo anterior agrupado sob a subseção "Commits e revisão",
    sem alteração de texto ou de obrigações.
- Removed sections: none
- Deferred TODOs: none
- Migração: branch `develop` criada a partir de `main`; nenhuma alteração de código exigida.

Sync Impact Report — 1.0.0 (adoção inicial)
- Version change: (unset template) → 1.0.0
- Ratification type: initial adoption; all template placeholders replaced with concrete rules.
- Modified principles:
  - [PRINCIPLE_1_NAME] → I. Monorepo pnpm com Node.js 22
  - [PRINCIPLE_2_NAME] → II. TypeScript como Padrão
  - [PRINCIPLE_3_NAME] → III. Orientação a Objetos no Backend, Composição no Frontend
  - [PRINCIPLE_4_NAME] → IV. Testes com Vitest (NÃO NEGOCIÁVEL)
  - [PRINCIPLE_5_NAME] → V. Qualidade Automatizada com Biome
- Added sections:
  - Restrições Tecnológicas (era [SECTION_2_NAME])
  - Fluxo de Desenvolvimento (era [SECTION_3_NAME])
  - Governança (preenchida)
- Removed sections: none
- Deferred TODOs: none
-->

# Constituição do open-nav-charts-v2

## Core Principles

### I. Monorepo pnpm com Node.js 22

O repositório MUST ser um monorepo único gerenciado por pnpm workspaces, declarado em
`pnpm-workspace.yaml` na raiz. Todo pacote MUST viver sob um diretório de workspace
(por exemplo `packages/` para bibliotecas e `apps/` para aplicações executáveis) e MUST
possuir um `package.json` com nome escopado e consistente.

- `pnpm` MUST ser o único gerenciador de pacotes; `npm install` e `yarn` são proibidos e
  os lockfiles `package-lock.json` e `yarn.lock` MUST NOT ser versionados.
- A versão do Node.js MUST ser a 22, fixada em `engines.node` de cada `package.json` e em
  um `.nvmrc` na raiz. Builds e CI MUST falhar em versões divergentes.
- Dependências compartilhadas entre pacotes MUST ser referenciadas via protocolo
  `workspace:*`, nunca por versões publicadas duplicadas.
- Um pacote MUST NOT importar arquivos internos de outro pacote por caminho relativo que
  atravesse fronteiras de workspace; a comunicação ocorre apenas por entrypoints públicos.

**Rationale**: Um único gerenciador e uma única versão de runtime eliminam divergências de
resolução de dependências entre máquinas e CI, e as fronteiras explícitas de workspace
mantêm o acoplamento entre pacotes visível e revisável.

### II. TypeScript como Padrão

Todo código de produção MUST ser escrito em TypeScript. JavaScript é permitido apenas em
arquivos de configuração que não suportem TypeScript, e cada exceção MUST ser justificada
em comentário no próprio arquivo.

- O modo `strict` do TypeScript MUST estar habilitado; desabilitar flags de strictness
  individuais requer justificativa registrada na revisão.
- `any` explícito MUST NOT ser usado em APIs públicas de pacotes; prefira `unknown` com
  narrowing ou tipos concretos.
- Aplicações de frontend MUST usar Vite como bundler e dev server, salvo justificativa
  técnica documentada no plano da feature.
- Tipos compartilhados entre pacotes MUST residir em um pacote de workspace dedicado, não
  duplicados por cópia.

**Rationale**: Tipagem estática estrita transforma contratos entre pacotes do monorepo em
erros de compilação em vez de falhas em tempo de execução, e Vite mantém o ciclo de
feedback do frontend curto.

### III. Orientação a Objetos no Backend, Composição no Frontend

Código fora do frontend (backend, bibliotecas de domínio, ferramentas de linha de comando)
MUST ser modelado com orientação a objetos: classes com responsabilidade única, estado
encapsulado e dependências recebidas por injeção via construtor.

- Colaboradores externos (I/O, rede, relógio, sistema de arquivos) MUST ser acessados
  através de interfaces, permitindo substituição em testes sem monkey-patching.
- Estado global mutável e singletons implícitos MUST NOT ser usados; a composição do grafo
  de objetos ocorre em um ponto de entrada explícito.
- O frontend está isento desta regra: componentes MUST ser funcionais e a lógica
  compartilhada MUST ser expressa por hooks e funções puras, não por hierarquias de classes.

**Rationale**: OO com injeção de dependência torna o domínio testável isoladamente, enquanto
o modelo funcional do frontend segue o idioma das bibliotecas de UI modernas — impor classes
ali criaria atrito sem ganho.

### IV. Testes com Vitest (NÃO NEGOCIÁVEL)

Vitest MUST ser o único framework de testes unitários do repositório. Jest, Mocha, AVA e
equivalentes MUST NOT ser adicionados.

- Toda lógica de domínio, regra de negócio e utilitário compartilhado MUST possuir testes
  unitários; correções de bug MUST incluir um teste que falha antes da correção.
- Testes MUST ser determinísticos: sem dependência de rede real, relógio do sistema não
  controlado ou ordem de execução entre arquivos.
- Cada pacote MUST expor o script `test` executável via `pnpm test`, e a suíte completa
  MUST passar antes de qualquer merge.
- Testes de integração são obrigatórios para contratos entre pacotes do workspace, mudanças
  em APIs públicas e schemas compartilhados.

**Rationale**: Um framework único mantém configuração, mocks e relatórios uniformes em todo
o monorepo, e Vitest compartilha a pipeline de transformação do Vite, evitando uma segunda
cadeia de build só para testes.

### V. Qualidade Automatizada com Biome

Biome MUST ser o linter e formatter do repositório, configurado por um único arquivo na
raiz que os pacotes herdam. ESLint e Prettier MUST NOT ser adicionados.

- Formatação MUST ser aplicada por Biome; estilo formatado manualmente contra a
  configuração é rejeitado na revisão.
- CI MUST executar verificação de lint e formatação, e MUST falhar em qualquer violação.
- Supressões de regra MUST ser pontuais, com comentário explicando o motivo; desabilitar
  regras globalmente exige alteração desta constituição ou da configuração revisada.

**Rationale**: Uma ferramenta única para lint e formatação elimina conflitos de regras
entre ferramentas concorrentes e mantém o diff focado em mudanças de comportamento.

## Restrições Tecnológicas

- **Runtime**: Node.js 22 (fixado em `.nvmrc` e `engines.node`).
- **Gerenciador de pacotes**: pnpm com workspaces.
- **Linguagem**: TypeScript em modo `strict`.
- **Frontend**: Vite como ferramenta de build preferencial; componentes funcionais.
- **Testes**: Vitest.
- **Lint e formatação**: Biome.
- Adotar qualquer ferramenta que substitua um item acima MUST ser tratado como emenda a
  esta constituição, não como decisão isolada de uma feature.

## Fluxo de Desenvolvimento

### Ramificação (GitFlow)

O repositório MUST seguir o modelo GitFlow. Duas branches são permanentes e MUST NOT ser
excluídas ou reescritas:

- `main` — reflete exclusivamente o que está em produção. Recebe merge apenas de `release/*`
  e `hotfix/*`; commits diretos MUST NOT ser feitos nela.
- `develop` — linha de integração do trabalho concluído. É a base de toda branch de feature e
  o destino padrão dos respectivos merges.

As demais branches são temporárias, MUST seguir o padrão de nome abaixo e MUST ser removidas
após o merge:

| Prefixo | Origem | Destino | Propósito |
|---------|--------|---------|-----------|
| `feature/*` | `develop` | `develop` | Nova funcionalidade ou alteração corrente |
| `release/*` | `develop` | `main` e `develop` | Estabilização e preparo de versão |
| `hotfix/*` | `main` | `main` e `develop` | Correção urgente em produção |

- O sufixo de uma `feature/*` SHOULD identificar a feature do Spec Kit correspondente,
  preservando seu prefixo numérico. Exemplo: `feature/001-monorepo-skeleton`.
- Merges de `release/*` e `hotfix/*` MUST ser aplicados em `main` **e** em `develop`, para que
  nenhuma correção se perca na próxima integração.
- Branches de longa duração fora deste modelo MUST NOT ser criadas sem emenda a esta
  constituição.

### Commits e revisão

- **Commits**: MUST seguir Conventional Commits (`tipo(escopo): descrição`). A descrição
  MUST ser escrita em português do Brasil. O escopo SHOULD identificar o pacote do
  workspace afetado. Exemplo: `feat(charts): adiciona eixo logaritmico ao grafico de linha`.
- **Breaking changes**: MUST ser sinalizadas com `!` após o escopo ou com rodapé
  `BREAKING CHANGE:`, descrevendo a migração necessária.
- **Portões de qualidade**: antes do merge, MUST passar — verificação de tipos, Biome
  (lint e formatação) e a suíte Vitest completa.
- **Revisão**: toda mudança MUST ser revisada quanto à conformidade com os princípios
  acima; desvios MUST ser justificados explicitamente na descrição da mudança.

## Governance

Esta constituição prevalece sobre convenções informais, preferências pessoais e padrões
herdados de outros projetos. Em caso de conflito entre esta constituição e qualquer outro
documento do repositório, esta constituição vence.

- **Emendas**: MUST ser propostas como alteração deste arquivo, com justificativa e, quando
  a mudança invalidar código existente, um plano de migração.
- **Versionamento**: segue versionamento semântico. MAJOR para remoção ou redefinição
  incompatível de princípio; MINOR para novo princípio ou expansão material de orientação;
  PATCH para esclarecimentos e correções não semânticas.
- **Conformidade**: revisões de código MUST verificar aderência aos princípios. Complexidade
  adicional MUST ser justificada; na ausência de justificativa, prevalece a alternativa mais
  simples.
- **Exceções**: MUST ser documentadas no plano da feature correspondente, com escopo e
  prazo definidos. Exceções não documentadas são violações.

**Version**: 1.1.0 | **Ratified**: 2026-08-14 | **Last Amended**: 2026-08-14
