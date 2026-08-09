# Spec: Atualização do aplicativo Windows via GitHub

## Objetivo

Substituir o fluxo atual, que apenas abre a página da release e exige um novo
`Setup.exe`, por uma atualização iniciada dentro do Skills Manager. A
instalação Squirrel existente deve consultar a release do GitHub, baixar os
artefatos de atualização, aplicar a nova versão e reiniciar o aplicativo.

O usuário sempre confirma antes do download. Se o download ou a aplicação
falhar, a versão atual continua sendo usada e a interface oferece uma nova
tentativa.

## Fluxo funcional

1. O app mantém a verificação automática já configurada em Settings.
2. Quando uma release mais nova é encontrada, o app mostra o diálogo de
   atualização existente com versão, data e notas da release.
3. O usuário escolhe atualizar explicitamente.
4. O processo principal configura o feed Squirrel da release versionada no
   GitHub e inicia o `Update.exe` instalado com `--update`.
5. A interface mostra uma barra com o percentual real emitido pelo Squirrel e
   impede uma segunda atualização concorrente.
6. O processo principal encaminha as linhas de progresso do Squirrel (0–100%)
   para o renderer. A faixa de 0–29% representa consulta/download e 30–100%
   representa aplicação.
7. Ao concluir o processo com sucesso, o app informa 100%, agenda o launcher
   Squirrel da instalação para relançar a versão nova e encerra o processo
   atual.
8. Em erro, o app não relança o launcher, mantém a versão atual e mostra
   uma ação de retry.

Instalações existentes geradas pelo MakerSquirrel são compatíveis com o fluxo
depois que recebem a release de transição que contém este código. Essa release
de transição ainda precisa ser instalada uma vez com `Setup.exe`, porque o
executável antigo não possui código para iniciar o `Update.exe`. A partir dela,
cada release deve publicar o `RELEASES` e pelo menos um pacote Squirrel full
(`*.nupkg`), além do `Setup.exe` usado por instalações novas.

## Tech stack

- Electron `33.4.11` resolvido no `package-lock.json`.
- Electron Forge `7.11.1` e `@electron-forge/maker-squirrel` `7.11.1`.
- TypeScript, React, Vite e Vitest já usados no repositório.
- `child_process.spawn` do Node.js para executar o `Update.exe` instalado sem
  shell e ler seu stdout de progresso.
- GitHub Releases publicados pelo workflow existente em
  `.github/workflows/release.yml`.

## Commands

- Teste focado: `npx vitest run src/main/services/update.service.test.ts`
- Testes completos: `npm test`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Build: `npm run build`
- Empacotamento Windows: `npm run make`

## Project Structure

- `src/main/services/update.service.ts` — consulta GitHub, executa o
  `Update.exe` e coordena o relaunch.
- `src/main/ipc/handlers.ts` — expõe check, início da atualização e status.
- `src/preload/index.ts` — ponte segura para o renderer.
- `src/renderer/src/hooks/useUpdateChecker.ts` — estado do fluxo de atualização.
- `src/renderer/src/components/ui/UpdateDialog.tsx` — confirmação, status e
  retry.
- `src/renderer/src/types/electron.d.ts` — contrato tipado da ponte.
- `.github/workflows/release.yml` — publica todos os artefatos Squirrel no
  GitHub Release.

## Code Style

Manter serviços pequenos e injetáveis para testes, sem adicionar uma
dependência de updater. O serviço deve receber uma abstração mínima do
processo Squirrel e tratar seu progresso como estado observável:

```ts
const update = await updateService.checkForUpdates();

if (update.hasUpdate) {
  await updateService.downloadAndInstall((progress) => {
    sendProgress(progress);
  });
}
```

O renderer não recebe caminhos locais nem executa comandos. A decisão sobre o
feed, a validação da release, a resolução do `Update.exe` a partir de
`process.execPath` e a chamada ao Electron ficam no processo principal. O
serviço aceita somente percentuais inteiros entre 0 e 100 emitidos pelo
processo filho.

## Testing Strategy

- Testar a comparação de versões e a construção do feed com testes unitários.
- Usar um fake pequeno do processo Squirrel para verificar parsing de stdout,
  progresso, sucesso, erro, concorrência e relaunch único.
- Testar os handlers IPC e a limpeza dos listeners do preload.
- Testar o diálogo e o hook com React Testing Library, incluindo confirmação,
  percentual, transição de etapas, retry e estados de erro.
- Rodar a suíte completa, typecheck, lint e build antes da entrega.
- Fazer uma verificação manual em uma build Windows instalada: detectar a
  release, confirmar, acompanhar o download e validar o reinício na versão
  nova.

## Boundaries

- **Sempre fazer:** manter GitHub como origem, usar somente o Squirrel já
  presente nas instalações, não iniciar download sem confirmação, manter a
  versão atual em caso de falha, validar entradas de release antes de formar
  URLs e iniciar somente o `Update.exe` resolvido da instalação atual.
- **Perguntar antes:** trocar o formato de empacotamento, adicionar outro
  provedor de atualização, alterar o escopo para macOS/Linux ou adicionar
  assinatura/certificação de código fora do pipeline atual.
- **Nunca fazer:** executar um `.exe` baixado diretamente pelo renderer,
  sobrescrever a instalação enquanto o processo principal ainda está rodando,
  expor tokens/caminhos internos no IPC ou remover os artefatos necessários
  para instalações novas.

## Rollout operacional

1. Publicar a release de transição pelo workflow e confirmar que ela contém
   `Setup.exe`, `RELEASES` e o pacote `*.full.nupkg`.
2. Instalações antigas recebem essa release uma única vez pelo `Setup.exe`; isso
   atualiza o executável que sabe iniciar o `Update.exe` instalado.
3. Releases posteriores continuam sendo publicadas com o mesmo conjunto de
   artefatos. O usuário instalado confirma o update no app, aguarda o download
   e o app reinicia pelo Squirrel.
4. Antes de considerar a release pronta, testar uma instalação existente e
   confirmar que um erro de rede mantém o app aberto e permite retry.

## Success Criteria

- Uma instalação Squirrel existente permanece compatível com o updater depois
  da instalação única da release de transição; as releases seguintes não exigem
  novo `Setup.exe` no fluxo normal.
- O workflow publica `Setup.exe`, `RELEASES` e os pacotes `*.nupkg` na mesma
  release versionada do GitHub.
- O botão de atualização pede confirmação, mostra uma barra com o percentual
  real de 0 a 100 durante check/download/aplicação e reinicia automaticamente
  após a conclusão do `Update.exe`.
- Falhas de rede, feed ausente ou erro do updater não encerram o app nem
  relançam o app.
- O comportamento de verificação existente continua respeitando a opção
  `checkForUpdates`.
- O fluxo é somente Windows e não tenta atualizar em desenvolvimento ou em
  plataformas não suportadas.

## References

- Electron `autoUpdater` / Squirrel.Windows: `/electron/electron` via Context7
  e [API autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater).
- Electron Forge MakerSquirrel: `/electron-forge/electron-forge-docs` via
  Context7.
- Squirrel.Windows update protocol: `/squirrel/squirrel.windows` via Context7
  e [Update.exe source](https://raw.githubusercontent.com/Squirrel/Squirrel.Windows/develop/src/Update/Program.cs).

## Open Questions

Nenhuma. O formato de atualização permanece Squirrel.Windows e o repositório
continua sendo a origem das releases.
