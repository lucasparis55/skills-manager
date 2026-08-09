import fs from 'fs';
import path from 'path';
import { ImportPathService } from './import-path.service';
import type {
  ImportComponent,
  ImportComponentKind,
  ImportComponentSelection,
  ImportConflict,
  ImportPlan,
  ImportPlanItem,
  ImportTarget,
} from '../types/import';

const TARGET_PROVIDER_IDS: Record<string, string[]> = {
  'claude-code': ['claude', 'plugin'],
  'codex-cli': ['agents', 'codex'],
  'codex-desktop': ['agents', 'codex'],
  'github-copilot': ['github'],
  grok: ['grok', 'plugin'],
  opencode: ['opencode', 'claude', 'agents'],
  'kimi-cli': ['kimi', 'agents'],
  cursor: ['cursor'],
};

export interface ImportPlanInput {
  sourceUrl: string;
  sourceRef: string;
  commitSha?: string;
  treeSha?: string;
  components: ImportComponent[];
  targets: ImportTarget[];
  selections: ImportComponentSelection[];
}

export interface ImportPlanServiceOptions {
  now?: () => Date;
  destinationExists?: (destinationPath: string) => boolean;
}

/** Converts a user's inventory choices into a validated, non-mutating import plan. */
export class ImportPlanService {
  private readonly now: () => Date;
  private readonly destinationExists: (destinationPath: string) => boolean;
  private readonly pathService = new ImportPathService();

  constructor(options: ImportPlanServiceOptions = {}) {
    this.now = options.now || (() => new Date());
    this.destinationExists = options.destinationExists || ((destinationPath) => fs.existsSync(destinationPath));
  }

