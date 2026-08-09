# Tasks: Importação completa de pacotes de agentes do GitHub

## Estado da implementação

- Implementação do inventário completo, plano, staging, adapters, hooks,
  fallbacks autorizados, proveniência, IPC/preload e UI concluída.
- Inventário de importação do GitHub simplificado por grupos de decisão,
  com seleção conservadora e suporte técnico recolhível.
- `npm test`: 59 arquivos e 360 testes aprovados.
- `npm run typecheck`: aprovado.
- `npm run build`: main, preload e renderer aprovados.
- `git diff --check`: aprovado; apenas avisos de normalização LF/CRLF.
- `npm run lint`: bloqueado pelo baseline do repositório (`.eslintrc.js` com
  ESLint 9, que exige `eslint.config.js`); nenhuma configuração foi alterada
  fora do escopo.
- Smoke manual com uma revisão fixa do GitHub ainda deve ser executado pelo
  usuário antes do release; os testes automatizados não usam rede nem
  executam scripts de terceiros.

## Phase 1: Análise confiável

## Task 1: Contratos de importação e segurança de paths

**Description:** Definir unions/interfaces de análise e um utilitário único para
normalizar paths relativos da árvore GitHub, rejeitando traversal, absoluto,
symlink e escape do subpath.

**Acceptance criteria:**
- [ ] Contratos discriminados para componentes, análise, plano, destinos,
      capacidades, conflitos e resultados; sem `any`.
- [ ] Paths válidos usam `/`; `..`, drive Windows, absoluto, symlink e escape
      são rejeitados com erro tipado.
- [ ] Limites de tamanho, blob/tree e modo de arquivo são representados.

**Verification:**
- [ ] `npx vitest run src/main/services/import-path.service.test.ts`
- [ ] Fixtures cobrem separadores mistos, drive, traversal e symlink.
- [ ] `npm run typecheck`

**Dependencies:** None

**Files likely touched:**
- `src/main/types/import.ts`
- `src/main/types/github.ts`
- `src/main/services/import-path.service.ts`
- `src/main/services/import-path.service.test.ts`

**Estimated scope:** Medium: 4 files

## Task 2: Aquisição por revisão resolvida

**Description:** Resolver branch/tag para commit/tree SHA e usar a revisão
imutável para árvore e contents, preservando token, rate limit, URL e subpath.

**Acceptance criteria:**
- [ ] Metadados registram ref solicitada, commit SHA e tree SHA.
- [ ] Árvore pertence ao commit resolvido; ref inexistente, truncamento e
      rate limit produzem erro explícito.
- [ ] Conteúdo usa path validado e a mesma revisão; URL/subpath atual continua
      compatível.

**Verification:**
- [ ] `npx vitest run src/main/services/github-import.service.test.ts src/main/services/github-import.service.advanced.test.ts`
- [ ] Testes cobrem branch não-main, tag/ref, SHA, árvore truncada e erro API.
- [ ] `npm run typecheck`

**Dependencies:** Task 1

**Files likely touched:**
- `src/main/services/github-import.service.ts`
- `src/main/types/github.ts`
- `src/main/services/github-import.service.test.ts`

**Estimated scope:** Medium: 3 files

## Task 3: Detector de componentes e grafo

**Description:** Criar detector manifest-first que transforma a árvore em
componentes, relaciona arquivos compartilhados e registra manual steps de
documentação sem executar nada.

**Acceptance criteria:**
- [ ] Fixture equivalente a `agent-skills` detecta plugin/bundle, skills,
      agents, commands, hooks, scripts, references e manifestos.
- [ ] Pai/filho e `dependsOn` evitam duplicação e incluem recursos
      compartilhados necessários.
- [ ] Manifest inválido, referência ausente, arquivo excluído e comando
      documentado aparecem com status/motivo.

**Verification:**
- [ ] `npx vitest run src/main/services/github-component-detector.service.test.ts`
- [ ] Teste cobre `SKILL.md`, `*.agent.md`, comandos, hooks, plugin e script.
- [ ] Nenhum teste usa rede ou shell.

**Dependencies:** Task 2

**Files likely touched:**
- `src/main/services/github-component-detector.service.ts`
- `src/main/services/github-component-detector.service.test.ts`
- `src/main/services/github-import.service.ts`

**Estimated scope:** Medium: 3 files

## Checkpoint: Análise

- [ ] Fixture lista componentes e dependências sem escrever/executar.
- [ ] Traversal e paths não permitidos são bloqueados.
- [ ] Testes focados e typecheck passam.
- [ ] Revisão humana confirma que o inventário é completo.

