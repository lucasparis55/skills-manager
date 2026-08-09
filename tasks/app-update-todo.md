# Tasks: Atualização do app Windows sem reinstalação manual

## Task 1: Publicar artefatos Squirrel no GitHub

**Description:** Ajustar o workflow de release para manter o `Setup.exe` para
instalações novas e enviar também `RELEASES` e todos os pacotes `*.nupkg` que o
MakerSquirrel gerar.

**Acceptance criteria:**

- [x] O workflow falha se `RELEASES` ou um pacote `*.nupkg` não for encontrado.
- [x] A criação/atualização da release envia o conjunto completo de artefatos
      Squirrel, sem remover o `Setup.exe`.
- [x] A release usa a mesma tag versionada que o app consulta.

**Verification:**

- [x] Revisar o YAML e executar `npm run make` em Windows.
- [x] Conferir no diretório `out/make/squirrel.windows/x64` a presença de
      `RELEASES`, `*.nupkg` e `*Setup.exe`.

**Dependencies:** None

**Files likely touched:**

- `.github/workflows/release.yml`

**Estimated scope:** Small

## Task 2: Implementar o updater nativo no processo principal

**Description:** Estender `UpdateService` para construir o feed GitHub de uma
release validada, iniciar o `Update.exe` Squirrel instalado, encaminhar
progresso e relançar o launcher somente após saída bem-sucedida.

**Acceptance criteria:**

- [x] Em Windows empacotado, uma checagem com release maior prepara o feed da
      tag e permite iniciar uma única operação de download.
- [x] O progresso de download/aplicação é repassado ao callback e o launcher
      acontece uma vez após a saída bem-sucedida do `Update.exe`.
- [x] Erros, ausência de update, modo desenvolvimento e plataforma não Windows
      não encerram o app nem relançam o launcher.

**Verification:**

- [x] Escrever primeiro testes que falham para feed, estados, sucesso, erro
      e concorrência.
- [x] Executar `npx vitest run src/main/services/update.service.test.ts`.
- [x] Executar `npm run typecheck`.

**Dependencies:** Task 1

**Files likely touched:**

- `src/main/services/update.service.ts`
- `src/main/services/update.service.test.ts`

**Estimated scope:** Medium

## Task 3: Expor início e status por IPC/preload

**Description:** Substituir o handler que abria a release por uma operação de
início de atualização, encaminhando estados apenas para o
renderer que iniciou a operação e mantendo o contrato tipado.

**Acceptance criteria:**

- [x] O preload expõe `update.start()` e `update.onStatus()` com unsubscribe.
- [x] O handler não recebe caminhos, executáveis ou URLs de feed do renderer.
- [x] Os estados e erros retornam contratos estáveis e não deixam listeners
      pendurados.

**Verification:**

- [x] Testar handlers, chamadas IPC do preload e remoção de listeners.
- [x] Executar `npx vitest run src/main/ipc/handlers.test.ts src/preload/index.test.ts`.
- [x] Executar `npm run typecheck`.

**Dependencies:** Task 2

**Files likely touched:**

- `src/main/ipc/handlers.ts`
- `src/main/ipc/handlers.test.ts`
- `src/preload/index.ts`
- `src/preload/index.test.ts`
- `src/renderer/src/types/electron.d.ts`

**Estimated scope:** Medium

## Task 4: Atualizar confirmação, status e retry na UI

**Description:** Transformar o diálogo atual em uma confirmação de instalação,
com barra de download/aplicação, erro/retry e feedback acessível, mantendo a
opção de verificação automática existente.

**Acceptance criteria:**

- [x] O download só começa após o botão de confirmação.
- [x] O diálogo mostra o percentual real, desabilita ações conflitantes e
      informa que o app será reiniciado após a conclusão.
- [x] Erro mantém o app aberto e oferece retry; o estado de update disponível
      continua visível.

**Verification:**

- [x] Testar o diálogo e o hook com React Testing Library.
- [x] Executar `npx vitest run src/renderer/src/components/ui/UpdateDialog.test.tsx`.
- [x] Executar `npm run typecheck`.
- [ ] Verificar teclado, foco, contraste e estados em 320/768/1024/1440 px em
      uma build visual instalada.

**Dependencies:** Task 3

**Files likely touched:**

- `src/renderer/src/hooks/useUpdateChecker.ts`
- `src/renderer/src/components/ui/UpdateDialog.tsx`
- `src/renderer/src/components/ui/UpdateDialog.test.tsx`
- `src/renderer/src/App.tsx`

**Estimated scope:** Medium

## Task 5: Verificação final e documentação operacional

**Description:** Validar o fluxo completo, revisar segurança/simplicidade e
registrar como a primeira release com o novo updater deve ser publicada e
testada.

**Acceptance criteria:**

- [x] Testes, typecheck e build passam; falhas preexistentes ficam registradas.
- [x] O workflow e o código não executam o `Setup.exe` como parte da atualização
      normal.
- [x] A documentação explica a necessidade de `RELEASES`/`*.nupkg` e o teste
      em instalação existente.

