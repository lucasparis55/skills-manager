import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { ImportAdapterService } from './import-adapter.service';
import type { IDEDefinition, Project } from '../types/domain';
import type { ImportComponent, ImportPlanItem, ImportTarget } from '../types/import';
import type { StagedImport } from './import-staging.service';

describe('ImportAdapterService', () => {
  let root: string;

  afterEach(() => {
    if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('lists central, global and project targets from the existing IDE definitions', () => {
    const ide: IDEDefinition = {
      id: 'claude-code',
      name: 'Claude Code',
      configFormat: 'json',
      mode: 'subagents',
      roots: {
        primaryGlobal: ['C:/Users/test/.claude'],
        secondaryGlobal: [],
        projectRelative: ['.claude/agents'],
      },
      skillRootTemplates: ['C:/Users/test/.claude/skills'],
    };
    const project: Project = {
      id: 'project-1',
      name: 'Project',
      path: 'C:/repo/project',
      detectedIDEs: ['claude-code'],
      addedAt: 'now',
      lastScanned: 'now',
      metadata: {},
    };
    const service = new ImportAdapterService({
      ideService: { list: () => [ide] } as any,
      centralSkillsRoot: 'C:/skills',
      expandPath: (value) => value,
    });

    const targets = service.listTargets([project]);
    expect(targets.map((target) => target.id)).toEqual(expect.arrayContaining([
      'central',
      'claude-code:global',
      'claude-code:project:project-1',
    ]));
    expect(targets.find((target) => target.id === 'claude-code:global')?.componentRoots.hook).toContain('.claude');
    expect(targets.find((target) => target.id === 'claude-code:project:project-1')?.scope).toBe('project');
  });

  it('installs a staged component into the selected native destination', async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'import-adapter-'));
    const stagedRoot = path.join(root, 'staged');
    const destinationRoot = path.join(root, 'target');
    fs.mkdirSync(stagedRoot, { recursive: true });
    fs.writeFileSync(path.join(stagedRoot, 'config.json'), '{"enabled":true}');

    const component: ImportComponent = {
      id: 'config:config.json',
      kind: 'config',
      name: 'config.json',
      displayName: 'Configuration',
      description: 'config',
      sourcePath: 'config.json',
      files: [{ path: 'config.json', sha: 'config', type: 'blob' }],
      dependencies: [],
      risk: 'medium',
      hasExecutableFiles: false,
      requiresActivation: false,
      events: [],
      nativeTargets: ['claude-code'],
      metadata: {},
    };
    const target: ImportTarget = {
      id: 'claude-code:global',
      label: 'Claude Code',
      adapterId: 'claude-code',
      scope: 'global',
      rootPath: destinationRoot,
      componentRoots: { config: destinationRoot },
      supportedKinds: ['config'],
      native: true,
      available: true,
    };
    const item = {
      component,
      target,
      selection: { componentId: component.id, targetId: target.id, selected: true },
      status: 'ready' as const,
      destinationPath: path.join(destinationRoot, 'config.json'),
      warnings: [],
    } as ImportPlanItem;
    const staged: StagedImport = {
      rootPath: stagedRoot,
      componentId: component.id,
      files: [{ path: 'config.json', sha: 'config', size: 16 }],
      totalBytes: 16,
    };

    const result = await new ImportAdapterService().install({ item, staged });

    expect(result.destinationPath).toBe(item.destinationPath);
    expect(fs.readFileSync(item.destinationPath, 'utf8')).toBe('{"enabled":true}');
  });
});
