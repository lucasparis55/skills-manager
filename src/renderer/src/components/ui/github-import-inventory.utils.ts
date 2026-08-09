import type { ImportComponent, ImportComponentKind } from '../../../../main/types/import';

export type ImportInventoryGroupId =
  | 'skills'
  | 'commands'
  | 'agents'
  | 'hooks'
  | 'bundles'
  | 'manual'
  | 'technical';

export interface ImportInventoryGroup {
  id: ImportInventoryGroupId;
  label: string;
  description: string;
  components: ImportComponent[];
}

export interface ImportInventorySummary {
  choices: number;
  supportFiles: number;
  bundleRoutes: number;
  manualSteps: number;
}

const GROUP_ORDER: ImportInventoryGroupId[] = [
  'skills',
  'commands',
  'agents',
  'hooks',
  'bundles',
  'manual',
  'technical',
];

const GROUP_DETAILS: Record<ImportInventoryGroupId, Omit<ImportInventoryGroup, 'components'>> = {
  skills: {
    id: 'skills',
    label: 'Skills',
    description: 'Reusable instructions an AI tool loads when a task matches.',
  },
  commands: {
    id: 'commands',
    label: 'Commands',
    description: 'Explicit shortcuts users invoke, such as /impeccable audit.',
  },
  agents: {
    id: 'agents',
    label: 'Agents',
    description: 'Specialized personas or tasks used by an AI tool.',
  },
  hooks: {
    id: 'hooks',
    label: 'Hooks',
    description: 'Automatic actions triggered by events. Installed disabled and reviewed separately.',
  },
  bundles: {
    id: 'bundles',
    label: 'Package alternatives',
    description: 'A single package route that can overlap with the choices above.',
  },
  manual: {
    id: 'manual',
    label: 'Manual steps',
    description: 'Installer or setup instructions that require explicit authorization.',
  },
  technical: {
    id: 'technical',
    label: 'Technical files',
    description: 'References, scripts, configs and assets included automatically when required.',
  },
};

const TECHNICAL_KINDS = new Set<ImportComponentKind>(['reference', 'script', 'config', 'asset']);

export const isTechnicalComponent = (component: ImportComponent): boolean => TECHNICAL_KINDS.has(component.kind);

export const getInventoryGroupId = (component: ImportComponent): ImportInventoryGroupId => {
  if (component.kind === 'skill') return 'skills';
  if (component.kind === 'command') return 'commands';
  if (component.kind === 'agent') return 'agents';
  if (component.kind === 'hook') return 'hooks';
  if (component.kind === 'bundle') return 'bundles';
  if (component.kind === 'manual-step') return 'manual';
  return 'technical';
};

export const getInventoryGroups = (components: ImportComponent[]): ImportInventoryGroup[] => {
  const groups = new Map<ImportInventoryGroupId, ImportComponent[]>();
  for (const component of components) {
    const groupId = getInventoryGroupId(component);
    groups.set(groupId, [...(groups.get(groupId) || []), component]);
  }

  return GROUP_ORDER
    .filter((groupId) => groups.has(groupId))
    .map((groupId) => ({
      ...GROUP_DETAILS[groupId],
      components: groups.get(groupId) || [],
    }));
};

export const getDefaultSelection = (component: ImportComponent): boolean => component.kind === 'skill';

export const getBulkSelectableComponents = (components: ImportComponent[]): ImportComponent[] => {
  const choices = components.filter((component) =>
    !isTechnicalComponent(component)
      && component.kind !== 'bundle',
  );

  return choices.length > 0 ? choices : components.filter((component) => component.kind === 'bundle');
};

export const getInventorySummary = (components: ImportComponent[]): ImportInventorySummary => ({
  choices: components.filter((component) =>
    component.kind === 'skill'
      || component.kind === 'command'
      || component.kind === 'agent'
      || component.kind === 'hook',
  ).length,
  supportFiles: components.filter(isTechnicalComponent).length,
  bundleRoutes: components.filter((component) => component.kind === 'bundle').length,
  manualSteps: components.filter((component) => component.kind === 'manual-step').length,
});

export const getInventoryKindLabel = (kind: ImportComponentKind): string => {
  if (kind === 'skill') return 'Skill';
  if (kind === 'hook') return 'Hook';
  if (kind === 'command') return 'Command';
  if (kind === 'agent') return 'Agent';
  if (kind === 'bundle') return 'Package alternative';
  if (kind === 'manual-step') return 'Manual step';
  return 'Support file';
};
