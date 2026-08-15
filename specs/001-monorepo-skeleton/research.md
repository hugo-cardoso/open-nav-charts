# Phase 0 Research: Esqueleto do Monorepo

**Feature**: `001-monorepo-skeleton` | **Date**: 2026-08-14

A constituição do projeto já fixa o conjunto de ferramentas (pnpm + workspaces, TypeScript
strict, Vite, Vitest, Biome, Node.js 22). Esta pesquisa, portanto, não reabre a escolha de
ferramentas — resolve as decisões de **configuração e topologia** que a constituição deixa em
aberto e que o plano precisa fixar antes da implementação.

## Verificação de ambiente e versões

Consultado em 2026-08-14 no registry npm e no ambiente local:

| Item | Valor | Origem |
|------|-------|--------|
| Node.js local | 22.17.1 | `node -v` |
| pnpm local | 9.9.0 | `pnpm -v` |
| `typescript` latest | 7.0.2 | `npm view typescript dist-tags` |
| `vite` latest | 8.2.1 | `npm view vite dist-tags` |
| `vitest` latest | 4.1.10 | `npm view vitest version` |
| `@vitest/coverage-v8` latest | 4.1.10 | `npm view @vitest/coverage-v8 version` |
| `@biomejs/biome` latest | 2.5.8 | `npm view @biomejs/biome version` |

Compatibilidade confirmada:

- `vitest@4.1.10` declara `engines.node: ^20 || ^22 || >=24` e peer `vite: ^6 || ^7 || ^8` — Vite 8 é suportado.
- `vite@8.2.1` declara `engines.node: ^20.19 || >=22.12` — Node 22.17.1 satisfaz.
- `@biomejs/biome@2.5.8` declara `engines.node: >=14.21.3` — sem restrição relevante.
- `typescript@7.0.2` é a tag `latest` estável (não beta/rc).

---

## D1 — Estratégia de execução dos comandos agregadores

**Decisão**: Usar `pnpm -r` (recursivo sobre o workspace) para os portões de tipos e testes, e
invocar o Biome uma única vez na raiz para o portão de qualidade. Nenhum orquestrador de build
adicional (Turborepo, Nx, Lerna) será introduzido.

**Rationale**: FR-009 e FR-017 pedem um comando único na raiz que cubra todos os pacotes, e
FR-024 pede que os comandos sejam scripts nomeados descobríveis no manifesto raiz. `pnpm -r`
entrega exatamente isso sem dependência extra. O Biome varre a árvore de arquivos por conta
própria a partir de um único `biome.json` na raiz, então executá-lo por pacote seria trabalho
duplicado — isso também satisfaz FR-011 (configuração em ponto único) e FR-004/SC-004 (pacote
novo coberto sem alterar a raiz), já que um pacote novo cai automaticamente sob a varredura.

**Alternatives considered**:

- *Turborepo*: adiciona cache e paralelismo, mas em um esqueleto com dois pacotes o ganho é
  nulo e a constituição exige justificar complexidade adicional (Governance). Rejeitado por
  agora; pode ser adotado quando o tempo de execução dos portões justificar.
- *Biome por pacote*: multiplicaria a configuração e violaria FR-011.

---

## D2 — Herança da configuração TypeScript

**Decisão**: Um `tsconfig.base.json` na raiz com todas as flags estritas, sem `include`/
`files`. Cada pacote tem seu `tsconfig.json` com `extends: "../../tsconfig.base.json"`,
definindo apenas `include`, `outDir` e `rootDir`. A raiz também terá um `tsconfig.json`
mínimo (para o editor) que não compila nada por si só.

**Rationale**: FR-014 exige base única na raiz herdada por todos os pacotes. Separar
`tsconfig.base.json` (regras) de `tsconfig.json` (escopo de compilação) evita que o
type-check da raiz tente compilar arquivos dos pacotes com o `rootDir` errado. As flags
estritas vão além de `strict: true` — incluem `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride` e `noFallthroughCasesInSwitch` — porque a
constituição (Princípio II) manda habilitar o modo estrito e trata o afrouxamento como
exceção justificada, não como ponto de partida.

**Alternatives considered**:

- *TypeScript project references (`composite`)*: dá build incremental correto entre pacotes,
  mas exige `references` manuais em cada pacote e um passo de build antes do type-check. Para
  dois pacotes é overhead; a decisão pode ser revisitada quando o grafo de dependências
  crescer.
- *Um único `tsconfig.json` na raiz cobrindo tudo*: quebra a execução isolada por pacote
  (FR-018 aplica o mesmo princípio a testes) e impede `outDir` por pacote.