**Verification:**

- [x] Executar `npm test`, `npm run typecheck`, `npm run build` e `npm run make`.
      `npm run lint` permanece bloqueado pela configuração ESLint 9 existente;
      o lint legado focado passou sem erros.
- [x] Fazer revisão de segurança do download/feed e revisão de acessibilidade
      da UI.
- [ ] Realizar teste manual em Windows instalado a partir da release de
      transição; a primeira migração ainda exige o `Setup.exe` por limitação do
      executável antigo, e as seguintes devem usar somente o fluxo interno.

**Dependencies:** Task 4

**Files likely touched:**

- `docs/specs/in-app-updates.md`
- `tasks/app-update-plan.md`
- `tasks/app-update-todo.md`

**Estimated scope:** Small

## Task 6: Executar o Update.exe com progresso real

**Description:** Substituir a chamada de download indeterminada pela execução
controlada do `Update.exe` Squirrel instalado,
encaminhando os percentuais emitidos no stdout e relançando o launcher somente
após conclusão bem-sucedida.

**Acceptance criteria:**

- [x] O serviço executa somente o `Update.exe` derivado de `process.execPath`,
      sem shell, com a URL de feed formada internamente.
- [x] Linhas inteiras de 0 a 100 geram progresso monotônico; 0–29 é download e
      30–100 é aplicação.
- [x] Exit code diferente de zero mantém o app aberto; exit code zero relança
      o launcher uma única vez e encerra o processo atual.

**Verification:**

- [x] Escrever primeiro testes para parsing, progresso, erro e relaunch.
- [x] `npx vitest run src/main/services/update.service.test.ts`
- [x] `npm run typecheck`

**Dependencies:** Task 5

**Files likely touched:**

- `src/main/services/update.service.ts`
- `src/main/services/update.service.test.ts`

**Estimated scope:** Medium: 2 files

## Task 7: Propagar o contrato de progresso

**Description:** Alterar IPC, preload e hook para transportar `{ stage, percent }`
com unsubscribe e preservar retry/concorrência.

**Acceptance criteria:**

- [x] O handler envia cada progresso ao renderer que iniciou a operação.
- [x] O preload e `electron.d.ts` expõem o contrato sem caminhos ou comandos.
- [x] O hook mantém percentual, etapa e erro de retry corretamente.

**Verification:**

- [x] `npx vitest run src/main/ipc/handlers.test.ts src/preload/index.test.ts src/renderer/src/hooks/useUpdateChecker.test.ts`
- [x] `npm run typecheck`

**Dependencies:** Task 6

**Files likely touched:**

- `src/main/ipc/handlers.ts`
- `src/main/ipc/handlers.test.ts`
- `src/preload/index.ts`
- `src/preload/index.test.ts`
- `src/renderer/src/hooks/useUpdateChecker.ts`

**Estimated scope:** Medium: 5 files

## Task 8: Exibir a progressbar acessível

**Description:** Mostrar barra determinada, percentual e etapa no
`UpdateDialog`, mantendo confirmação, bloqueio durante o update e retry.

**Acceptance criteria:**

- [x] O diálogo expõe `role="progressbar"`, `aria-valuenow`, min/max e texto
      com percentual atual.
- [x] A largura visual corresponde ao percentual recebido, sem animação que
      invente progresso.
- [x] O estado de erro continua fechável e permite tentar novamente.

**Verification:**

- [x] `npx vitest run src/renderer/src/components/ui/UpdateDialog.test.tsx src/renderer/src/App.test.tsx`
- [ ] Verificar teclado, foco, contraste e 320/768/1024/1440 px.

**Dependencies:** Task 7

**Files likely touched:**

- `src/renderer/src/components/ui/UpdateDialog.tsx`
- `src/renderer/src/components/ui/UpdateDialog.test.tsx`
- `src/renderer/src/App.tsx`

**Estimated scope:** Medium: 3 files

## Task 9: Gates finais do progresso real

**Description:** Executar a suíte, typecheck, lint e build; revisar a mudança
contra a especificação e registrar a limitação do teste manual instalado.

**Acceptance criteria:**

- [x] Nenhuma regressão nos fluxos de update, retry ou configuração automática.
- [x] A documentação não promete progresso indeterminado nem chama
      `quitAndInstall()` após o caminho manual.
- [ ] A verificação manual em uma instalação Windows fica explicitamente
      registrada como pendente ou aprovada.

**Verification:**

- [x] `npm test`
- [x] `npm run typecheck`
- [ ] `npm run lint` — bloqueado pela configuração legada: ESLint 9 exige
      `eslint.config.*`, que não existe neste repositório.
- [x] `npm run build`
- [x] Revisão de segurança, simplicidade e acessibilidade.

**Dependencies:** Tasks 6-8

**Files likely touched:**

- `docs/specs/in-app-updates.md`
- `tasks/app-update-plan.md`
- `tasks/app-update-todo.md`

**Estimated scope:** Small: 3 files
