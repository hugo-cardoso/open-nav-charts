# Contrato: Scripts do Workspace

**Feature**: `001-monorepo-skeleton`

A interface pública deste repositório para quem desenvolve é o conjunto de scripts npm. Este
contrato fixa nome, comportamento e código de saída de cada um. Renomear ou remover qualquer
script listado aqui é uma quebra de contrato.

## Scripts da raiz

Executáveis como `pnpm <script>` a partir da raiz do repositório.

| Script | Comando | Comportamento | Saída `0` | Saída `≠0` |
|--------|---------|---------------|-----------|------------|
| `preinstall` | `npx only-allow pnpm` | Aborta a instalação se invocada por npm ou yarn | Gerenciador é pnpm | Outro gerenciador detectado |
| `lint` | `biome ci .` | Verifica lint e formatação sem escrever arquivos | Nenhuma violação | Ao menos uma violação |
| `lint:fix` | `biome check --write .` | Aplica correções automatizáveis de lint e formatação | Sem violações restantes | Violações não corrigíveis |
| `format` | `biome format --write .` | Aplica apenas formatação | Sempre, salvo erro de I/O | Erro de escrita |
| `typecheck` | `pnpm -r typecheck` | Verifica tipos de todos os pacotes | Nenhum erro de tipo | Erro em qualquer pacote |
| `test` | `pnpm -r test` | Executa a suíte de todos os pacotes | Todos os testes passam | Qualquer teste falha |
| `test:watch` | `pnpm -r --parallel test:watch` | Reexecuta ao detectar mudanças | (processo persistente) | — |
| `test:coverage` | `pnpm -r test:coverage` | Executa testes gerando relatório de cobertura | Testes passam e thresholds atendidos | Falha de teste ou threshold |
| `build` | `pnpm -r build` | Compila todos os pacotes que produzem artefato | Build de todos concluído | Falha em qualquer pacote |
| `check` | `pnpm lint && pnpm typecheck && pnpm test` | Portão agregado de pré-merge, aborta na primeira falha | Os três portões passam | Primeiro portão que falhar |

**Garantias transversais** (FR-027):

- Todo script não interativo comunica veredito exclusivamente por código de saída.
- Nenhum script de verificação (`lint`, `typecheck`, `test`, `check`) modifica arquivos
  versionados. Somente `lint:fix`, `format` e `build` escrevem.
- `check` propaga o código de saída do primeiro portão que falhar e não executa os seguintes.

## Scripts obrigatórios por pacote

Todo pacote sob `packages/*` ou `apps/*` MUST declarar:

| Script | Obrigatoriedade | Comportamento esperado |
|--------|-----------------|------------------------|
| `typecheck` | Sempre | `tsc --noEmit -p tsconfig.json` |
| `test` | Sempre (FR-018, D5) | `vitest run` — sucesso mesmo sem arquivos de teste |
| `test:watch` | Sempre | `vitest` em modo watch |
| `test:coverage` | Sempre | `vitest run --coverage` |
| `build` | Quando o pacote produz `dist` | `tsc -p tsconfig.json` |

**Regra de contrato**: um pacote que não declare `test` seria silenciosamente pulado por
`pnpm -r test`, produzindo falso sucesso. A obrigatoriedade acima existe justamente para
impedir isso — é a resolução do edge case correspondente na spec.

## Scripts de pacote e execução isolada

Cada script acima é executável para um pacote específico via
`pnpm --filter @open-nav-charts/<nome> <script>`, satisfazendo o cenário de aceitação 3 da
História 3. O veredito do escopo filtrado obedece às mesmas garantias de código de saída.
