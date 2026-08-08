# Spec: Importação completa de pacotes de agentes do GitHub

## Objective

Evoluir a importação de GitHub para reconhecer um repositório como um pacote
de componentes instaláveis, em vez de tratá-lo somente como uma coleção de
skills.

O usuário deve conseguir:

- informar um repositório, branch/tag e subcaminho opcional;
- analisar a árvore completa e visualizar skills, hooks, agentes, comandos,
  manifestos, referências, scripts, configurações, assets e dependências;
- selecionar um pacote inteiro, uma categoria ou componentes individuais;
- escolher ferramenta, escopo global/projeto e perfil/destino por componente;
- visualizar dependências, arquivos afetados, riscos, conflitos e método de
  instalação antes de confirmar;
- instalar por adaptadores nativos do Skills Manager;
- usar um comando do repositório somente como fallback visível e autorizado;
- instalar hooks desabilitados, revisar conteúdo/eventos e ativá-los em uma
  confirmação separada;
- atualizar ou reimportar componentes usando a origem e a revisão registrada;
- entender, por item, o que foi instalado, ignorado, bloqueado ou falhou.

O caso de referência é `addyosmani/agent-skills`, que combina 24 skills,
personas em `agents/`, referências compartilhadas, scripts, hooks de ciclo de
vida, comandos para várias ferramentas e manifestos de plugin.

### Estado atual

`GitHubImportService` retorna apenas `DetectedSkill[]`, identifica arquivos
`SKILL.md`, baixa arquivos de texto e grava cada item no `centralSkillsRoot`.
O IPC, o preload e `GitHubImportDialog` expõem somente análise, conflito e
importação de skills. Não existe um contrato para componentes, dependências,
destinos por item, ativação de hooks ou proveniência de pacote.

### Resultado esperado

O importador passa a produzir um plano de instalação explícito. A análise não
altera o filesystem nem executa scripts. A instalação só aplica o plano que o
usuário confirmou, e cada operação pode ser revalidada no processo principal.

## Análise do repositório de referência

O repositório não depende de um único `install.sh`. Ele publica integrações
específicas por ferramenta e usa manifestos para declarar partes do pacote:

- `.claude-plugin/plugin.json` declara `skills` e `commands`;
- `.codex-plugin/plugin.json` declara metadados e o diretório `skills`;
- `.agents/plugins/marketplace.json` registra o pacote como plugin local;
- `hooks/hooks.json` associa `SessionStart` ao script
  `hooks/session-start.sh`;
- `skills/<name>/SKILL.md` é o payload principal de cada skill;
- `agents/`, `references/`, `scripts/`, `commands/` e diretórios de comandos
  específicos completam o pacote;
- `docs/*-setup.md` descreve destinos e comandos de instalação por ferramenta;
- a documentação oferece caminhos nativos, cópia manual e comandos como
  `npx skills add`, `agy plugin install`, `gemini skills install` e `codex
  plugin add`.

As ideias aplicadas nesta feature são:

1. **Manifesto antes de convenção:** consultar manifestos conhecidos antes de
   inferir componentes por diretório.
2. **Grafo de componentes:** preservar relações entre um hook e seu script,
   uma skill e seus `references/`/`scripts/`, ou um plugin e suas skills e
   comandos.
3. **Integração por capacidade:** cada destino informa quais tipos suporta e
   como instalá-los; a UI não promete suporte apenas porque encontrou um
   arquivo.
4. **Inventário completo com seleção:** recursos compartilhados aparecem no
   inventário, mas são incluídos automaticamente quando uma seleção depende
   deles para evitar instalações quebradas.
5. **Proveniência e revisão:** registrar URL, branch/tag, commit/tree SHA,
   caminho de origem e método usado para permitir atualização e diagnóstico.
6. **Fallback transparente:** comandos encontrados na documentação são
   propostas de instalação, nunca ações implícitas.
7. **Validação antes de execução:** o usuário vê conteúdo, eventos, destino e
   risco antes de habilitar código executável.

## Tech Stack

- Electron 33, processo principal em TypeScript;
- React 18 no renderer;
- Radix UI para diálogos e controles acessíveis;
- Tailwind CSS 3.4, mantendo o tema e tokens atuais;
- Vitest, Testing Library e jsdom;
- APIs nativas Node/Electron para filesystem, subprocessos autorizados e
  caminhos de aplicação;
- nenhuma dependência nova na primeira implementação.

## Commands