## Phase 2: Plano e barreiras de execução

## Task 4: Plano de seleção, destinos e dependências

**Description:** Criar planos a partir da análise, com seleção em cascata,
destinos por item, capabilities, risco, validade e identidade da revisão.

**Acceptance criteria:**
- [ ] Bundle/categoria inclui dependências obrigatórias; seleção individual
      permanece possível quando não quebra o grafo.
- [ ] Cada item recebe target/escopo/projeto válidos ou status manual/unsupported.
- [ ] Plano registra revisão, destinos, operação, risco e expiração; análise
      alterada invalida instalação.

**Verification:**
- [ ] `npx vitest run src/main/services/import-plan.service.test.ts`
- [ ] Testes cobrem seleção parcial, recurso compartilhado, destino ausente,
      target incompatível e plano expirado.
- [ ] `npm run typecheck`

**Dependencies:** Task 3

**Files likely touched:**
- `src/main/services/import-plan.service.ts`
- `src/main/services/import-plan.service.test.ts`
- `src/main/types/import.ts`

**Estimated scope:** Medium: 3 files

## Task 5: Staging seguro e materialização

**Description:** Criar snapshot selecionado em staging central, preservando
texto/binário, validando limites e preparando fonte para adapters/fallback.

**Acceptance criteria:**
- [ ] Staging fica em `getAppDataDir()/imports/<importId>/source` e registra
      revisão, tamanho/hash e arquivos.
- [ ] Binário permitido é preservado; symlink, traversal, absoluto e grande
      demais são bloqueados antes da escrita.
- [ ] Repetir staging é idempotente e nunca remove fonte do usuário.

**Verification:**
- [ ] `npx vitest run src/main/services/import-staging.service.test.ts`
- [ ] Filesystem real cobre texto, binário, limite, cancelamento e cleanup.
- [ ] `npm run typecheck`

**Dependencies:** Task 4

**Files likely touched:**
- `src/main/services/import-staging.service.ts`
- `src/main/services/import-staging.service.test.ts`
- `src/main/services/github-import.service.ts`
- `src/main/utils/paths.ts`

**Estimated scope:** Medium: 4 files

## Task 6: Fallback de comando autorizado

**Description:** Separar proposta, preview, autorização, execução, saída e
cancelamento de comandos detectados na documentação.

**Acceptance criteria:**
- [ ] Análise só produz manual step; execução exige planId, commandId e
      confirmação registrada.
- [ ] `spawn`/`execFile` opera sem shell por padrão, em cwd do staging, com
      ambiente controlado, stdout/stderr limitados e AbortSignal.
- [ ] Shell, .cmd/.bat, elevação ou comando não decomponível recebem confirmação
      extra e resultado com code/sinal/saída/erro.

**Verification:**
- [ ] `npx vitest run src/main/services/import-command.service.test.ts`
- [ ] Testes cobrem ausência de execução na análise, saída, cancelamento,
      executable ausente, quoting e comando forjado.
- [ ] Smoke Windows cobre `npx.cmd`/`npm.cmd` e shell explícito.

**Dependencies:** Task 5

**Files likely touched:**
- `src/main/services/import-command.service.ts`
- `src/main/services/import-command.service.test.ts`
- `src/main/types/import.ts`

**Estimated scope:** Medium: 3 files

## Task 7: Ciclo de vida seguro de hooks

**Description:** Modelar hooks como componentes declarativos com evento,
payload, preview/diff, backup, ativação e desativação para schemas conhecidos.

**Acceptance criteria:**
- [ ] Hook e payload são staged/instalados como disabled na primeira operação.
- [ ] Ativação revalida destino, mostra evento/diff, cria backup e altera apenas
      schema suportado.
- [ ] Hook desconhecido fica manual/staged; desativação não apaga a fonte.

**Verification:**
- [ ] `npx vitest run src/main/services/import-hook.service.test.ts`
- [ ] Fixtures cobrem `hooks/hooks.json`, SessionStart, script ausente,
      config inválida, backup, ativação e desativação.
- [ ] Nenhum fixture executa script real.

**Dependencies:** Tasks 4-5

**Files likely touched:**
- `src/main/services/import-hook.service.ts`
- `src/main/services/import-hook.service.test.ts`
- `src/main/types/import.ts`

**Estimated scope:** Medium: 3 files

## Checkpoint: Plano seguro

