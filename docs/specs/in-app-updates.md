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
   GitHub e inicia o download usando o `autoUpdater` do Electron.
5. A interface mostra o estado indeterminado de download e impede uma segunda
   atualização concorrente.
6. Ao receber `update-downloaded`, o app informa que está aplicando e chama
   `quitAndInstall()` para fechar e
   reiniciar já com a versão nova.
7. Em erro, o app não chama `quitAndInstall()`, mantém a versão atual e mostra
   uma ação de retry.

Instalações existentes geradas pelo MakerSquirrel são compatíveis com o fluxo
depois que recebem a release de transição que contém este código. Essa release
de transição ainda precisa ser instalada uma vez com `Setup.exe`, porque o
executável antigo não possui código para iniciar o `autoUpdater`. A partir dela,
cada release deve publicar o `RELEASES` e pelo menos um pacote Squirrel full
(`*.nupkg`), além do `Setup.exe` usado por instalações novas.

## Tech stack

- Electron `33.4.11` resolvido no `package-lock.json`.
- Electron Forge `7.11.1` e `@electron-forge/maker-squirrel` `7.11.1`.
- TypeScript, React, Vite e Vitest já usados no repositório.
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

- `src/main/services/update.service.ts` — consulta GitHub e coordena o
  `autoUpdater`.
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
`autoUpdater` e tratar eventos como estado observável:

```ts
const update = await updateService.checkForUpdates();

if (update.hasUpdate) {
  await updateService.downloadAndInstall((status) => {
    sendStatus(status);
  });
}
```

O renderer não recebe caminhos locais nem executa comandos. A decisão sobre o
feed, a validação da release e a chamada ao Electron ficam no processo
principal.

## Testing Strategy

- Testar a comparação de versões e a construção do feed com testes unitários.
- Usar um fake pequeno do `autoUpdater` para verificar estados de download,
  sucesso, erro e chamada única de `quitAndInstall()`.
- Testar os handlers IPC e a limpeza dos listeners do preload.
- Testar o diálogo e o hook com React Testing Library, incluindo confirmação,
  estados de download, retry e estados de erro.
- Rodar a suíte completa, typecheck, lint e build antes da entrega.
- Fazer uma verificação manual em uma build Windows instalada: detectar a
  release, confirmar, acompanhar o download e validar o reinício na versão
  nova.

## Boundaries

- **Sempre fazer:** manter GitHub como origem, usar somente o updater Squirrel
  já presente nas instalações, não iniciar download sem confirmação, manter a
  versão atual em caso de falha e validar entradas de release antes de formar
  URLs.
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
   atualiza o executável que sabe iniciar o updater nativo.
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
- O botão de atualização pede confirmação, baixa dentro do app, mostra o estado
  de download e reinicia automaticamente após `update-downloaded`.
- Falhas de rede, feed ausente ou erro do updater não encerram o app nem
  chamam `quitAndInstall()`.
- O comportamento de verificação existente continua respeitando a opção
  `checkForUpdates`.
- O fluxo é somente Windows e não tenta atualizar em desenvolvimento ou em
  plataformas não suportadas.

## References

- Electron `autoUpdater` / Squirrel.Windows: `/electron/electron` via Context7.
- Electron Forge MakerSquirrel: `/electron-forge/electron-forge-docs` via
  Context7.
- Squirrel.Windows update protocol: `/squirrel/squirrel.windows` via
  Context7.

## Open Questions

Nenhuma. O formato de atualização permanece Squirrel.Windows e o repositório
continua sendo a origem das releases.
