# Tasks: Saúde e Reparo da Distribuição de Skills

## Task 1: Contratos e diagnóstico por skill

**Description:** Criar os tipos de relatório/resultado e um `SkillHealthService` que examine apenas os links persistidos de uma skill, valide a fonte e o destino e classifique o estado de cada distribuição.

**Acceptance criteria:**

- [x] Uma skill pode retornar resumo e destinos individuais com IDE, escopo, projeto, caminho, estado, motivo e indicação de reparabilidade.
- [x] Os estados `healthy`, `broken`, `conflict`, `legacy` e `unavailable` são determinados a partir do filesystem e do inventário atual, sem assumir destinos não registrados.
- [x] A operação não altera o filesystem e não aceita caminhos enviados pelo renderer.

**Verification:**

- [x] Testes com diretórios temporários reais cobrem link válido, destino ausente, conflito, fonte ausente, raiz indisponível e caminho legado.
- [x] `npx vitest run src/main/services/skill-health.service.test.ts`
- [x] `npm run typecheck`

**Dependencies:** None

**Files likely touched:**

- `src/main/types/domain.ts`
- `src/main/services/skill-health.service.ts`
- `src/main/services/skill-health.service.test.ts`

**Estimated scope:** Medium: 3 files

## Task 2: IPC e preload do diagnóstico

**Description:** Expor o diagnóstico por uma API mínima e tipada, mantendo a fronteira Electron entre processo principal, preload e renderer.

**Acceptance criteria:**

- [x] `window.api.skills.checkDistribution(skillId)` usa `ipcRenderer.invoke`/`ipcMain.handle` e retorna o contrato da Task 1.
- [x] O handler valida `skillId`, resolve a skill no processo principal e não recebe nem opera sobre caminhos arbitrários.
- [x] O preload expõe somente o método necessário e os tipos do renderer permanecem sincronizados.

**Verification:**

- [x] `npx vitest run src/main/ipc/handlers.test.ts src/preload/index.test.ts`
- [x] Teste verifica que IDs inválidos são rejeitados e que o contrato de retorno é preservado.
- [x] `npm run typecheck`

**Dependencies:** Task 1

**Files likely touched:**

- `src/main/ipc/handlers.ts`
- `src/main/ipc/handlers.test.ts`
- `src/preload/index.ts`
- `src/preload/index.test.ts`
- `src/renderer/src/types/electron.d.ts`

**Estimated scope:** Medium: 5 files

## Task 3: Relatório visual de saúde

**Description:** Adicionar à lista de skills uma ação contextual e um modal somente leitura que apresente o diagnóstico agrupado por IDE e projeto/escopo.

**Acceptance criteria:**

- [x] Cada skill gerenciada possui uma ação acessível `Check distribution` que abre o relatório da skill correta.
- [x] O modal mostra resumo, estados textuais, caminho, IDE, projeto/escopo, motivo e estados de carregamento, erro e nenhum problema.
- [x] O modal controlado preserva foco, Escape, título/descrição acessíveis e é utilizável em 320px, 768px, 1024px e 1440px por meio do Dialog controlado e layout responsivo.

**Verification:**

- [x] `npx vitest run src/renderer/src/components/ui/SkillHealthDialog.test.tsx src/renderer/src/pages/SkillsPage.test.tsx`
- [x] O diálogo usa os contratos controlados do Radix para navegação por teclado, foco preso e fechamento.
- [x] O diagnóstico é somente leitura; os fixtures reais verificam que alterações de filesystem só ocorrem no fluxo explícito de reparo.

**Dependencies:** Task 2

**Files likely touched:**

- `src/renderer/src/components/ui/SkillHealthDialog.tsx`
- `src/renderer/src/components/ui/SkillHealthDialog.test.tsx`
- `src/renderer/src/pages/SkillsPage.tsx`
- `src/renderer/src/pages/SkillsPage.test.tsx`

**Estimated scope:** Medium: 4 files

## Task 4: Reparo seguro no processo principal

**Description:** Implementar o reparo por IDs selecionados, com nova validação imediatamente antes da alteração e reutilização das regras de link e migração existentes.

**Acceptance criteria:**

- [x] `repairDistribution(skillId, linkIds)` só repara links gerenciados da skill e nunca recebe caminhos físicos do renderer.
- [x] Links quebrados com destino livre podem ser recriados; conflitos, links externos e destinos indisponíveis são bloqueados com motivo claro.
- [x] Links globais legados usam a regra de migração existente; resultados retornam sucesso, bloqueio ou falha por item e preservam o estado anterior quando o rollback for necessário.

**Verification:**

- [x] Testes com filesystem real cobrem reparo válido, conflito, destino legado, destino externo, colisão persistida, projeto ausente, falha de persistência e rollback.
- [x] `npx vitest run src/main/services/skill-health.service.test.ts src/main/ipc/handlers.test.ts`
- [x] `npm run typecheck`