---

## D3 — Consumo entre pacotes do workspace

**Decisão**: Dependências internas declaradas como `"@open-nav-charts/<nome>": "workspace:*"`.
Cada pacote publica sua superfície pública via campo `exports` no `package.json`, apontando
para o código-fonte TypeScript durante o desenvolvimento (condição `development`) e para o
`dist` compilado no restante dos casos.

**Rationale**: FR-005 exige resolução interna sem consultar versões publicadas — `workspace:*`
é o mecanismo do pnpm para isso. O Princípio I proíbe importar arquivos internos de outro
pacote por caminho relativo atravessando fronteiras; o campo `exports` é o que torna essa
regra mecanicamente aplicável, porque o que não está em `exports` simplesmente não resolve.

**Alternatives considered**:

- *Path aliases no tsconfig* (`paths`): resolve na compilação mas não em tempo de execução do
  Node, exigindo um resolvedor adicional. Rejeitado.
- *Apontar `main` para `src` sempre*: simples, mas impede que a aplicação consuma a biblioteca
  compilada, escondendo erros de build até o deploy.

---

## D4 — Configuração de testes no workspace

**Decisão**: Um arquivo `vitest.shared.ts` na raiz exportando a configuração comum
(ambiente `node`, padrão de arquivos `**/*.test.ts`, provider de cobertura `v8`, thresholds).
Cada pacote tem um `vitest.config.ts` que faz merge dessa base com o que for específico.
O comando raiz `pnpm -r test` executa a suíte de cada pacote.

**Rationale**: FR-021 exige base compartilhada com sobrescrita por pacote, e FR-018 exige
script de teste próprio por pacote. Essa topologia atende ambos. A escolha de `v8` como
provider de cobertura (FR-020) evita instrumentação por transformação, mantendo os testes mais
rápidos e o resultado determinístico (FR/SC-007).

**Alternatives considered**:

- *Vitest workspace/projects (um único processo com todos os pacotes)*: dá um relatório
  agregado mais limpo em uma execução só, mas acopla a execução à raiz e enfraquece FR-018
  (execução isolada genuína por pacote). Rejeitado para o esqueleto; é a evolução natural se o
  relatório agregado se tornar prioridade.
- *Cobertura com `istanbul`*: mais preciso em casos de transpilação exótica, porém mais lento
  e desnecessário aqui.

---

## D5 — Tratamento de pacote sem testes e sem script

**Decisão**: Todo pacote do workspace MUST declarar o script `test`; o esqueleto garante isso
nos dois pacotes iniciais. A configuração compartilhada de Vitest define
`passWithNoTests: true`, de modo que um pacote sem arquivos de teste ainda retorna sucesso.

**Rationale**: Resolve dois edge cases da spec. `pnpm -r test` pula silenciosamente pacotes sem
o script — silêncio é exatamente o falso sucesso que o edge case alerta. Exigir o script em
todo pacote (verificável na revisão e por um teste de estrutura) elimina a ambiguidade, e
`passWithNoTests` impede que um pacote recém-criado quebre o portão só por ainda não ter
testes.

**Alternatives considered**:

- *Deixar `passWithNoTests: false`*: torna a criação de pacote novo imediatamente vermelha,
  atritando com SC-004.
- *Confiar no skip do `pnpm -r`*: rejeitado pelo motivo acima.

---

## D6 — Como bloquear gerenciadores de pacotes não suportados

**Decisão**: Combinar três mecanismos: `packageManager: "pnpm@9.9.0"` no `package.json` raiz
(Corepack), `engines.node: "22.x"` em todos os manifestos, e um `preinstall` na raiz com
`npx only-allow pnpm`.

**Rationale**: FR-007 exige rejeição ativa, não apenas documentação. `only-allow` falha
imediatamente em `npm install`/`yarn install` com mensagem apontando o gerenciador correto —
é o que cobre o cenário de aceitação 3 da História 1. `packageManager` fixa a versão do pnpm
via Corepack, e `engines.node` cobre o cenário 2 (runtime divergente). Adicionalmente,
`engine-strict=true` no `.npmrc` faz a divergência de Node falhar em vez de apenas avisar.

**Alternatives considered**:

- *Apenas `packageManager`*: Corepack pode não estar habilitado na máquina, tornando o bloqueio
  silencioso.
- *Apenas documentação no README*: não satisfaz FR-007, que pede rejeição.

---

## D7 — Natureza dos pacotes de exemplo

