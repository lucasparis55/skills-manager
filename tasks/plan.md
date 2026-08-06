# Plano de Implementação: Saúde e Reparo da Distribuição de Skills

## Status

Implementação concluída em fatias verticais; permanece somente a inspeção visual manual do modal em larguras reais, caso o app seja aberto em uma sessão interativa.

## Overview

Adicionar uma verificação de distribuição por skill para que o autor consiga confirmar, em um único fluxo, se os links globais e de projeto registrados pelo Skills Manager continuam apontando para a fonte central correta. O fluxo exibirá um diagnóstico por IDE/projeto e permitirá reparar somente os destinos gerenciados, mediante prévia e confirmação explícita.

A feature complementa as páginas atuais de Skills, Links, Projects e Global Skills. Ela não copiará conteúdo entre IDEs, não criará links para destinos que o usuário nunca registrou e não modificará links externos ou conflitantes.

## Contexto atual

- `SkillsPage` permite criar, editar, importar, excluir e filtrar skills gerenciadas.
- `LinksPage` permite criar links globais/projeto, verificar links individuais ou todos, filtrar e remover links.
- `ProjectsPage` cadastra, escaneia, filtra e remove projetos.
- `GlobalSkillsView` inventaria skills globais por ferramenta, oferece prévia e remoção recuperável.
- `DuplicatesPage` detecta cópias exatas em raízes globais e oferece remoção ou migração para a fonte central.
- Settings já contém configuração de raízes, estratégia de symlink/junction e migração de links globais legados.

### Lacuna que a feature resolve

Depois de editar uma skill, o usuário não tem um ponto de entrada contextual para saber quais destinos dessa skill estão quebrados, em conflito, indisponíveis ou em caminho legado. Ele precisa sair da skill e verificar os links manualmente.

## Objetivo e não objetivos

### Objetivos

- Verificar todos os links persistidos de uma skill em uma única ação.
- Mostrar estado, IDE, projeto/escopo, destino e motivo do diagnóstico.
- Oferecer reparo explícito apenas para itens revalidáveis e gerenciados.
- Revalidar IDs e caminhos no processo principal antes de qualquer alteração.
- Reportar sucesso, falha parcial e rollback de cada item reparado.
- Preservar o fluxo atual de criação, edição, links, migração e inventário global.

### Fora do escopo

- Copiar ou sincronizar conteúdo entre diretórios.
- Criar automaticamente links em todos os projetos ou IDEs detectados.
- Alterar links externos/desconhecidos.
- Sobrescrever arquivos, diretórios ou links em conflito.
- Adicionar novas IDEs, dependências ou um formato persistido novo.
- Substituir a página de Links ou a migração explícita existente em Settings.

## Dependency graph

```text
Contratos de diagnóstico e reparo
    │
    ├── SkillHealthService no processo principal
    │       │
    │       ├── SkillService / LinkService
    │       ├── SymlinkService / IDEAdapterService
    │       ├── ProjectService / SettingsService
    │       └── LinkMigrationService para destinos globais legados
    │
    ├── IPC handlers + preload tipado
    │       │
    │       └── window.api.skills.checkDistribution / repairDistribution
    │
    └── SkillHealthDialog + SkillsPage
            │
            └── verificação pós-edição e reparo confirmado
```

## Architecture Decisions

- **Serviço orquestrador dedicado:** criar `SkillHealthService` em vez de concentrar diagnóstico e reparo em `LinkService`. O serviço coordena uma skill e seus destinos; `LinkService` continua responsável por persistência e verificação básica.
- **API agrupada por recurso:** expor a feature em `window.api.skills`, com `checkDistribution(skillId)` e `repairDistribution(skillId, linkIds)`. O renderer enviará IDs opacos, nunca caminhos locais.
- **Revalidação no processo principal:** o processo principal fará novo lookup da skill, dos links e das raízes permitidas no início do diagnóstico e novamente antes do reparo. O resultado mostrado na UI não será tratado como autorização.
- **Diagnóstico baseado em links registrados:** a feature verificará destinos que já pertencem ao inventário persistido. Ela não inferirá que uma skill deveria estar instalada em todo projeto detectado.
- **Estados explícitos:** usar estados tipados como `healthy`, `broken`, `conflict`, `legacy` e `unavailable`, sempre acompanhados de texto explicativo e de `repairable`.
- **Reparo seguro por item:** links quebrados gerenciados podem ser recriados se o destino estiver livre; conflitos e links externos serão bloqueados. Destinos globais legados devem reutilizar as regras de `LinkMigrationService`.
- **Rollback e resultado parcial:** cada item retornará seu resultado; se uma etapa criar um destino e a persistência posterior falhar, o destino criado será removido e o estado anterior será preservado quando possível.
- **UI contextual:** não criar um novo item de menu. A ação ficará na linha da skill, com modal controlado baseado em Radix Dialog, relatório agrupado e confirmação antes de reparar.
- **Sem dependências novas:** reutilizar React, Radix Dialog/Select, Tailwind, IPC existente e serviços de filesystem já presentes.

