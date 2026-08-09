# Implementation Plan: Importação completa de pacotes de agentes do GitHub

## Status

Implementação concluída no workspace. O fluxo compatível de skills/ZIP foi
preservado e o novo fluxo de componentes está coberto por testes, typecheck e
build. Permanecem como verificações externas o smoke manual contra uma revisão
remota fixa de `agent-skills` e a correção da configuração legada do ESLint 9.

## Overview

Substituir o pipeline atual, centrado em `DetectedSkill[]`, por análise,
planejamento e instalação de componentes. O importador reconhecerá manifestos,
skills, hooks, agentes, comandos, referências, scripts e assets, preservará
dependências e oferecerá instalação por destino.

O fluxo de ZIP e `importSkills` permanecerá compatível durante a migração,
reduzindo o risco de regressão enquanto a nova UI passa ao contrato de
componentes.

## Architecture Decisions

- **Contrato discriminado:** `ImportComponent`, `ImportAnalysis`,
  `ImportPlan`, conflitos e resultados por item; sem `any` na nova API.
- **Revisão imutável:** resolver branch/tag para commit/tree SHA antes da
  análise e usar a mesma revisão ao baixar os arquivos.
- **Detector manifest-first:** consultar manifestos conhecidos e depois aplicar
  convenções explícitas; recursos compartilhados entram como dependências.
- **Plano antes da mutação:** análise, seleção, destino, risco e conflito são
  fases distintas; o main revalida o plano antes de instalar.
- **Registry de adapters:** cada ferramenta declara tipos, escopos, paths,
  preview, conflito, rollback e capacidade de ativar hooks.
- **Staging central:** snapshots ficam em
  `getAppDataDir()/imports/<importId>/source`; skills continuam usando a
  fonte central e links atuais.
- **Hooks em duas operações:** instalar desabilitado e ativar somente depois de
  diff, backup e segunda confirmação.
- **Subprocessos restritos:** fallback usa `spawn`/`execFile` sem shell por
  padrão, captura saída e aceita cancelamento; shell/elevação exige confirmação.
- **Conflito conservador:** bloquear por padrão; merge só para schemas
  conhecidos e sempre com backup.
- **Proveniência JSON:** `imports.json` segue o padrão de
  `LinkService`/`ProjectService` e permite atualização futura.

## Dependency Graph

```text
Path safety + contracts
        |
        +-- Revision-aware GitHub acquisition
                |
                +-- Component detector + dependency graph
                        |
                        +-- Selection/target plan
                                |
                +---------------+----------------+
                |               |                |
             Staging        Fallback          Hooks
                +---------------+----------------+
                                |
                    Native adapters + provenance
                                |
                         IPC + typed preload
                                |
                         Inventory/review UI
                                |
                  Integration and quality gates
```

## Documentação externa consultada