- [ ] Plano/staging podem ser gerados sem instalar.
- [ ] Fallback e hooks têm barreiras e testes próprios.
- [ ] Renderer não autoriza path/comando arbitrário.
- [ ] Typecheck e testes focados passam.

## Phase 3: Instalação nativa e proveniência

## Task 8: Registry de capacidades e adaptador de skill

**Description:** Criar registry de adapters e conectar skill ao SkillService,
LinkService, IDEAdapterService e escopos existentes.

**Acceptance criteria:**
- [ ] Registry declara target, tipo, escopo, operação, preview, conflito,
      rollback e ativação.
- [ ] Skill preserva auxiliares, origem/revisão, central root e links atuais.
- [ ] Target/escopo/projeto são resolvidos no main usando catálogo/overrides;
      destino inválido bloqueia.

**Verification:**
- [ ] `npx vitest run src/main/services/import-adapter.service.test.ts src/main/services/ide-adapter.service.test.ts`
- [ ] Testes cobrem o catálogo atual e raízes compartilhadas.
- [ ] Regressão de SkillService/links passa.

**Dependencies:** Tasks 4-5

**Files likely touched:**
- `src/main/services/import-adapter.service.ts`
- `src/main/services/import-adapter.service.test.ts`
- `src/main/services/ide-adapter.service.ts`
- `src/main/services/ide-adapter.service.test.ts`

**Estimated scope:** Medium: 4 files

## Task 9: Operações de arquivos, conflitos e rollback

**Description:** Aplicar operações nativas para bundles, agents, commands,
configs, references, scripts e assets, com conflito conservador e rollback.

**Acceptance criteria:**
- [ ] copy/link/merge-json/merge-markdown/stage só operam em paths do adapter
      revalidados antes da escrita.
- [ ] Conflito bloqueia; overwrite/merge cria backup; rename valida nome.
- [ ] Falha de escrita/persistência desfaz somente a operação parcial e
      preserva resultados dos itens concluídos.

**Verification:**
- [ ] `npx vitest run src/main/services/import-adapter.service.test.ts`
- [ ] Filesystem real cobre arquivo/diretório existente, config inválida,
      backup, rollback, destino compartilhado e escape.
- [ ] `npm run typecheck`

**Dependencies:** Tasks 6-8

**Files likely touched:**
- `src/main/services/import-adapter.service.ts`
- `src/main/services/import-adapter.service.test.ts`
- `src/main/services/import-plan.service.ts`
- `src/main/types/import.ts`

**Estimated scope:** Medium: 4 files

## Task 10: Proveniência e atualização

**Description:** Persistir registros e comparar revisão/arquivos em futuras
atualizações, sem sobrescrever alteração local silenciosamente.

**Acceptance criteria:**
- [ ] `imports.json` registra repo/ref/commit/tree, componente, arquivos,
      destino, método, ativação, backup e timestamps.
- [ ] Registro corrompido não quebra o app; serviço recupera ou começa vazio.
- [ ] Reanálise identifica revisão nova, arquivos alterados e divergência local;
      reaplicação exige seleção/confirm.

**Verification:**
- [ ] `npx vitest run src/main/services/import-provenance.service.test.ts`
- [ ] Testes cobrem criação, reload, corrupção, destinos múltiplos, revisão
      nova, divergência e desativação.
- [ ] `npm run typecheck`

**Dependencies:** Tasks 5 and 9

**Files likely touched:**
- `src/main/services/import-provenance.service.ts`
- `src/main/services/import-provenance.service.test.ts`
- `src/main/types/import.ts`

**Estimated scope:** Medium: 3 files

## Checkpoint: Backend instalável

- [ ] Seleção mista instala com adapters nativos e dependências compartilhadas.
- [ ] Conflitos, backup, rollback e falhas parciais são verificáveis.
- [ ] Proveniência explica origem, revisão, destino e método.
- [ ] Testes focados, typecheck e build passam antes do IPC.

## Phase 4: API e experiência do usuário

## Task 11: IPC, preload e contratos tipados

**Description:** Expor análise, plano, conflitos, instalação, ativação,
cancelamento e progresso por wrappers mínimos que revalidam no main.

**Acceptance criteria:**
- [ ] `window.api.githubImport` expõe somente métodos específicos e tipados.
- [ ] Handlers validam IDs, plano, resoluções e arrays; path/comando não é
      autorização independente.
- [ ] Cancelamento não deixa subprocesso/staging órfão; erros são por item e
      não vazam segredos.

