# Tasks: Gestão de skills globais por ferramenta

## Task 1: Contratos e inventário global seguro

- [x] Acceptance: O serviço lista cada ferramenta do catálogo atual, marca
      diretórios detectados/não detectados, descobre skills válidas e deduplica
      raízes compartilhadas.
- [x] Acceptance: Itens gerenciados, externos, quebrados e protegidos são
      classificados de forma determinística; raiz central e raízes de projeto
      nunca entram como alvo removível.
- [x] Verify: `npx vitest run src/main/services/global-skill.service.test.ts` e
      `npm run typecheck`.
- [ ] Files: `src/main/types/domain.ts`,
      `src/main/services/global-skill.service.ts`,
      `src/main/services/global-skill.service.test.ts`.

## Task 2: Contrato IPC e operações de filesystem

- [x] Acceptance: `globalSkills.scan`, `globalSkills.preview`,
      `globalSkills.remove` e `globalSkills.undo` estão disponíveis no preload e nos tipos do
      renderer.
- [x] Acceptance: preview/remove/undo revalidam o ID/token no processo principal, leem
      somente `SKILL.md` limitado e retornam resultado por item sem expor
      detalhes internos desnecessários.
- [x] Verify: testes focados de IPC e `npm run typecheck`.
- [ ] Files: `src/main/ipc/handlers.ts`, `src/main/ipc/handlers.test.ts`,
      `src/preload/index.ts`, `src/renderer/src/types/electron.d.ts`.

## Task 3: Visão global e estados de inventário

- [x] Acceptance: `GlobalSkillsView` exibe resumo, busca/filtro, ferramentas
      detectadas e não detectadas, caminhos, contagens e estados vazio/erro/
      carregamento.
- [x] Acceptance: cards/linhas identificam Gerenciada, Externa, Quebrada e
      Compartilhada com texto e controles acessíveis.
- [ ] Verify: `npx vitest run src/renderer/src/components/ui/GlobalSkillsView.test.tsx`
      e `npm run lint` (o lint global está bloqueado pela configuração legada
      `.eslintrc.js` incompatível com ESLint 9; os arquivos da feature foram
      verificados sem erros).
- [ ] Files: `src/renderer/src/components/ui/GlobalSkillsView.tsx`,
      `src/renderer/src/components/ui/GlobalSkillsView.test.tsx`.

## Task 4: Abas, prévia e remoção guiada

- [x] Acceptance: Skills navega entre Gerenciadas, Global por ferramenta e
      Projeto sem alterar os fluxos existentes.
- [x] Acceptance: prévia somente leitura, seleção entre ferramentas,
      confirmação agrupada por caminho/ferramenta, exclusão individual/lote,
      falha parcial e feedback de desfazer/Lixeira funcionam.
- [ ] Verify: testes de `SkillsPage` e `GlobalSkillsView`, `npm run lint` e
      `npm run build` (testes/build passam; lint global permanece bloqueado pela
      configuração legada).
- [ ] Files: `src/renderer/src/pages/SkillsPage.tsx`,
      `src/renderer/src/pages/SkillsPage.test.tsx`,
      `src/renderer/src/components/ui/GlobalSkillsView.tsx`,
      `src/renderer/src/components/ui/GlobalSkillsView.test.tsx`.

## Task 5: Revisão e verificação final

- [x] Acceptance: revisão de correção, simplicidade, arquitetura, segurança,
      performance e acessibilidade sem problemas críticos ou obrigatórios.
- [ ] Verify: `npm test`, `npm run lint`, `npm run typecheck` e `npm run build`.
      Suíte, typecheck e build passam; o lint global permanece bloqueado pela
      incompatibilidade da configuração legada com ESLint 9 e por erros
      preexistentes fora desta feature. O lint focado nos arquivos alterados
      passa sem erros (somente warnings preexistentes).
- [ ] Files: arquivos alterados nas tarefas anteriores.
