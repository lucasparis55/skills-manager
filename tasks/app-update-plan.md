# Implementation Plan: Atualização do app Windows sem reinstalação manual

## Overview

Migrar o fluxo de atualização do Skills Manager de “abrir a página da release”
para a execução controlada do `Update.exe` Squirrel em instalações Windows. O
workflow continuará usando GitHub Releases, mas publicará o feed `RELEASES` e
os pacotes Squirrel necessários para que instalações existentes baixem e
apliquem a versão nova.

## Architecture Decisions

- Usar o `Update.exe` Squirrel já instalado, sem adicionar `electron-updater` ou
  outro pacote. O executável é resolvido a partir da instalação atual e
  executado sem shell.
- Usar a URL base da release versionada no GitHub como feed Squirrel. O serviço
  continua consultando a API `releases/latest`, mas forma o feed somente a
  partir de tags de versão validadas e do repositório constante.
- Publicar `Setup.exe`, `RELEASES` e os `*.nupkg` produzidos pelo MakerSquirrel.
  O `Setup.exe` continua necessário para instalações novas; atualizações
  subsequentes usam o feed/pacote.
- Manter o `UpdateService` como unidade de coordenação e injetar uma interface
  mínima do processo Squirrel, permitindo testes determinísticos sem iniciar o
  `Update.exe` real.
- Manter a verificação automática existente, mas separar os estados
  `available`, `downloading`, `installing`, `error` e `upToDate` no renderer.
- Como o `autoUpdater` nativo do Electron 33 não expõe evento de progresso no
  Windows, o `UpdateService` executará o `Update.exe` Squirrel já instalado
  com `--update` e lerá seu stdout. O Squirrel escreve o progresso agregado de
  check/download/aplicação como percentuais de 0 a 100.
- O serviço resolve `Update.exe` e o launcher a partir de `process.execPath`,
  executa sem shell e relança o launcher Squirrel somente após exit code zero.
- Enviar somente o contrato `{ stage, percent }` pelo IPC. O renderer não
  conhece a URL de feed, executáveis, diretórios de instalação ou comandos do
  Windows.

## Dependency Graph

```text
MakerSquirrel
    │
    ├── RELEASES + *.nupkg publicados na GitHub Release
    │       │
    │       └── UpdateService + Update.exe Squirrel
    │               │ stdout 0–100
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
      testável do processo Squirrel.

### Checkpoint: Backend de atualização

- [x] O workflow localiza `RELEASES` e pelo menos um `*.nupkg`.
- [x] Testes do serviço cobrem sucesso, progresso, concorrência, erro e
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

### Phase 4: Progresso real do update

- [x] Task 6: Executar `Update.exe` com parsing de progresso e relaunch seguro.
- [x] Task 7: Propagar o contrato `{ stage, percent }` por IPC, preload e hook.
- [x] Task 8: Exibir progressbar acessível e percentual no diálogo de update.
- [x] Task 9: Rodar gates finais e atualizar a documentação do fluxo.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Release sem `RELEASES` ou `.nupkg` | Alto | Fazer o workflow publicar o diretório completo e validar os artefatos antes do upload. |
| Tag/URL de release manipulada ou inválida | Alto | Aceitar apenas tags SemVer e formar a URL a partir do repositório constante. |
| Atualização concorrente | Médio | Guardar uma operação ativa no serviço e rejeitar nova tentativa até finalizar. |
| Erro durante download/aplicação | Alto | Não relançar o launcher no caminho de erro; manter a versão atual e expor retry. |
| Feed GitHub indisponível | Médio | Preservar cache da checagem, reportar erro amigável e não alterar a instalação. |
| Progresso não chega ao renderer | Médio | Ler stdout do `Update.exe`, validar linhas estritamente e cobrir processo/IPC/UI com testes. |
| Launcher errado após aplicar update | Alto | Derivar o launcher do mesmo `process.execPath`, relançar somente após exit code zero e testar o caminho. |
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
