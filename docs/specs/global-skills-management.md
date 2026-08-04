# Spec: Gestão de skills globais por ferramenta

## Objective

Adicionar ao espaço “Skills” uma visão “Global por ferramenta” para inventariar
e administrar as skills instaladas no escopo global das ferramentas/IDEs
reconhecidas pelo Skills Manager.

O usuário deve conseguir:

- alternar entre “Gerenciadas”, “Global por ferramenta” e “Projeto” sem misturar
  os escopos;
- visualizar todas as ferramentas suportadas pelo detector, inclusive as que
  ainda não possuem um diretório global de skills;
- visualizar as skills encontradas em cada diretório global, com caminho, estado,
  origem e indicação de skill gerenciada ou externa;
- abrir uma prévia somente leitura do `SKILL.md`;
- excluir uma entrada individual ou várias entradas selecionadas em ferramentas
  diferentes;
- entender exatamente quais ferramentas e caminhos serão afetados antes de
  confirmar a exclusão;
- desfazer a exclusão quando a estratégia recuperável da plataforma permitir.

A remoção deve afetar somente a entrada no diretório global da ferramenta. A
fonte central do Skills Manager, skills de projeto e cópias/links equivalentes
em outras ferramentas não podem ser removidos por essa feature.

## Tech Stack

- Electron 33 com processo principal em TypeScript
- React 18 no renderer
- Radix UI para diálogos e abas quando aplicável
- Tailwind CSS 3.4, seguindo os tokens e componentes visuais existentes
- Vitest, Testing Library e jsdom
- APIs nativas do Electron/Node para detecção, leitura e Lixeira
- Nenhuma dependência nova

## Commands

```text
Focused tests: npx vitest run src/main/services/global-skill.service.test.ts src/main/ipc/handlers.test.ts src/renderer/src/components/ui/GlobalSkillsView.test.tsx src/renderer/src/pages/SkillsPage.test.tsx
Test: npm test
Typecheck: npm run typecheck
Lint: npm run lint
Build: npm run build
```

## Project Structure

- `src/main/services/global-skill.service.ts` — inventário, classificação,
  leitura de prévia e remoção segura de entradas globais
- `src/main/services/global-skill.service.test.ts` — testes de filesystem,
  classificação, validação e remoção recuperável
- `src/main/types/domain.ts` — contratos do inventário e resultados da operação
- `src/main/ipc/handlers.ts` — handlers IPC com validação na fronteira
- `src/preload/index.ts` — API mínima exposta ao renderer
- `src/renderer/src/types/electron.d.ts` — tipos da API exposta
- `src/renderer/src/pages/SkillsPage.tsx` — navegação entre os três escopos
- `src/renderer/src/components/ui/GlobalSkillsView.tsx` — container da visão
  global, estados de carregamento/erro/vazio e ações
- `src/renderer/src/components/ui/GlobalSkillsView.test.tsx` — testes de
  interação e critérios de acessibilidade da visão global
- `docs/specs/global-skills-management.md` — especificação viva da feature
- `tasks/plan.md` e `tasks/todo.md` — plano e tarefas após aprovação desta
  especificação

## Architecture Decisions

### Inventário por ferramenta

O serviço principal deve partir das definições atuais do
`IDEAdapterService`. Para cada ferramenta, resolve os `skillRootTemplates` ou o
override configurado, informa se o diretório existe e lista suas entradas sem
consultar raízes relativas a projetos.

Raízes compartilhadas por duas ou mais ferramentas devem ser deduplicadas no
filesystem e expostas com `sharedWith`, para que o usuário saiba que excluir
uma entrada compartilhada afeta todas as ferramentas indicadas. Seleções em
lote também devem remover cada caminho físico no máximo uma vez.

### Classificação e proteção

- `managed`: há um link global persistido cujo `destinationPath` corresponde à
  entrada atual;
- `external`: a entrada existe no diretório global, mas não é conhecida pelo
  inventário de links do Skills Manager;
- `broken`: o diretório/link global existe, mas o `SKILL.md` não pode ser lido;
- `protected`: o caminho resolve para a raiz central ou para dentro dela e não
  pode ser removido por esta feature.

O backend deve revalidar cada item no momento da leitura da prévia e da
remoção. O renderer não poderá enviar um caminho arbitrário e obter acesso a
filesystem fora das raízes globais detectadas. A identificação enviada pelo
renderer será resolvida novamente pelo serviço contra o inventário atual.

### Remoção recuperável

A operação deve usar uma estratégia de descarte recuperável, preferindo a
Lixeira do sistema através do Electron. A resposta por item informa se a ação
pode ser desfeita pela aplicação. O renderer mostra “Desfazer” somente quando
essa capacidade estiver disponível; nos demais casos informa claramente que o
item foi movido para a Lixeira do sistema.

Para entradas gerenciadas, o estado persistido do link não deve ser apagado
automaticamente: ele continua sendo a referência necessária para recriar o
link em um eventual desfazer. A remoção de uma entrada externa não cria nem
altera uma fonte central.

### Contrato de dados

Os contratos devem representar pelo menos:

- resultado do inventário, com `scannedAt`, lista de ferramentas e contagens;
- ferramenta com `ideId`, nome, estado de detecção, raízes resolvidas e skills;
- skill global com identificador opaco, nome, display name quando disponível,
  descrição opcional, caminho, raiz, origem, status e ferramentas
  compartilhadas;
- prévia com metadados, caminho e conteúdo limitado do `SKILL.md`;
- resultado de remoção por item (`trashed`, `already-missing`, `blocked` ou
  `failed`), mensagem e capacidade de desfazer.