- Electron `/electron/electron`, lockfile `33.4.11`: wrappers mínimos via
  `contextBridge`, `ipcRenderer.invoke` e `ipcMain.handle`; fontes:
  [Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
  e [IPC](https://www.electronjs.org/docs/latest/tutorial/ipc).
- Node.js `/nodejs/node`: `spawn`/`execFile`, pipes de stdout/stderr e
  `AbortSignal`; fonte:
  [Child process](https://nodejs.org/api/child_process.html). O runtime não é
  fixado no `package.json`; testar no Node embarcado pelo Electron e Windows.
- GitHub REST `/websites/github_en_rest`: refs/branches, árvores por SHA e
  contents por path; fontes:
  [Git trees](https://docs.github.com/en/rest/git/trees),
  [Git refs](https://docs.github.com/en/rest/git/refs),
  [Branches](https://docs.github.com/en/rest/branches/branches) e
  [Contents](https://docs.github.com/en/rest/repos/contents).
- Radix Primitives `/radix-ui/primitives`, lockfile `1.1.15`: Dialog
  controlado, título/descrição, foco, Escape e retorno de foco; fonte:
  [Dialog](https://www.radix-ui.com/primitives/docs/components/dialog).

## Task List

### Phase 1: Análise confiável

- [x] Task 1: Contratos de importação e segurança de paths
- [x] Task 2: Aquisição por revisão resolvida
- [x] Task 3: Detector de componentes e grafo de dependências

### Checkpoint: Análise

- [x] Fixture equivalente a `agent-skills` lista todos os componentes sem
      escrever ou executar nada.
- [x] Ref, commit/tree SHA, paths relativos e erros de manifesto aparecem.
- [x] Testes focados e typecheck passam.
- [x] Revisão humana antes das primeiras mutações.

### Phase 2: Plano e barreiras

- [x] Task 4: Plano de seleção, destinos e dependências
- [x] Task 5: Staging seguro e materialização
- [x] Task 6: Fallback de comando autorizado
- [x] Task 7: Ciclo de vida seguro de hooks

### Checkpoint: Plano seguro

- [x] Plano pode ser criado, revisado e expirado sem instalar.
- [x] Traversal, symlink, arquivo grande e manifesto inválido são bloqueados.
- [x] Fallback não executa na análise e possui saída/cancelamento.
- [x] Hook é instalado desabilitado e ativa em chamada separada.

### Phase 3: Instalação e proveniência

- [x] Task 8: Registry de capacidades e adaptador de skill
- [x] Task 9: Operações de arquivos, conflitos e rollback
- [x] Task 10: Proveniência e atualização

### Checkpoint: Backend instalável

- [x] Seleção mista instala em destinos válidos.
- [x] Conflitos bloqueiam; backups, rollback e falhas parciais são reportados.
- [x] Cada item aponta para origem, revisão, destino e método em
      `imports.json`.

### Phase 4: API e UX

- [x] Task 11: IPC, preload e contratos tipados
- [x] Task 12: Inventário e mapeamento de destinos
- [x] Task 13: Revisão, confirmação, ativação e resultados

### Checkpoint: Fluxo completo

- [x] Wizard percorre URL, análise, seleção, destino, riscos, conflitos,
      instalação e resultado.
- [x] Hooks, fallbacks, diffs, erros e falhas parciais são visíveis.
- [x] A UI permanece acessível e responsiva.

### Phase 5: Integração e qualidade

- [x] Task 14: Smoke test do pacote de referência e regressão do ZIP
- [x] Task 15: Gates finais e documentação

### Checkpoint: Complete

- [x] Critérios da spec passam com evidência.
- [x] Testes, typecheck, lint e build são executados e registrados.
- [x] Plano/todo refletem o estado real.

## Parallelization Opportunities

- Tasks 1–3 são sequenciais porque todos dependem do contrato e do grafo.
- Tasks 5–7 podem ser paralelas depois que Task 4 estabilizar os contratos.
- Tasks 8 e 10 podem avançar em paralelo após Task 5; Task 9 integra os dois.
- A estrutura visual da Task 12 pode avançar após Task 11; confirmação real
  depende dos contratos backend da Task 13.
- Task 14 e documentação final só ocorrem após as fatias funcionais.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Ref muda durante instalação | Alto | Registrar commit/tree SHA e rejeitar plano divergente |
| Manifest aponta fora da árvore | Alto | Normalização, allowlist e testes de traversal |
| Hook/script malicioso | Alto | Staging desabilitado, segunda confirmação, diff e backup |
| Fallback executa shell inesperado | Alto | Processo direto sem shell; confirmação extra para shell/elevação |
| Path de ferramenta incorreto | Alto | Adapter registry, docs oficiais e status manual sem adivinhação |
| Recurso compartilhado omitido | Alto | Grafo de dependências e seleção em cascata |
| Configuração sobrescrita | Alto | Conflito bloqueado, diff, backup e merge conhecido |
| Árvore GitHub truncada/rate limit | Médio | Verificar `truncated`, tratar rate limit e reportar incompletude |
| Regressão de ZIP/skills | Médio | Wrapper compatível e testes de migração incremental |
| Wizard grande | Médio | Componentes por fase, resumo de risco, foco Radix e testes responsivos |
| .cmd/.bat no Windows | Médio | Resolver executável por plataforma e testar sem shell implícito |

## Open Questions

- A matriz final de paths/capacidades de Claude, Codex, OpenCode, Kimi e Cursor
  deve ser validada nas documentações oficiais durante a implementação. Se um
  schema não for confirmável, o adapter retorna `manual`.
- A ativação de hooks em configuração compartilhada deve manter desativação
  correspondente; fechar isso na Task 7 com fixtures reais.
- Se “suporte total” incluir ferramenta fora do catálogo atual de
  `IDEAdapterService`, isso deve ser uma decisão explícita antes da Task 8.

## Definition of Done

- Cada task possui critérios e verificação em `tasks/todo.md`.
- Nenhuma task de implementação prevê mais de cinco arquivos.
- Todo código novo possui testes unitários/integrados proporcionais ao risco.
- Não há execução de terceiros durante análise ou sem confirmação.
- O usuário consegue auditar origem, destino, risco, resultado e rollback.
- O plano é revisado e aprovado antes da implementação.

## Phase 6: Correção de identidade de skills distribuídas

### Objetivo

Corrigir a análise de repositórios que vendorizam uma mesma skill em várias
raízes de provider. A identidade lógica deve ser o caminho relativo da skill,
enquanto a origem concreta permanece como variante selecionável pelo target.

### Task 16: Agrupamento e resolução de variantes

- [x] Agrupar raízes reconhecidas como `*/skills/<logical-path>` em uma única
      componente `skill` e preservar as variantes com seus arquivos/targets.
- [x] Escolher a variante compatível com o target na criação do plano, usando a
      variante canônica somente como fallback.
- [x] Exibir a contagem e as origens das variantes e não pré-selecionar bundles
      marcados como informativos quando eles sobrepõem os filhos.

### Verificação

- [x] Teste do detector reproduz `.agents/.claude/.cursor/skills/impeccable`.
- [x] Teste do plano confirma a seleção de `.claude` para Claude Code e
      `.agents` para Codex/central quando disponíveis.
- [x] Testes de UI exibem as variantes sem duplicar linhas de skill.

## Phase 7: Inventário orientado a decisões

### Objetivo

Reduzir a carga cognitiva do inventário sem remover a análise técnica. A UI
deve agrupar escolhas primárias, esconder arquivos de suporte atrás de uma
seção técnica e tornar bundles uma rota alternativa explícita.

### Task 17: Agrupamento e seleção conservadora do inventário

- [x] Agrupar `skill`, `command`, `agent` e `hook` como escolhas de primeiro
      nível; mostrar `reference`, `script`, `config` e `asset` como suporte.
- [x] Selecionar apenas skills por padrão; bundles, hooks e itens técnicos ficam
      desmarcados e continuam auditáveis.
- [x] Adicionar `Select all`, `Clear all` e ações equivalentes por grupo, sem
      marcar suporte automaticamente nem combinar bundle com os filhos.
- [x] Explicar skill, hook, command, agent, bundle e suporte com texto curto;
      manter destino, risco, preview e autorização de fallback nos detalhes.

### Verificação

- [x] Testes de utilitários cobrem agrupamento, defaults e seleção global/por
      grupo.
- [x] Testes de UI confirmam hooks desmarcados, variantes sem duplicação,
      suporte recolhido e destino/preview preservados.
- [x] `npm run typecheck` e `npm run build`.