```text
Focused tests: npx vitest run src/main/services/github-import.service.test.ts src/main/services/github-import.service.advanced.test.ts src/main/services/github-component-detector.service.test.ts src/main/services/import-adapter.service.test.ts src/main/ipc/handlers.test.ts src/preload/index.test.ts src/renderer/src/components/ui/GitHubImportDialog.test.tsx
Tests: npm test
Typecheck: npm run typecheck
Lint: npm run lint
Build: npm run build
```

Os comandos focados devem ser ajustados somente se os nomes finais dos novos
arquivos mudarem durante o plano.

## Project Structure

- `src/main/types/github.ts` — URL, revisão, metadados, árvore e resultado da
  análise do repositório;
- `src/main/types/import.ts` — tipos de componente, dependência, capacidade,
  destino, conflito, risco, plano, progresso e resultado;
- `src/main/services/github-import.service.ts` — aquisição do repositório,
  compatibilidade retroativa do fluxo de skills e orquestração da análise;
- `src/main/services/github-component-detector.service.ts` — descoberta
  manifest-driven e convencional, deduplicação e construção do grafo;
- `src/main/services/import-adapter.service.ts` — registro de adaptadores,
  geração/revalidação de plano e aplicação/rollback de operações nativas;
- `src/main/services/import-provenance.service.ts` — persistência de
  `imports.json` no diretório de dados do app e consultas de origem/atualização;
- `src/main/services/import-command.service.ts` — staging e execução
  explicitamente autorizada de fallbacks, isolada do detector;
- `src/main/ipc/handlers.ts` — handlers tipados e validação de fronteira;
- `src/preload/index.ts` — API mínima para análise, plano, instalação,
  ativação e progresso;
- `src/renderer/src/types/electron.d.ts` — contratos da API exposta;
- `src/renderer/src/components/ui/GitHubImportDialog.tsx` — wizard de
  inventário, destino, riscos, conflitos, instalação e resultados;
- `src/renderer/src/components/ui/GitHubImportDialog.test.tsx` — testes do
  fluxo completo e acessibilidade;
- `docs/specs/github-repository-import.md` — especificação viva;
- `tasks/plan.md` e `tasks/todo.md` — plano/tarefas somente após aprovação da
  especificação.

## Component Model

### Tipos detectáveis

O detector deve reconhecer, no mínimo, os seguintes tipos:

- `bundle`: raiz lógica de um pacote ou plugin;
- `skill`: diretório com `SKILL.md`, mantendo arquivos auxiliares relativos;
- `hook`: entrada declarativa de evento e seus payloads/scripts;
- `agent`: persona, especialmente `agents/*.md` e `*.agent.md`;
- `command`: comandos em `commands/`, `.claude/commands/`,
  `.gemini/commands/` ou diretórios equivalentes declarados pelo manifesto;
- `reference`: material compartilhado em `references/` ou referenciado por uma
  skill;
- `script`: payload executável em `scripts/`, `hooks/` ou referenciado por um
  hook;
- `config`: manifestos e arquivos de configuração que precisam ser mesclados
  ou copiados para um destino;
- `asset`: arquivos necessários para um componente, incluindo binários;
- `manual-step`: instruções ou comandos detectados na documentação, sem tratar
  documentação como código executável.

`reference`, `script`, `config` e `asset` podem ser filhos de outro
componente. Eles continuam visíveis para auditoria, mas a seleção do pai deve
incluir automaticamente as dependências necessárias. O usuário pode remover
uma dependência somente quando o plano informar que ela não é necessária para
os itens escolhidos.

### Regras de descoberta

1. Aplicar o subpath escolhido e rejeitar caminhos fora dele.
2. Ler manifestos conhecidos com parser JSON seguro; arquivos inválidos geram
   `invalid-manifest`, não falha silenciosa.
3. Resolver referências relativas declaradas pelos manifestos e verificar que
   elas permanecem dentro da árvore do repositório.
4. Inferir convenções somente para diretórios e nomes conhecidos.
5. Associar arquivos ao componente mais específico, evitando que um arquivo
   compartilhado seja duplicado em várias skills.
6. Extrair comandos de README e guias somente como `manual-step`, preservando
   texto, origem, diretório sugerido e motivo da detecção.
7. Ignorar somente entradas explicitamente não instaláveis, como metadados do
   GitHub, imagens do README ou arquivos acima do limite; cada exclusão deve
   aparecer no relatório de análise.
8. Preservar texto e binários pequenos; rejeitar symlinks, traversal, paths
   absolutos e arquivos acima do limite configurado antes do staging.

### Exemplo mínimo de contrato

