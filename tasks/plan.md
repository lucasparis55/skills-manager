# Implementation Plan: Gestão de skills globais por ferramenta

## Overview

Adicionar uma visão global dentro de Skills para listar, pré-visualizar e
remover com segurança skills instaladas nos diretórios globais das ferramentas
detectáveis. A implementação manterá a fonte central e o escopo de projetos
fora da operação, reutilizará as definições atuais de IDEs e usará a Lixeira
como mecanismo recuperável quando suportado.

## Architecture Decisions

- Criar `GlobalSkillService` no processo principal. Ele será responsável por
  resolver raízes permitidas, inventariar diretórios/link entries, classificar
  itens e revalidar qualquer remoção.
- Estender `domain.ts`, preload e declarações do renderer com uma API aditiva:
  `globalSkills.scan()`, `globalSkills.preview(id)`,
  `globalSkills.remove(ids)` e `globalSkills.undo(tokens)`.
- Usar IDs de inventário opacos no renderer; o processo principal fará um novo
  scan e validará cada ID contra as raízes globais atuais antes de ler ou
  remover qualquer caminho.
- Deduplicar entradas físicas em raízes compartilhadas e expor as ferramentas
  relacionadas em `sharedWith`. Uma operação em lote nunca removerá o mesmo
  caminho mais de uma vez.
- Classificar uma entrada como gerenciada somente quando um link global
  persistido apontar para o destino atual. Entradas não conhecidas serão
  externas e terão aviso explícito.
- Manter a visão global em `GlobalSkillsView.tsx`, separada do componente grande
  de skills centrais. `SkillsPage` fornecerá apenas a navegação entre escopos e
  o fluxo atual continuará funcionando.
- Manter o tema, classes e componentes Radix existentes; não adicionar
  dependências.

## Task List

### Phase 1: Foundation and inventory

- [x] Task 1: Definir contratos e implementar o inventário global seguro.
- [x] Task 2: Expor scan, prévia, remoção e desfazer através de IPC/preload.

### Checkpoint: Backend contract

- [x] Testes do serviço e IPC passam.
- [x] Typecheck passa.
- [x] Nenhuma operação de scan consulta raízes de projeto ou permite apagar a
      raiz central.

### Phase 2: Global view

- [x] Task 3: Criar `GlobalSkillsView` com contagens, estados e agrupamento por
      ferramenta.
- [x] Task 4: Integrar navegação por abas e implementar prévia, seleção cruzada,
      confirmação agrupada e feedback de remoção.

### Checkpoint: User flow

- [x] A visão global lista ferramentas vazias e itens gerenciados/externos.
- [x] Prévia, exclusão individual e exclusão em lote funcionam com feedback de
      sucesso, falha parcial e fallback de Lixeira.
- [x] Abas Gerenciadas e Projeto permanecem sem regressão.

### Phase 3: Final verification

- [x] Task 5: Executar revisão multi-eixo, acessibilidade, lint, suíte completa
      e build (a execução focada da feature não encontrou erros; o comando
      global falha por erros legados e pela configuração `.eslintrc.js` com
      ESLint 9).

### Checkpoint: Complete

- [x] Todos os critérios da especificação são verificáveis, exceto o gate de
      lint global bloqueado pelo estado preexistente do repositório.
- [x] Nenhum problema crítico de correção, segurança, arquitetura ou
      performance permanece.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Caminho enviado pelo renderer escapar da raiz permitida | Alto | Aceitar somente IDs do inventário e revalidar por scan no processo principal |
| Raiz compartilhada aparecer em várias ferramentas | Alto | Deduplicar por caminho normalizado e exibir `sharedWith` |
| Skill central ser confundida com entrada global | Alto | Bloquear raiz central e descendentes antes de qualquer remoção |
| Junction/symlink quebrado não ser lido como diretório | Médio | Usar `lstat`, detectar link entry e mostrar estado quebrado removível |
| Electron não oferecer restauração uniforme | Médio | Retornar capacidade por item e usar fallback explícito para Lixeira |
| `SkillsPage` crescer além de um componente legível | Médio | Manter a nova view em componente próprio e limitar a integração a navegação |
| Falha parcial em lote deixar UI inconsistente | Médio | Resultado por item, novo scan após operação e toast resumido |

## Open Questions

Nenhuma. A estratégia de restauração é best-effort por plataforma conforme a
especificação aprovada; quando não houver desfazer seguro, a UI informa o uso da
Lixeira do sistema.