**Dependencies:** Tasks 1-2

**Files likely touched:**

- `src/main/services/skill-health.service.ts`
- `src/main/services/skill-health.service.test.ts`
- `src/main/ipc/handlers.ts`
- `src/main/ipc/handlers.test.ts`

**Estimated scope:** Medium: 4 files

## Task 5: Prévia, confirmação e resultados

**Description:** Integrar a ação de reparo ao modal, mostrando exatamente os itens selecionados antes da alteração e o resultado detalhado depois dela.

**Acceptance criteria:**

- [x] O usuário seleciona somente itens reparáveis e vê uma confirmação com IDE, projeto/escopo e destino antes de aplicar.
- [x] O modal impede reparo para conflitos/externos, mostra estado ocupado e não permite submissões concorrentes.
- [x] Após o reparo, a UI exibe resultado por item, falha parcial, opção de verificar novamente e atualiza o status da skill.

**Verification:**

- [x] `npx vitest run src/renderer/src/components/ui/SkillHealthDialog.test.tsx src/renderer/src/pages/SkillsPage.test.tsx`
- [x] Testes cobrem confirmação, sucesso, falha parcial, erro e retry; conflitos ficam sem checkbox de reparo.
- [x] O reparo usa `createExclusive` e os fixtures confirmam que destinos conflitantes permanecem intactos.

**Dependencies:** Tasks 3-4

**Files likely touched:**

- `src/renderer/src/components/ui/SkillHealthDialog.tsx`
- `src/renderer/src/components/ui/SkillHealthDialog.test.tsx`
- `src/renderer/src/pages/SkillsPage.tsx`
- `src/renderer/src/pages/SkillsPage.test.tsx`

**Estimated scope:** Medium: 4 files

## Task 6: Verificação pós-edição

**Description:** Depois de salvar uma skill, disparar a verificação sem bloquear o salvamento e oferecer um retorno contextual para abrir o relatório quando houver atenção necessária.

**Acceptance criteria:**

- [x] O salvamento da skill continua concluindo mesmo se a verificação posterior falhar.
- [x] Quando houver destinos que exigem atenção, o usuário recebe um feedback com contagem e ação `View report`.
- [x] Nenhum reparo é iniciado automaticamente; o usuário precisa abrir o relatório e confirmar a ação.

**Verification:**

- [x] `npx vitest run src/renderer/src/components/ui/SkillEditDialog.test.tsx src/renderer/src/pages/SkillsPage.test.tsx`
- [x] Teste cobre sucesso do save com diagnóstico posterior e a ação contextual para abrir o relatório; o diálogo cobre erro/retry.
- [x] `npm run typecheck`

**Dependencies:** Tasks 3-5

**Files likely touched:**

- `src/renderer/src/components/ui/SkillEditDialog.tsx`
- `src/renderer/src/components/ui/SkillEditDialog.test.tsx`
- `src/renderer/src/pages/SkillsPage.tsx`
- `src/renderer/src/pages/SkillsPage.test.tsx`

**Estimated scope:** Medium: 4 files

## Task 7: Verificação final e regressão

**Description:** Validar a feature inteira e garantir que os fluxos atuais de Skills, Links, Projects, Global Skills, duplicatas e Settings não regrediram.

**Acceptance criteria:**

- [x] Diagnóstico e reparo por skill funcionam ponta a ponta com fixtures reais e links globais/projeto.
- [x] Nenhum caminho externo, conflito ou conteúdo central é alterado indevidamente.
- [x] Acessibilidade, responsividade, estados de erro e falhas parciais estão cobertos pelo contrato Radix, layout responsivo e testes de estado.

**Verification:**

- [x] `npm test -- --run` — 42 arquivos, 296 testes aprovados na regressão completa.
- [x] `npm run typecheck`
- [x] Lint dos arquivos alterados sem erros usando `ESLINT_USE_FLAT_CONFIG=false`; `npm run lint` permanece bloqueado pelo baseline do ESLint 9 sem `eslint.config.*`.
- [x] `npm run build`
- [x] Verificação manual em 320px, 768px, 1024px e 1440px — relatório, estados mistos, confirmação, overflow, foco e Escape verificados; a confirmação recebeu correção de camada e acessibilidade.

**Dependencies:** Tasks 1-6

**Files likely touched:**

- Arquivos alterados pelas Tasks 1-6
- `src/renderer/src/pages/LinksPage.test.tsx` se uma regressão exigir cobertura adicional

**Estimated scope:** Large: 5+ files, somente verificação e ajustes pontuais

## Parallelization notes

- Tasks 1 e 2 são sequenciais porque o contrato do serviço define o IPC.
- Task 3 pode começar assim que o contrato da Task 2 estiver estável.
- Tasks 4 e 5 devem permanecer coordenadas: o contrato de resultado do reparo é compartilhado entre backend e modal.
- Task 7 é exclusivamente final e não deve ser antecipada como substituta dos checkpoints.