```ts
interface ImportComponent {
  id: string;
  kind: ImportComponentKind;
  name: string;
  displayName: string;
  sourcePaths: string[];
  parentId?: string;
  dependsOn: string[];
  detectedTargets: string[];
  capabilities: ImportCapability[];
  risk: 'none' | 'reads-files' | 'writes-files' | 'executes-code';
  status: 'available' | 'invalid' | 'manual' | 'unsupported';
  statusMessage?: string;
}
```

O contrato final deve ser discriminado por `kind` quando os dados ou operações
forem diferentes; não usar `any` na nova API de preload/renderer.

## Native Installation

### Adapter registry

Cada adaptador deve declarar:

- `targetId`, nome e escopos aceitos;
- tipos de componente suportados;
- caminho lógico e caminho físico permitido;
- operação (`copy`, `link`, `merge-json`, `merge-markdown`, `register` ou
  `stage`);
- pré-condições e dependências externas;
- como produzir preview/diff;
- como detectar conflito;
- como aplicar, desfazer e verificar a instalação;
- se ativação de hook é suportada e como permanece desabilitada antes da
  confirmação.

O registro deve reutilizar as definições atuais do `IDEAdapterService` e
`ideRootOverrides`, sem espalhar caminhos de ferramentas pelo renderer. A
matriz de capacidades deve ser validada contra a documentação oficial da
ferramenta durante o plano/implementação.

### Operações por tipo

- **Skill:** usar `SkillService` para a fonte central, preservar arquivos
  auxiliares e usar o mecanismo atual de links para destinos de IDE/projeto.
- **Bundle/plugin:** manter uma fonte gerenciada em
  `getAppDataDir()/imports/<importId>/source`, instalar o manifesto e seus
  arquivos no diretório de plugin suportado pelo adaptador e registrar a
  versão instalada.
- **Agent/command:** copiar ou mesclar somente no diretório declarado pelo
  adaptador, com renomeação compatível quando suportada e preview dos arquivos.
- **Hook:** instalar manifesto e payload em staging ou destino nativo, sempre
  com estado `disabled`; a ativação é uma operação separada e confirmada.
- **Reference/script/asset:** instalar junto do pai quando necessário,
  preservando caminhos relativos; nunca executar apenas por ter sido copiado.
- **Config:** usar merge específico do formato conhecido, mostrar o diff e
  criar backup recuperável antes de alterar um arquivo existente.

### Fallback autorizado

Quando não houver adaptador nativo, o plano pode oferecer o comando encontrado
na documentação do pacote. O usuário deve ver:

- comando exato e origem do arquivo/linha;
- diretório de trabalho e arquivos que já foram colocados em staging;
- destino pretendido e riscos (`writes-files`, `executes-code` etc.);
- dependências externas detectadas;
- stdout/stderr, código de saída, cancelamento e resultado.

O processo principal é o único autorizado a criar o subprocesso. Não executar
fallback durante análise, não ocultar janela/saída sem solicitação explícita,
não elevar privilégios e não passar caminhos do renderer diretamente ao shell.
Comandos que exigem shell, operadores ou elevação devem receber uma
confirmação adicional e ser marcados como alto risco; a instalação nativa
continua sendo preferida.

## Hooks and Activation Safety

- Detectar evento, matcher, comando/script, arquivos referenciados e
  dependências do hook.
- Mostrar o conteúdo do manifesto e do payload como texto, o evento afetado e
  o destino antes da instalação.
- Copiar para staging/desabilitado na primeira confirmação.
- Exigir uma segunda confirmação para modificar a configuração ativa ou
  registrar o hook.
- Mostrar o diff da configuração, manter backup e registrar quem/quando
  ativou.
- Se o schema do destino não for conhecido, manter o hook em staging e
  oferecer somente fallback/manual step; nunca inferir uma configuração ativa.
- A desativação deve ser possível pelo registro de proveniência, sem apagar a
  fonte central do pacote.

## Provenance, Updates and Conflicts

Persistir `imports.json` em `getAppDataDir()` com, no mínimo:

- identificador do import e do componente;
- URL, owner/repo, branch/tag, revisão resolvida e tree SHA;
- caminho de origem, arquivos selecionados e hashes quando disponíveis;
- target, escopo, projeto/perfil, destino físico e método de instalação;
- timestamps, estado de ativação, backup e comando fallback autorizado;
- versão do manifesto/pacote e erros da última operação.