## Documentação externa consultada

- Electron `33.4.11`, biblioteca Context7 `/electron/electron`: usar `ipcMain.handle` + `ipcRenderer.invoke` para request/response e expor somente wrappers mínimos pelo `contextBridge`, sem expor o `ipcRenderer` inteiro. Referências oficiais: [IPC Main](https://github.com/electron/electron/blob/main/docs/api/ipc-main.md), [IPC tutorial](https://github.com/electron/electron/blob/main/docs/tutorial/ipc.md) e [Security](https://github.com/electron/electron/blob/main/docs/tutorial/security.md).
- Radix Primitives `@radix-ui/react-dialog@1.1.15`, biblioteca Context7 `/radix-ui/primitives`: manter `Dialog.Title`/`Dialog.Description`, foco preso no modal, Escape, fechamento controlado e retorno de foco ao acionador. Referência oficial: [Dialog source](https://github.com/radix-ui/primitives/blob/main/packages/react/dialog/src/dialog.tsx).

## Task List

### Phase 1: Contrato e diagnóstico seguro

- [x] Task 1: Definir contratos e implementar o diagnóstico por skill.
- [x] Task 2: Expor o diagnóstico por IPC e preload tipado.

### Checkpoint: Diagnóstico

- [x] Uma skill com link válido, quebrado, conflitante e legado pode ser diagnosticada em fixtures reais.
- [x] O renderer recebe somente IDs e dados de apresentação; nenhum caminho arbitrário é aceito como alvo.
- [x] Testes focados e typecheck passam.

### Phase 2: Relatório e reparo explícito

- [x] Task 3: Criar o relatório visual de saúde da skill.
- [x] Task 4: Implementar reparo seguro no processo principal.
- [x] Task 5: Integrar prévia, confirmação e resultados de reparo na UI.

### Checkpoint: Fluxo principal

- [x] O autor abre uma skill, verifica todos os destinos, entende os problemas e repara apenas os itens selecionados após confirmação.
- [x] Conflitos, destinos externos, projetos indisponíveis e falhas parciais permanecem protegidos e visíveis.
- [x] A página Links continua funcionando sem regressão.

### Phase 3: Integração pós-edição e verificação final

- [x] Task 6: Verificar a distribuição após salvar uma edição e oferecer retorno contextual.
- [x] Task 7: Executar regressão, acessibilidade, lint, typecheck, testes e build.

### Checkpoint: Completo

- [x] Todos os critérios de aceitação do plano passam.
- [x] O fluxo foi verificado em 320px, 768px, 1024px e 1440px com capturas reais do renderer; o fixture visual cobriu relatório com estados mistos e confirmação explícita.
- [x] O plano está pronto para revisão da implementação executada.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Reparar um destino que deixou de pertencer ao Skills Manager | Alto | Aceitar somente `linkIds`, revalidar fonte, destino, escopo e ownership no processo principal |
| Sobrescrever arquivo ou diretório real em um destino conflitante | Alto | Classificar como `conflict`, bloquear reparo e exigir resolução fora da feature |
| Projeto ou IDE não estar disponível durante o reparo | Alto | Mostrar `unavailable`, não fabricar projeto/raiz e permitir retry após o ambiente voltar |
| Caminho global legado usar regra diferente da atual | Alto | Delegar a migração para `LinkMigrationService` e preservar o fluxo opt-in de Settings |
| Falha no meio de um reparo em lote | Alto | Revalidar antes de cada item, resultado por item, rollback de criação e persistência transacional quando possível |
| Usuário interpretar “sincronizar” como cópia de conteúdo | Médio | Rotular a feature como saúde/reparo de distribuição e explicar que links apontam para a fonte central |
| Modal crescer demais e ficar difícil de usar | Médio | Componente dedicado, resumo no topo, filtros, agrupamento por destino e cards responsivos no mobile |
| Lint global continuar bloqueado pelo estado legado | Médio | Registrar baseline antes da implementação e exigir que os arquivos alterados não adicionem novos erros |

## Open Questions

- Nenhuma pergunta bloqueante para iniciar a implementação.
- A semântica de `legacy` e a estratégia de rollback foram implementadas com allowlist de raízes conhecidas, revalidação do novo link e bloqueio conservador em caso de indisponibilidade.