**Decisão**: Dois pacotes. `packages/core` — biblioteca TypeScript pura, sem dependências de
runtime, expondo uma função mínima com teste. `apps/cli` — aplicação Node executável que
importa `@open-nav-charts/core` via `workspace:*` e imprime um resultado, com teste próprio.

**Rationale**: FR-002 e FR-004 exigem um exemplo em cada categoria. A spec (Assumptions) diz
explicitamente que a aplicação de exemplo não precisa de interface de usuário nesta feature.
Uma CLI é a aplicação executável mais barata que ainda exercita de verdade o consumo
cruzado entre pacotes — o que é o ponto de FR-005 e do cenário 2 da História 4. Uma app Vite
com UI adicionaria bundler, DOM e dependências de teste de componente sem provar nada a mais
sobre o esqueleto.

**Alternatives considered**:

- *App Vite + React*: prova o caminho de frontend previsto pela constituição, mas infla o
  escopo desta feature e antecipa decisões de UI que ainda não foram especificadas. Fica para a
  feature que realmente introduzir o frontend — o esqueleto não impede sua adição.
- *Apenas um pacote biblioteca*: não satisfaz FR-002/FR-004 nem exercita `workspace:*`.

---

## D8 — Escopo de nome dos pacotes

**Decisão**: Escopo npm `@open-nav-charts/`, com o nome do diretório igual ao sufixo do pacote
(`packages/core` → `@open-nav-charts/core`).

**Rationale**: FR-003 exige nome escopado seguindo padrão único e consistente. Derivar o nome
do caminho torna o padrão verificável mecanicamente e elimina a ambiguidade que causaria o
edge case de nomes duplicados. O escopo espelha o nome do repositório.

**Alternatives considered**:

- *Nomes sem escopo* (`core`, `cli`): alto risco de colisão com pacotes públicos e proibido
  implicitamente por FR-003.

---

## D9 — Regras do Biome no ponto de partida

**Decisão**: `biome.json` na raiz com `linter.rules.recommended: true`, formatter habilitado
(indentação por espaço, largura 100), organização de imports ativa, e `files.includes`
excluindo os diretórios de artefatos. Nenhuma regra desabilitada globalmente no ponto de
partida.

**Rationale**: FR-011, FR-012 e FR-013 pedem, respectivamente, configuração única, falha em
violação e exclusão de artefatos. O Princípio V trata desabilitar regra globalmente como
alteração que exige revisão — logo o estado inicial correto é o conjunto recomendado íntegro,
e SC-005 exige que tudo passe sem verificações desabilitadas.

**Alternatives considered**:

- *Habilitar grupos além do recomendado (`nursery`, `style` completo)*: regras instáveis ou
  opinativas gerariam ruído antes de existir código real. Podem ser ativadas
  incrementalmente.

---

## D10 — Comando agregador de pré-merge

**Decisão**: Script `check` na raiz que executa, em sequência e abortando na primeira falha:
`biome ci` → `pnpm -r typecheck` → `pnpm -r test`.

**Rationale**: FR-026 pede um agregador único dos portões exigidos antes do merge, e o Fluxo
de Desenvolvimento da constituição lista exatamente esses três. `biome ci` é o modo do Biome
para automação — não escreve arquivos e falha em qualquer divergência, ao contrário de
`biome check --write`. O encadeamento com `&&` garante FR-027 (código de saída propagado).

**Alternatives considered**:

- *Executar os três em paralelo*: mais rápido, mas mistura a saída de erro de três ferramentas
  e dificulta a leitura em um esqueleto onde a execução já é quase instantânea.
- *`biome check` em vez de `biome ci`*: arriscaria modificar arquivos dentro de uma verificação
  de CI.

---

## Resumo das versões a fixar

| Pacote | Versão | Onde |
|--------|--------|------|
| Node.js | 22 (`.nvmrc`: `22`, `engines.node`: `22.x`) | raiz + todos os pacotes |
| pnpm | `9.9.0` (`packageManager`) | raiz |
| `typescript` | `^7.0.2` | devDependency raiz |
| `@biomejs/biome` | `^2.5.8` | devDependency raiz |
| `vitest` | `^4.1.10` | devDependency raiz |
| `@vitest/coverage-v8` | `^4.1.10` | devDependency raiz |
| `@types/node` | `^22` | devDependency raiz |

Vite **não** entra como dependência nesta feature: nenhum pacote do esqueleto é frontend
(D7), e o Vitest 4 traz sua própria pipeline de transformação. Ele será adicionado pela
feature que introduzir a aplicação de frontend, conforme o Princípio II.

**Todos os NEEDS CLARIFICATION resolvidos.**