Conflitos devem ser calculados no processo principal imediatamente antes da
instalação. O padrão é bloquear. A UI pode oferecer `skip`, `rename`,
`overwrite` com confirmação explícita ou `merge` somente para schemas que o
adaptador compreende. Sobrescrever configuração deve criar backup recuperável
e reportar falha parcial sem apagar o original.

Atualização futura deve reanalisar a mesma origem, comparar a revisão
registrada com a nova, mostrar mudanças por componente e reaplicar somente
itens escolhidos; não substituir automaticamente conteúdo que o usuário
alterou localmente.

## UI/UX Requirements

Substituir as fases atuais do diálogo por:

1. URL/branch/subpath;
2. análise e metadados do repositório;
3. inventário agrupado por tipo, com seleção por grupo/pai/filho;
4. seleção de ferramenta, escopo e destino por componente;
5. dependências, riscos, preview de arquivos/diffs e hooks;
6. conflitos e resolução;
7. instalação, progresso por componente e cancelamento;
8. resultado por item e links para origem, destino, logs e proveniência.

Requisitos adicionais:

- selecionar tudo deve incluir dependências necessárias e indicar a contagem
  real de componentes;
- cada item deve exibir tipo, origem, arquivos, destino, suporte, dependências,
  risco e método (`native`, `staged`, `authorized command` ou `manual`);
- não permitir instalar um componente sem destino válido quando o adaptador
  exigir destino;
- hooks devem ter badge de desabilitado e ação de ativação separada;
- comandos fallback devem ter preview, confirmação de risco e saída visível;
- conflitos devem mostrar origem/destino e diff quando possível;
- resultados devem suportar sucesso parcial, retry por item e atualização do
  inventário;
- manter o tema escuro/glass, acessibilidade Radix, foco, Escape e operação
  por teclado;
- suportar 320px, 768px, 1024px e 1440px sem esconder riscos ou destinos.

## IPC and API Boundaries

Adicionar uma API de importação tipada com operações equivalentes a:

```ts
githubImport.analyze(parsed): Promise<ImportAnalysis>;
githubImport.plan(selection): Promise<ImportPlan>;
githubImport.checkConflicts(planId): Promise<ImportConflict[]>;
githubImport.install(planId, resolutions): Promise<ImportResult[]>;
githubImport.activateHooks(componentIds): Promise<HookActivationResult[]>;
githubImport.cancel(): Promise<{ success: boolean }>;
githubImport.onProgress(callback): () => void;
```

`importSkills` pode permanecer como um wrapper compatível durante a migração
para não quebrar o fluxo de ZIP e testes existentes, mas a nova UI deve usar o
contrato de componentes. O renderer envia IDs e decisões, nunca caminhos
físicos ou comandos arbitrários como autorização implícita. Handlers devem
validar tipos, reconsultar a análise/plano e rejeitar planos expirados.

## Code Style

Manter decisões de filesystem, subprocesso, parsing e segurança no processo
principal; o renderer deve cuidar de estado e apresentação. Preferir funções
pequenas, discriminated unions, dependências injetáveis e resultados por item:

```ts
const analysis = await githubImportService.analyze(parsed);
const plan = importAdapterService.createPlan(analysis, selection);
const conflicts = importAdapterService.checkConflicts(plan);

if (conflicts.some((item) => item.blocking)) {
  return { status: 'needs-resolution', conflicts };
}

return importAdapterService.install(plan, resolutions, onProgress);
```

Não duplicar a lista de ferramentas no renderer, não introduzir uma classe
abstrata para cada extensão de arquivo e não transformar heurísticas de
README em execução automática.

## Testing Strategy

- **Detector:** fixtures locais que reproduzem `agent-skills`, com manifestos,
  skills, agentes, comandos, hooks, scripts, referências compartilhadas,
  binários, paths inválidos e manifests corrompidos.
- **Grafo:** verificar parent/child, dependências compartilhadas, deduplicação,
  seleção parcial e inclusão automática de referências necessárias.
- **Adapters:** diretórios temporários reais, destinos globais/projeto,
  conflitos, merge de JSON/Markdown, backup, rollback e reimportação.
- **Segurança:** traversal, absoluto, symlink, arquivo grande, conteúdo binário,
  comando malformado, shell operator, elevação, cancelamento e ausência de
  execução durante análise.
- **Proveniência:** criação, corrupção/recuperação, atualização de revisão,
  múltiplos destinos e vínculo entre registro e filesystem.
- **IPC/preload:** contratos, validação de entrada, expiração de plano,
  progresso, cancelamento e ausência de caminhos/comandos não autorizados.
