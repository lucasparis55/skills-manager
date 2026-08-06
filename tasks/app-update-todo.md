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
release validada, iniciar o `autoUpdater`, encaminhar estados e chamar
`quitAndInstall()` somente após `update-downloaded`.

**Acceptance criteria:**

- [x] Em Windows empacotado, uma checagem com release maior prepara o feed da
      tag e permite iniciar uma única operação de download.
- [x] Os estados de download/aplicação são repassados ao callback e
      `quitAndInstall()` acontece uma vez após `update-downloaded`.
- [x] Erros, ausência de update, modo desenvolvimento e plataforma não Windows
      não encerram o app nem chamam `quitAndInstall()`.

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
com estados de download/erro/retry e feedback acessível, mantendo a opção de
verificação automática existente.

**Acceptance criteria:**

- [x] O download só começa após o botão de confirmação.
- [x] O diálogo mostra estado indeterminado de download, desabilita ações conflitantes e informa que o
      app será reiniciado após a conclusão.
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