  create(input: ImportPlanInput): ImportPlan {
    const components = new Map(input.components.map((component) => [component.id, component]));
    const targets = new Map(input.targets.map((target) => [target.id, target]));
    const blockers: string[] = [];
    const warnings: string[] = [];
    const selected = this.expandDependencies(
      input.selections.filter((selection) => selection.selected),
      components,
      targets,
      warnings,
      blockers,
    );
    const selectedKeys = new Set(selected.map((selection) => `${selection.componentId}@${selection.targetId}`));
    const items: ImportPlanItem[] = [];

    for (const selection of selected) {
      const sourceComponent = components.get(selection.componentId);
      const target = targets.get(selection.targetId);
      if (!sourceComponent) {
        blockers.push(`Component "${selection.componentId}" was not found in the analyzed inventory.`);
        continue;
      }
      if (!target) {
        blockers.push(`Target "${selection.targetId}" was not found in the analyzed inventory.`);
        continue;
      }

      const component = this.resolveComponentVariant(sourceComponent, target);

      const itemWarnings: string[] = [];
      let status: ImportPlanItem['status'] = 'ready';
      const destinationPath = this.resolveDestination(component, target, selection);

      if (component.metadata.invalidManifest === true) {
        status = 'blocked';
        itemWarnings.push('The component manifest could not be parsed or fetched safely.');
      } else if (!target.available) {
        status = 'blocked';
        itemWarnings.push(target.reason || 'The selected target is not available.');
      } else if (!target.supportedKinds.includes(component.kind)) {
        if (component.fallback && selection.fallbackAuthorized) {
          itemWarnings.push('This item will use the explicitly authorized fallback command.');
        } else {
          status = 'needs-approval';
          itemWarnings.push('A native adapter is unavailable; explicit fallback authorization is required.');
        }
      }

      const conflict = this.buildConflict(component, target, destinationPath, selection);
      if (conflict && (conflict.strategy === 'block' || conflict.strategy === 'rename' || conflict.strategy === 'merge')) {
        status = 'conflict';
        itemWarnings.push(conflict.strategy === 'rename'
          ? 'The requested renamed destination also exists; choose another name.'
          : 'Existing content is protected by the default conflict policy.');
      }

      if (component.requiresActivation && selection.activate) {
        status = status === 'blocked' || status === 'conflict' ? status : 'needs-approval';
        itemWarnings.push('Hook activation always requires a second confirmation.');
      }

      if (component.kind === 'manual-step' && !selection.fallbackAuthorized) {
        status = 'needs-approval';
        itemWarnings.push('This executable step is never authorized implicitly.');
      }

      for (const dependencyId of component.dependencies) {
        const dependencySelected = [...selectedKeys].some((key) => key.startsWith(`${dependencyId}@`));
        if (!dependencySelected) {
          const message = `Missing dependency "${dependencyId}" for "${component.id}".`;
          blockers.push(message);
          status = 'blocked';
          itemWarnings.push(message);
        }
      }

      warnings.push(...itemWarnings);
      items.push({
        component,
        target,
        selection,
        status,
        destinationPath,
        conflict,
        warnings: itemWarnings,
      });
    }

    const createdAt = this.now();
    return {
      id: `import-${createdAt.getTime()}`,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + 15 * 60 * 1000).toISOString(),
      sourceUrl: input.sourceUrl,
      sourceRef: input.sourceRef,
      commitSha: input.commitSha,
      treeSha: input.treeSha,
      items,
      warnings: [...new Set(warnings)],
      blockers: [...new Set(blockers)],
    };
  }

  private resolveDestination(
    component: ImportComponent,
    target: ImportTarget,
    selection: ImportComponentSelection,
  ): string {
    const destinationRootKind = this.getDestinationRootKind(component);
    const root = target.componentRoots[destinationRootKind] || target.rootPath;
    if (component.kind === 'hook') {
      return this.pathService.assertSafeDestination(root, target.rootPath);
    }
    const name = selection.renameTo || (component.kind === 'skill' ? component.name : path.basename(component.sourcePath || component.name));
    const safeName = ImportPathService.normalizeRepositoryPath(name).split('/').pop()!;
    return this.pathService.assertSafeDestination(path.join(root, safeName), root);
  }

  private resolveComponentVariant(component: ImportComponent, target: ImportTarget): ImportComponent {
    if (!component.variants || component.variants.length === 0) return component;

    const providerIds = TARGET_PROVIDER_IDS[target.adapterId] || [];
    const variant = component.variants.find((candidate) =>
      candidate.providerId && providerIds.includes(candidate.providerId),
    ) || component.variants.find((candidate) => candidate.nativeTargets.includes(target.adapterId))
      || component.variants.find((candidate) => candidate.sourcePath === component.sourcePath)
      || component.variants[0];

    return {
      ...component,
      sourcePath: variant.sourcePath,
      files: variant.files,
      nativeTargets: variant.nativeTargets,
      metadata: {
        ...component.metadata,
        selectedVariantSourcePath: variant.sourcePath,
      },
    };
  }

  private getDestinationRootKind(component: ImportComponent): ImportComponentKind {
    const configured = component.metadata.destinationRootKind;
    const supportedKinds: ImportComponentKind[] = [
      'bundle', 'skill', 'hook', 'agent', 'command', 'reference', 'script', 'config', 'asset', 'manual-step',
    ];
    return typeof configured === 'string' && supportedKinds.includes(configured as ImportComponentKind)
      ? configured as ImportComponentKind
      : component.kind;
  }

  private expandDependencies(
    initial: ImportComponentSelection[],
    components: Map<string, ImportComponent>,
    targets: Map<string, ImportTarget>,
    warnings: string[],
    blockers: string[],
  ): ImportComponentSelection[] {
    const expanded = initial.map((selection) => ({ ...selection }));
    const selectedIds = new Set(expanded.map((selection) => selection.componentId));
    for (let index = 0; index < expanded.length; index += 1) {
      const selection = expanded[index];
      const component = components.get(selection.componentId);
      if (!component) continue;
      for (const dependencyId of component.dependencies) {
        if (selectedIds.has(dependencyId)) continue;
        const dependency = components.get(dependencyId);
        if (!dependency) continue;
        const requestedTarget = targets.get(selection.targetId);
        const dependencyTarget = requestedTarget?.supportedKinds.includes(dependency.kind)
          ? requestedTarget
          : [...targets.values()].find((target) => target.available && target.supportedKinds.includes(dependency.kind));
        if (!dependencyTarget) {
          blockers.push(`No destination supports dependency "${dependencyId}".`);
          continue;
        }
        expanded.push({
          componentId: dependency.id,
          targetId: dependencyTarget.id,
          selected: true,
          conflictStrategy: 'block',
          activate: false,
          fallbackAuthorized: false,
        });
        selectedIds.add(dependencyId);
        warnings.push(`Dependency "${dependency.displayName}" was included automatically for "${component.displayName}".`);
      }
    }
    return expanded;
  }

  private buildConflict(
    component: ImportComponent,
    target: ImportTarget,
    destinationPath: string,
    selection: ImportComponentSelection,
  ): ImportConflict | undefined {
    const existingPath = component.kind === 'hook'
      ? component.files
        .map((file) => path.join(destinationPath, path.basename(file.path)))
        .find((filePath) => this.destinationExists(filePath))
      : this.destinationExists(destinationPath) ? destinationPath : undefined;
    if (!existingPath) return undefined;
    const strategy = selection.conflictStrategy || 'block';
    return {
      componentId: component.id,
      targetId: target.id,
      sourcePath: component.sourcePath,
      destinationPath: existingPath,
      sourceDescription: component.description,
      destinationDescription: 'A file or directory already exists at this destination.',
      strategy,
      canMerge: component.kind === 'config' || component.kind === 'hook',
    };
  }
}
