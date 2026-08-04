# Spec: Links globais sem projeto

## Objective

Permitir que uma ou mais skills sejam vinculadas ao diretório global de uma IDE
sem selecionar um projeto. O projeto continua obrigatório quando o escopo do
link for `Project`.

O usuário deve conseguir selecionar `Global`, escolher uma IDE, manter uma ou
mais skills selecionadas e criar os links diretamente na raiz global de skills
da IDE. Links globais já persistidos com um projeto continuam válidos e devem
ser exibidos sem migração automática.

## Tech Stack

- Electron 33 com processo principal em TypeScript
- React 18 no renderer
- Radix UI para diálogo e selects
- Vite 5
- Vitest, Testing Library e jsdom para testes

## Commands

```text
Test: npm test
Focused tests: npx vitest run src/renderer/src/components/ui/CreateLinkDialog.test.tsx src/main/ipc/handlers.test.ts src/main/services/link.service.test.ts
Typecheck: npm run typecheck
Lint: npm run lint
Build: npm run build
```

## Project Structure

- `src/renderer/src/components/ui/CreateLinkDialog.tsx` — formulário de criação
- `src/renderer/src/pages/LinksPage.tsx` — listagem e apresentação dos links
- `src/main/types/domain.ts` — contratos de domínio e IPC
- `src/renderer/src/types/electron.d.ts` — contrato exposto ao renderer
- `src/main/ipc/handlers.ts` — validação e criação dos links/symlinks
- `src/main/services/link.service.ts` — persistência dos links
- `src/**/*test.ts(x)` — testes unitários e de componentes
- `docs/specs/` — especificações de funcionalidades
- `tasks/` — plano e tarefas de implementação

## Code Style

Manter a distinção entre escopos explícita e normalizar somente na fronteira
de persistência:

```ts
const project = scope === 'project'
  ? findProject(projectId)
  : undefined;
const resolvedProjectId = projectId ?? null;
const projectPath = project?.path ?? '';
```

Usar TypeScript estrito, nomes descritivos, componentes focados e os padrões
de estado e estilos já existentes. Não introduzir dependências novas nem
alterar o comportamento do escopo `project`.

## Testing Strategy

- Testes de componente verificam que o modo `Global` não exige projeto e que o
  modo `Project` continua exigindo projeto.
- Testes de IPC verificam que links globais sem `projectId` usam a raiz global,
  enquanto links de projeto sem projeto são rejeitados.
- Testes do serviço de links verificam a persistência de `projectId: null` e a
  estabilidade do identificador reservado para links globais.
- A suíte completa, typecheck, lint e build devem passar antes da conclusão.

## Boundaries

- **Always:** preservar links existentes, validar a IDE em ambos os escopos,
  exigir projeto para `Project`, testar o comportamento novo e não criar
  diretórios/projetos artificiais.
- **Ask first:** alterar o formato de links antigos, mudar as raízes globais
  das IDEs, adicionar dependências ou alterar o fluxo de migração.
- **Never:** apagar links existentes automaticamente, tornar o projeto
  opcional no escopo `Project`, remover testes ou alterar o conteúdo real das
  skills.

## Success Criteria

1. No diálogo, selecionar `Global` permite criar links com skills e IDE sem
   selecionar projeto.
2. Selecionar `Project` mantém o projeto como campo obrigatório.
3. O IPC cria links globais sem buscar ou exigir um projeto e usa a raiz global
   configurada da IDE.
4. O IPC rejeita links de projeto sem projeto com uma mensagem clara.
5. Novos links globais sem projeto são persistidos com `projectId: null` e um
   ID estável; links globais existentes com projeto continuam compatíveis.
6. A listagem identifica links globais sem projeto como `Global` e não quebra
   filtros, remoção ou verificação.
7. Testes, typecheck, lint e build passam.

## Open Questions

Nenhuma. O escopo foi confirmado: a IDE é obrigatória, o projeto só é
obrigatório para links `Project` e o diretório global existente deve ser
reutilizado.
