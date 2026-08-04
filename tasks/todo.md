# Tasks: Links globais sem projeto

- [x] Task 1: Adicionar testes de regressão para formulário, IPC e persistência.
  - Acceptance: Os testes expressam que `Global` não exige projeto e que `Project` exige.
  - Verify: `npx vitest run src/renderer/src/components/ui/CreateLinkDialog.test.tsx src/main/ipc/handlers.test.ts src/main/services/link.service.test.ts` falha pela ausência do comportamento.
  - Files: `src/renderer/src/components/ui/CreateLinkDialog.test.tsx`, `src/main/ipc/handlers.test.ts`, `src/main/services/link.service.test.ts`

- [x] Task 2: Aceitar projeto opcional apenas em links globais.
  - Acceptance: Criação global sem projeto usa a raiz global, persiste `null` e mantém IDs antigos; criação de projeto sem projeto é rejeitada.
  - Verify: Testes focados e `npm run typecheck`.
  - Files: `src/main/types/domain.ts`, `src/renderer/src/types/electron.d.ts`, `src/main/services/link.service.ts`, `src/main/ipc/handlers.ts`

- [x] Task 3: Ajustar o diálogo e a listagem.
  - Acceptance: O seletor de projeto não é obrigatório/visível em `Global`; o fluxo `Project` permanece obrigatório; links sem projeto aparecem como `Global`.
  - Verify: Testes de componente, lint e build.
  - Files: `src/renderer/src/components/ui/CreateLinkDialog.tsx`, `src/renderer/src/pages/LinksPage.tsx`

- [x] Task 4: Verificação final e revisão.
  - Acceptance: Não há regressões nem problemas críticos de correção, simplicidade, arquitetura, segurança ou performance.
  - Verify: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
  - Files: arquivos alterados nas tarefas anteriores