**Verification:**
- [ ] `npx vitest run src/main/ipc/handlers.test.ts src/preload/index.test.ts`
- [ ] Testes verificam channels, validação, plano expirado, progresso e cleanup.
- [ ] `npm run typecheck`

**Dependencies:** Tasks 9-10

**Files likely touched:**
- `src/main/ipc/handlers.ts`
- `src/main/ipc/handlers.test.ts`
- `src/preload/index.ts`
- `src/preload/index.test.ts`
- `src/renderer/src/types/electron.d.ts`

**Estimated scope:** Medium: 5 files

## Task 12: Inventário e mapeamento de destinos

**Description:** Reestruturar o início do GitHubImportDialog para inventário
completo, dependências, capabilities e seleção de target/escopo/projeto.

**Acceptance criteria:**
- [ ] URL/análise mostra repo/ref/revisão, grupos, contagens, filtros e
      seleção pai/filho.
- [ ] Usuário escolhe destino por item ou herda seleção compatível; sem destino
      válido o item fica bloqueado.
- [ ] Dependências, arquivos, risco e método aparecem sem mutação.

**Verification:**
- [ ] `npx vitest run src/renderer/src/components/ui/GitHubImportDialog.test.tsx src/renderer/src/components/ui/GitHubImportInventory.test.tsx`
- [ ] Testing Library cobre loading, erro, vazio, filtro, cascata e destino
      incompatível.
- [ ] Verificar teclado, foco e 320px/768px/1024px/1440px.

**Dependencies:** Task 11

**Files likely touched:**
- `src/renderer/src/components/ui/GitHubImportDialog.tsx`
- `src/renderer/src/components/ui/GitHubImportInventory.tsx`
- `src/renderer/src/components/ui/GitHubImportInventory.test.tsx`
- `src/renderer/src/components/ui/GitHubImportDialog.test.tsx`

**Estimated scope:** Medium: 4 files

## Task 13: Revisão, confirmação, ativação e resultados

**Description:** Completar o wizard com preview/diff, conflitos, fallback,
segunda confirmação de hooks, progresso, cancelamento e resultados.

**Acceptance criteria:**
- [ ] Antes da instalação aparecem destino, arquivos, diff, dependências,
      riscos, backup e método; conflito exige resolução.
- [ ] Hook ativa só em ação separada; fallback mostra comando/cwd/risco/saída e
      confirmação de shell quando necessário.
- [ ] Resultados suportam sucesso parcial, cancelamento, retry por item e links
      para origem/destino/proveniência.

**Verification:**
- [ ] `npx vitest run src/renderer/src/components/ui/GitHubImportDialog.test.tsx src/renderer/src/components/ui/GitHubImportReview.test.tsx`
- [ ] Testes cobrem confirmação, hook disabled/active, fallback, progresso,
      cancelamento, erro, falha parcial e retry.
- [ ] Radix mantém Title/Description, foco, Escape e retorno ao acionador.

**Dependencies:** Tasks 7, 11 and 12

**Files likely touched:**
- `src/renderer/src/components/ui/GitHubImportDialog.tsx`
- `src/renderer/src/components/ui/GitHubImportReview.tsx`
- `src/renderer/src/components/ui/GitHubImportReview.test.tsx`
- `src/renderer/src/components/ui/GitHubImportDialog.test.tsx`

**Estimated scope:** Medium: 4 files

## Checkpoint: Fluxo completo

- [ ] Wizard usa análise, seleção, destino, revisão, instalação e resultado.
- [ ] Hooks, fallbacks, diffs, conflitos e erros são visíveis/acessíveis.
- [ ] Fluxos antigos de skill e ZIP permanecem operacionais.

## Phase 5: Integração e qualidade

## Task 14: Smoke test e regressão do ZIP

**Description:** Consolidar fixture pinada do pacote de referência, validar plano
completo e proteger importação ZIP/skill única/cancelamento.

**Acceptance criteria:**
- [ ] Fixture reproduz manifestos, 24 skills, agents, commands, hooks, scripts
      e references relevantes.
- [ ] Plano completo detecta dependências, instala itens nativos, mantém hooks
      desabilitados e registra proveniência.
- [ ] ZIP, skill única, conflitos e cancelamento continuam passando.

**Verification:**
- [ ] `npx vitest run src/main/services/github-import.service.advanced.test.ts src/main/services/zip-import.service.test.ts src/main/ipc/handlers.test.ts src/renderer/src/components/ui/GitHubImportDialog.test.tsx`
- [ ] Smoke manual em revisão fixa confirma inventário sem ativação automática.
- [ ] Nenhum teste depende de rede.