- **Renderer:** inventário, filtros, seleção em cascata, destinos, diffs,
  segunda confirmação de hook, fallback, conflito, falha parcial, retry,
  teclado e estados de carregamento/erro/vazio.
- **Regressão:** manter importação ZIP, skills gerenciadas, links, plugins,
  projetos e páginas existentes.
- **Verificação final:** `npm test`, `npm run typecheck`, `npm run lint` e
  `npm run build`; executar um smoke test manual com
  `addyosmani/agent-skills` em uma revisão fixa.

## Boundaries

- **Always:** analisar sem efeitos colaterais; revalidar no processo principal;
  preservar dependências e proveniência; proteger contra traversal e symlinks;
  mostrar riscos/diffs; bloquear conflitos; instalar hooks desabilitados;
  registrar stdout/stderr de fallbacks; testar com filesystem real.
- **Ask first:** adicionar dependência; alterar o formato persistido de links,
  settings ou plugins; adicionar uma nova ferramenta ao catálogo; habilitar
  execução com shell/elevada; mudar o comportamento da importação ZIP; remover
  registros ou backups de importações anteriores.
- **Never:** executar instalador durante análise; ativar hook silenciosamente;
  executar comando enviado pelo renderer sem registro e confirmação; seguir
  paths fora da árvore/allowlist; sobrescrever configuração sem backup;
  ignorar componente descoberto sem motivo visível; apagar fonte ou projeto
  existente como efeito colateral; remover testes para fazer a suíte passar.

## Success Criteria

1. A análise de `addyosmani/agent-skills` lista o pacote/manifestos, todas as
   skills, agentes, comandos, hooks, scripts, referências e configurações
   relevantes, com relações e dependências visíveis.
2. A análise não executa comandos, não altera o filesystem e não baixa um
   arquivo fora do subpath/allowlist; itens inválidos aparecem com motivo.
3. O usuário consegue selecionar o pacote inteiro ou componentes individuais e
   escolher ferramenta, escopo e destino por componente.
4. Cada item informa se há instalação nativa, staging, fallback autorizado ou
   etapa manual; nenhum item é apresentado como instalado quando não foi.
5. Skills são instaladas preservando auxiliares; recursos compartilhados não
   são duplicados nem omitidos de uma seleção dependente.
6. Hooks são instalados desabilitados, exibem evento/payload/diff e só ficam
   ativos depois da segunda confirmação.
7. Conflitos bloqueiam por padrão, apresentam comparação e permitem apenas
   estratégias suportadas; configurações sobrescritas têm backup recuperável.
8. Fallbacks mostram comando, origem, cwd, risco e saída, exigem confirmação
   explícita e podem ser cancelados; análise nunca os executa.
9. `imports.json` permite identificar origem, revisão, destino, método, estado
   e base para atualização de cada componente.
10. Uma falha em um item não desfaz silenciosamente itens concluídos e o
    resultado permite retry/diagnóstico por item.
11. Importação ZIP e fluxos existentes continuam funcionando e os comandos de
    testes, typecheck, lint e build passam conforme o baseline documentado.

## References

- [agent-skills README](https://github.com/addyosmani/agent-skills/blob/main/README.md)
- [Claude plugin manifest](https://raw.githubusercontent.com/addyosmani/agent-skills/main/.claude-plugin/plugin.json)
- [Codex plugin manifest](https://raw.githubusercontent.com/addyosmani/agent-skills/main/.codex-plugin/plugin.json)
- [Hook manifest](https://raw.githubusercontent.com/addyosmani/agent-skills/main/hooks/hooks.json)
- [Session-start hook](https://raw.githubusercontent.com/addyosmani/agent-skills/main/hooks/session-start.sh)
- [Codex setup](https://github.com/addyosmani/agent-skills/blob/main/docs/codex-setup.md)
- [Antigravity setup](https://github.com/addyosmani/agent-skills/blob/main/docs/antigravity-setup.md)
- [Gemini CLI setup](https://github.com/addyosmani/agent-skills/blob/main/docs/gemini-cli-setup.md)
- [Copilot setup](https://github.com/addyosmani/agent-skills/blob/main/docs/copilot-setup.md)

## Open Questions

Não há pergunta de produto bloqueante. Durante o plano, cada adaptador de
ferramenta deve ser confirmado contra a documentação oficial atual, porque os
paths e schemas de plugins/hooks podem mudar. A regra de produto permanece:
inventário completo, instalação nativa quando suportada e fallback explícito
quando não houver adaptador seguro.
