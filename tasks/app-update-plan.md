# Implementation Plan: Atualização do app Windows sem reinstalação manual

## Overview

Migrar o fluxo de atualização do Skills Manager de “abrir a página da release”
para o `autoUpdater` nativo do Electron em instalações Squirrel.Windows. O
workflow continuará usando GitHub Releases, mas publicará o feed `RELEASES` e
os pacotes Squirrel necessários para que instalações existentes baixem e
apliquem a versão nova.

## Architecture Decisions

- Usar o `autoUpdater` nativo do Electron, sem adicionar `electron-updater` ou
  outro pacote. A instalação Squirrel já contém `Update.exe`, que é o caminho
  de compatibilidade para versões existentes.
- Usar a URL base da release versionada no GitHub como feed Squirrel. O serviço
  continua consultando a API `releases/latest`, mas forma o feed somente a
  partir de tags de versão validadas e do repositório constante.
- Publicar `Setup.exe`, `RELEASES` e os `*.nupkg` produzidos pelo MakerSquirrel.
  O `Setup.exe` continua necessário para instalações novas; atualizações
  subsequentes usam o feed/pacote.
- Manter o `UpdateService` como unidade de coordenação e injetar uma interface
  mínima de `autoUpdater`, permitindo testes determinísticos sem iniciar o
  Electron real.
- Manter a verificação automática existente, mas separar os estados
  `available`, `downloading`, `installing`, `error` e `upToDate` no renderer.
- Como o `autoUpdater` nativo do Electron 33 não expõe porcentagem de download
  no Windows, o feedback de download será indeterminado.
- Enviar somente estados pelo IPC. O renderer não conhece a URL de
  feed, executáveis, diretórios de instalação ou comandos do Windows.

## Dependency Graph

```text
MakerSquirrel
    │
    ├── RELEASES + *.nupkg publicados na GitHub Release
    │       │
    │       └── UpdateService + Electron autoUpdater
    │               │
    │               └── IPC update:start / update:status
    │                       │
    │                       └── preload + useUpdateChecker
    │                               │
    │                               └── UpdateDialog (confirmar, status, retry)
```

## Task List

### Phase 1: Feed e contrato do updater

- [x] Task 1: Publicar todos os artefatos Squirrel no GitHub Release.
- [x] Task 2: Implementar download/aplicação no `UpdateService` com fake
      testável do `autoUpdater`.

### Checkpoint: Backend de atualização

- [x] O workflow localiza `RELEASES` e pelo menos um `*.nupkg`.
- [x] Testes do serviço cobrem sucesso, estados, concorrência, erro e
      versões não suportadas.
- [x] Typecheck passa.

### Phase 2: Ponte e experiência de usuário

- [x] Task 3: Expor start/status/erro através de IPC e preload.
- [x] Task 4: Atualizar hook e diálogo para confirmação, status, retry e
      reinício automático.

### Checkpoint: Fluxo do usuário

- [x] O renderer não abre mais a página da release como ação principal.
- [x] Atualizar não inicia sem confirmação.
- [x] O erro mantém o app aberto e permite tentar novamente.
- [x] Controles seguem acessíveis por teclado e têm estados de carregamento
      claros.

### Phase 3: Verificação e documentação

- [x] Task 5: Rodar testes, typecheck, lint e build; revisar alterações e
      documentar o procedimento de release/primeira migração.

### Checkpoint: Complete

- [x] Suíte completa e build passam, considerando e registrando qualquer falha
      preexistente do repositório.
- [ ] Uma build Windows instalada a partir da release de transição confirma
      atualização via GitHub sem novo `Setup.exe` durante o fluxo normal.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Release sem `RELEASES` ou `.nupkg` | Alto | Fazer o workflow publicar o diretório completo e validar os artefatos antes do upload. |
| Tag/URL de release manipulada ou inválida | Alto | Aceitar apenas tags SemVer e formar a URL a partir do repositório constante. |
| Atualização concorrente | Médio | Guardar uma operação ativa no serviço e rejeitar nova tentativa até finalizar. |
| Erro durante download/aplicação | Alto | Não chamar `quitAndInstall()` no caminho de erro; manter a versão atual e expor retry. |
| Feed GitHub indisponível | Médio | Preservar cache da checagem, reportar erro amigável e não alterar a instalação. |
| UI sem feedback durante download | Médio | Encaminhar estados indeterminados por IPC e cobrir o fluxo com testes de componente. |
| Instalação antiga sem artefato full compatível | Alto | Incluir pacote full na primeira release do novo fluxo e validar em build instalada. |

## Files Likely Touched

- `docs/specs/in-app-updates.md`
- `tasks/app-update-plan.md`
- `tasks/app-update-todo.md`
- `.github/workflows/release.yml`
- `src/main/services/update.service.ts`
- `src/main/services/update.service.test.ts`
- `src/main/ipc/handlers.ts`
- `src/main/ipc/handlers.test.ts`
- `src/preload/index.ts`
- `src/preload/index.test.ts`
- `src/renderer/src/types/electron.d.ts`
- `src/renderer/src/hooks/useUpdateChecker.ts`
- `src/renderer/src/components/ui/UpdateDialog.tsx`
- `src/renderer/src/components/ui/UpdateDialog.test.tsx`
- `src/renderer/src/App.tsx`

## Verification Commands

- `npx vitest run src/main/services/update.service.test.ts`
- `npx vitest run src/main/ipc/handlers.test.ts src/preload/index.test.ts`
- `npx vitest run src/renderer/src/components/ui/UpdateDialog.test.tsx`
- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run make`
