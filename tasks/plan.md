# Implementation Plan: Links globais sem projeto

## Overview

Estender o fluxo de criação de links para tratar projeto como dependência do
escopo `Project`, e não do link em si. O escopo `Global` continuará usando as
raízes globais já resolvidas para cada IDE.

## Architecture Decisions

- `projectId` será opcional nos inputs de criação e `null` no modelo persistido
  quando o link for global e não estiver associado a um projeto.
- IDs de links existentes não mudam. Links novos sem projeto usam um marcador
  reservado somente na composição do ID, evitando colisões e a criação de um
  projeto fictício.
- A validação de projeto ficará condicionada ao escopo no handler IPC; a
  validação da IDE continuará comum aos dois escopos.
- O formulário ocultará o seletor de projeto quando `Global` estiver
  selecionado.

## Task List

### Phase 1: Regression coverage

- [x] Task 1: Cobrir criação global sem projeto no diálogo e no IPC.

### Checkpoint: Regression coverage

- [x] Os novos testes falham antes da implementação e descrevem os critérios
  de aceitação.

### Phase 2: Core behavior

- [x] Task 2: Atualizar tipos, persistência e handlers para projeto opcional
  somente em links globais.
- [x] Task 3: Atualizar o formulário e a listagem do renderer.

### Checkpoint: Core behavior

- [x] Testes focados, typecheck e build passam.
- [x] O fluxo global não consulta projetos; o fluxo de projeto permanece
  inalterado.

### Phase 3: Final verification

- [x] Task 4: Executar suíte completa, lint, build e revisão multi-eixo.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Links antigos têm `projectId` textual | Alto | Não migrar nem reescrever links existentes; aceitar ambos os formatos |
| IDs globais colidem com links existentes | Alto | Usar marcador reservado apenas para IDs novos sem projeto |
| Projeto continuar sendo exigido em algum caminho | Médio | Testar o handler `create` e `createMultiple` sem `projectId` |
| Filtros/listagem assumirem projeto sempre presente | Médio | Exibir `Global` e cobrir renderização/remoção do link sem projeto |

## Open Questions

Nenhuma.
