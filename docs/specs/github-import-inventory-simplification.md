# Spec: Inventário simples para importação do GitHub

## Objetivo

Tornar a primeira decisão da importação do GitHub compreensível para quem quer
instalar uma skill, sem perder a auditoria técnica necessária para hooks,
configs, scripts e arquivos auxiliares.

O importador deve apresentar escolhas lógicas, não cada arquivo detectado como
uma instalação independente. Um repositório como `pbakaus/impeccable` deve
mostrar a skill lógica uma vez, informar suas variantes de provider e separar
comandos, hooks e arquivos de suporte em grupos explicados.

## Escopo

- Agrupar a visualização por tipo de componente.
- Exibir `skill`, `command`, `agent` e `hook` como escolhas de primeiro nível.
- Tratar `reference`, `script`, `config` e `asset` como arquivos de suporte,
  visíveis sob uma seção técnica e incluídos por dependência quando necessário.
- Tratar `bundle` como rota alternativa de pacote, sem seleção automática junto
  dos componentes filhos.
- Selecionar somente skills por padrão; hooks nunca são ativados implicitamente.
- Adicionar seleção global e por grupo, com operação de teclado e rótulos
  explicando o efeito de cada tipo.
- Manter preview de arquivos, destino, política de conflito, fallback e
  confirmação separada de hooks.

## Fora de escopo

- Alterar o contrato do detector ou a instalação nativa.
- Remover componentes do inventário do processo principal.
- Executar comandos, hooks ou scripts durante análise.
- Mudar destinos, políticas de conflito ou o formato de proveniência.

## Critérios de sucesso

- [x] O inventário não apresenta arquivos auxiliares como 1 decisão de primeiro
      nível por arquivo.
- [x] Para uma skill com variantes provider-specific, a UI exibe uma única
      skill lógica e a quantidade/origem das variantes.
- [x] Após a análise, somente skills estão selecionadas por padrão; bundles,
      hooks e arquivos técnicos estão desmarcados.
- [x] `Select all` marca todas as escolhas primárias sem marcar automaticamente
      arquivos de suporte nem uma rota de bundle concorrente.
- [x] `Clear all` remove todas as seleções, inclusive as técnicas.
- [x] Cada grupo informa em linguagem simples o que será instalado e o que
      continuará desabilitado ou será incluído automaticamente.
- [x] A seleção de um bundle não instala silenciosamente o mesmo conteúdo pelos
      componentes filhos; rotas concorrentes são tornadas explícitas.
- [x] Testes unitários e de UI cobrem agrupamento, defaults, seleção global,
      seleção por grupo, hooks desmarcados e preservação do preview/destino.

## Stack e comandos

- React 18.3.1, TypeScript 5.6.3, Radix Dialog 1.1.2 e Tailwind CSS 3.4.
- Testes: `npx vitest run src/renderer/src/components/ui/github-import-inventory.utils.test.ts src/renderer/src/components/ui/GitHubImportInventory.test.tsx src/renderer/src/components/ui/GitHubImportDialog.components.test.tsx`
- Typecheck: `npm run typecheck`
- Build: `npm run build`

## Limites

- Sempre: manter a análise completa no main, preservar dependências e manter
  hooks desabilitados até confirmação separada.
- Perguntar antes: alterar tipos IPC, detector, adapters, destinos ou
  proveniência.
- Nunca: esconder risco, executar fallback automaticamente ou apagar arquivos
  técnicos apenas para simplificar a tela.