O conteúdo da prévia deve ser limitado no processo principal para evitar que um
arquivo inesperadamente grande congele a UI. O React deve renderizar o texto
como texto simples, nunca como HTML.

## UI/UX Requirements

- Manter o tema escuro/glass e a escala visual já usada no aplicativo; não
  introduzir uma paleta ou estilo paralelo.
- Exibir um cabeçalho com contagens resumidas, ação de atualizar e busca/filtro
  local para encontrar skills rapidamente.
- Organizar a visão por ferramenta em painéis/accordions com nome, estado
  detectado/não detectado, quantidade, caminho principal e estado vazio
  explicativo.
- Em cada skill, mostrar nome, tipo “Gerenciada” ou “Externa”, status,
  caminho, ferramenta(s) afetada(s) e controles de prévia/seleção/remoção.
- Para uma raiz compartilhada, mostrar um aviso textual de que a entrada é
  usada por mais de uma ferramenta; não depender apenas da cor.
- Ao selecionar itens, mostrar uma barra de ações com quantidade e uma ação
  destrutiva claramente rotulada.
- A confirmação em lote deve agrupar os itens por ferramenta e listar os
  caminhos físicos que serão removidos, sem duplicar caminhos compartilhados.
- A prévia deve ser somente leitura, em painel/modal com título, metadados,
  caminho e bloco de conteúdo com rolagem.
- Cobrir estados de carregamento, erro, vazio, item ausente entre leitura e
  remoção e falha parcial em lote.
- Todos os botões, abas, checkboxes, diálogo e conteúdo expansível devem ser
  operáveis por teclado e possuir nomes acessíveis.
- Layout deve permanecer utilizável em 320px, 768px, 1024px e 1440px.

## Code Style

Manter a validação e as decisões de filesystem no processo principal, deixando
o renderer responsável por estado visual e interação:

```ts
const inventory = globalSkillService.scan();
const selectedItems = inventory.items.filter((item) => selectedIds.has(item.id));

const result = await globalSkillService.remove(
  selectedItems.map((item) => item.id),
);
```

Usar TypeScript estrito, nomes descritivos, funções pequenas, resultados
tipados e componentes focados. Reutilizar os tokens/classes existentes antes
de criar estilos novos. Não passar caminhos diretamente para operações
destrutivas sem validação no processo principal.

## Testing Strategy

- **Unit/integration do serviço:** usar diretórios temporários reais para
  verificar descoberta de ferramentas, raízes compartilhadas, parsing mínimo,
  classificação gerenciada/externa, proteção da raiz central, rejeição de
  identificadores inválidos e remoção via dependência de Lixeira.
- **IPC:** verificar que inventário, prévia e remoção expõem somente os
  contratos esperados e que entradas fora das raízes ou de projeto são
  bloqueadas.
- **Renderer:** testar troca entre abas, ferramentas vazias, badges de estado,
  prévia, seleção cruzada entre ferramentas, confirmação agrupada, sucesso,
  falha parcial e mensagem de desfazer/fallback.
- **Regressão:** manter o comportamento atual das abas Gerenciadas e Projeto,
  incluindo criação/remoção de skills centrais e links.
- Executar testes focados após cada fatia e a suíte completa, typecheck, lint e
  build antes da conclusão.

## Boundaries

- **Always:** escanear somente escopos globais, revalidar entradas no backend,
  preservar fontes e projetos, proteger a raiz central, deduplicar caminhos
  compartilhados, usar confirmação explícita, tratar falhas parciais e manter
  testes dos fluxos existentes.
- **Ask first:** alterar a definição de uma IDE, mudar raízes globais
  canônicas, adicionar dependências, mudar o formato persistido de links ou
  implementar restauração permanente fora das capacidades da plataforma.
- **Never:** apagar skills de projeto, apagar a fonte central por engano,
  seguir caminhos enviados pelo renderer sem allowlist, renderizar `SKILL.md`
  como HTML, remover confirmação destrutiva, remover testes ou alterar links
  equivalentes em outras ferramentas como efeito colateral silencioso.

## Success Criteria

1. “Skills” apresenta claramente as visões “Gerenciadas”, “Global por
   ferramenta” e “Projeto”.
2. A visão global lista todas as ferramentas do catálogo de detecção, informa
   quais estão detectadas e mostra estado vazio para as demais.
3. Skills globais gerenciadas e externas aparecem diferenciadas, com caminho,
   status e ferramentas compartilhadas quando aplicável.
4. O usuário consegue abrir uma prévia somente leitura do `SKILL.md` sem
   editar seu conteúdo.
5. O usuário consegue excluir uma skill individual ou um conjunto selecionado
   em várias ferramentas, com confirmação agrupada por ferramenta e caminhos.
6. A remoção envia a entrada para uma estratégia recuperável quando possível,
   reporta sucesso/falha por item e oferece “Desfazer” apenas quando seguro;
   nenhum projeto ou fonte central é afetado.
7. Entradas externas podem ser removidas, mas recebem aviso explícito de que
   não são preservadas pelo Skills Manager.
8. Caminhos fora das raízes globais permitidas e caminhos que resolvam para a
   fonte central são recusados pelo processo principal.
9. A suíte de testes, typecheck, lint e build passam sem regressões.

## Open Questions

Nenhuma bloqueante para iniciar o plano. A disponibilidade exata de “Desfazer”
é determinada por plataforma e pelo resultado da estratégia de descarte; o
fallback visível ao usuário é a Lixeira do sistema.