**Dependencies:** Tasks 1-13

**Files likely touched:**
- `src/main/services/github-import.service.advanced.test.ts`
- `src/main/services/zip-import.service.test.ts`
- `src/main/ipc/handlers.test.ts`
- `src/renderer/src/components/ui/GitHubImportDialog.test.tsx`

**Estimated scope:** Medium: 4 files

## Task 15: Gates finais, documentação e preparação

**Description:** Executar gates, registrar baseline/falhas legadas, atualizar a
spec se decisões mudarem e alinhar plano/todo antes da revisão final.

**Acceptance criteria:**
- [ ] Critérios da spec estão ligados a teste ou verificação manual.
- [ ] Erros novos de lint/typecheck/build não são aceitos; baseline legado é
      separado.
- [ ] Spec, plano e todo refletem decisões, riscos, comandos e estado real.

**Verification:**
- [ ] `npm test`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] Revisão manual de wizard, conflito, hook, fallback, rollback e a11y.

**Dependencies:** Task 14

**Files likely touched:**
- `docs/specs/github-repository-import.md` se decisões mudarem
- `tasks/plan.md`
- `tasks/todo.md`

**Estimated scope:** Small: 2-3 files

## Final checkpoint

- [ ] Cada task tem evidência real, não apenas intenção.
- [ ] Feature pronta para code review e teste manual do usuário.
- [ ] Nenhum commit ou fallback foi executado como parte do planejamento.

## Phase 6: Correção de skills provider-specific

### Task 16: Identidade lógica, variantes e seleção segura

**Description:** Agrupar cópias provider-specific da mesma skill, resolver a
variante adequada ao destino e tornar a origem auditável na UI sem apresentar
cada cópia como uma skill independente.

**Acceptance criteria:**
- [x] `pbakaus/impeccable` gera uma única componente `skill` lógica para as
      cópias `*/skills/impeccable`, com variantes preservadas.
- [x] O plano usa uma variante compatível com o target e não estagia as demais.
- [x] Skills distintas continuam separadas e o inventário informa as origens
      das variantes; bundle informativo não é selecionado automaticamente.

**Verification:**
- [x] `npx vitest run src/main/services/github-component-detector.service.test.ts src/main/services/import-plan.service.test.ts src/renderer/src/components/ui/GitHubImportInventory.test.tsx`
- [x] `npm run typecheck`
- [x] `npm run build`

**Dependencies:** Tasks 3, 4 and 12

**Files likely touched:**
- `src/main/types/github.ts`
- `src/main/types/import.ts`
- `src/main/services/github-component-detector.service.ts`
- `src/main/services/import-plan.service.ts`
- `src/renderer/src/components/ui/GitHubImportInventory.tsx`
- `src/renderer/src/components/ui/GitHubImportDialog.tsx`

## Phase 7: Inventário orientado a decisões

### Task 17: Agrupamento e seleção conservadora do inventário

**Description:** Simplificar a primeira tela da importação agrupando escolhas
de usuário e separando arquivos técnicos/rotas alternativas, sem reduzir o
inventário analisado pelo processo principal.

**Acceptance criteria:**
- [x] Skills, commands, agents e hooks aparecem como grupos de escolha; refs,
      scripts, configs e assets aparecem como suporte técnico recolhível.
- [x] Apenas skills são selecionadas por padrão; hooks ficam desmarcados e
      continuam exigindo ativação separada.
- [x] Select all/Clear all funcionam globalmente e por grupo sem selecionar
      automaticamente suporte ou bundle concorrente.
- [x] Variantes de uma skill continuam em uma única linha lógica, com origem e
      quantidade auditáveis.

**Verification:**
- [x] `npx vitest run src/renderer/src/components/ui/github-import-inventory.utils.test.ts src/renderer/src/components/ui/GitHubImportInventory.test.tsx src/renderer/src/components/ui/GitHubImportDialog.components.test.tsx`
- [x] `npm run typecheck`
- [x] `npm run build`

**Files likely touched:**
- `docs/specs/github-import-inventory-simplification.md`
- `src/renderer/src/components/ui/github-import-inventory.utils.ts`
- `src/renderer/src/components/ui/github-import-inventory.utils.test.ts`
- `src/renderer/src/components/ui/GitHubImportInventory.tsx`
- `src/renderer/src/components/ui/GitHubImportComponentFlow.tsx`
- `src/renderer/src/components/ui/GitHubImportDialog.tsx`
- corresponding UI tests
