import path from 'path';
import { describe, expect, it } from 'vitest';
import { ImportPlanService } from './import-plan.service';
import type { ImportComponent, ImportTarget } from '../types/import';

const skill: ImportComponent = {
  id: 'skill:skills/review',
  kind: 'skill',
  name: 'review',
  displayName: 'Review',
  description: 'Review skill',
  sourcePath: 'skills/review',
  files: [{ path: 'skills/review/SKILL.md', sha: 'skill', type: 'blob' }],
  dependencies: [],
  risk: 'low',
  hasExecutableFiles: false,
  requiresActivation: false,
  events: [],
  nativeTargets: ['claude-code'],
  metadata: {},
};

const script: ImportComponent = {
  id: 'script:hooks/session-start.sh',
  kind: 'script',
  name: 'session-start.sh',
  displayName: 'Hook script',
  description: 'Hook script',
  sourcePath: 'hooks/session-start.sh',
  files: [{ path: 'hooks/session-start.sh', sha: 'script', type: 'blob' }],
  dependencies: [],
  risk: 'high',
  hasExecutableFiles: true,
  requiresActivation: false,
  events: [],
  nativeTargets: ['claude-code'],
  metadata: {},
};

const hook: ImportComponent = {
  id: 'hook:hooks/hooks.json',
  kind: 'hook',
  name: 'repository-hooks',
  displayName: 'Repository hooks',
  description: 'Hook configuration',
  sourcePath: 'hooks',
  files: [{ path: 'hooks/hooks.json', sha: 'hooks', type: 'blob' }],
  dependencies: [script.id],
  risk: 'high',
  hasExecutableFiles: true,
  requiresActivation: true,
  events: ['SessionStart'],
  nativeTargets: ['claude-code'],
  metadata: {},
};

const target: ImportTarget = {
  id: 'claude-code:global',
  label: 'Claude Code (global)',
  adapterId: 'claude-code',
  scope: 'global',
  ideId: 'claude-code',
  rootPath: path.join('C:', 'Users', 'test', '.claude'),
  componentRoots: {
    skill: path.join('C:', 'Users', 'test', '.claude', 'skills'),
    hook: path.join('C:', 'Users', 'test', '.claude', 'hooks'),
    script: path.join('C:', 'Users', 'test', '.claude', 'hooks'),
  },
  supportedKinds: ['skill', 'hook', 'script'],
  native: true,
  available: true,
  hookConfigPath: path.join('C:', 'Users', 'test', '.claude', 'settings.json'),
};

const variantSkill: ImportComponent = {
  ...skill,
  id: 'skill:impeccable',
  name: 'impeccable',
  displayName: 'Impeccable',
  sourcePath: '.agents/skills/impeccable',
  files: [{ path: '.agents/skills/impeccable/SKILL.md', sha: 'agents-skill', type: 'blob' }],
  variants: [
    {
      sourcePath: '.agents/skills/impeccable',
      displayName: 'Agents',
      providerId: 'agents',
      nativeTargets: ['codex-cli', 'codex-desktop'],
      files: [{ path: '.agents/skills/impeccable/SKILL.md', sha: 'agents-skill', type: 'blob' }],
    },
    {
      sourcePath: '.claude/skills/impeccable',
      displayName: 'Claude',
      providerId: 'claude',
      nativeTargets: ['claude-code'],
      files: [{ path: '.claude/skills/impeccable/SKILL.md', sha: 'claude-skill', type: 'blob' }],
    },
  ],
};

describe('ImportPlanService', () => {
  it('includes a hook dependency automatically and still requires approval for activation', () => {
    const plan = new ImportPlanService({ now: () => new Date('2026-08-07T00:00:00.000Z') }).create({
      sourceUrl: 'https://github.com/acme/repo',
      sourceRef: 'main',
      commitSha: 'commit',
      treeSha: 'tree',
      components: [hook, script],
      targets: [target],
      selections: [{ componentId: hook.id, targetId: target.id, selected: true, activate: true }],
    });

    expect(plan.blockers).toEqual([]);
    expect(plan.items.map((item) => item.component.id)).toEqual([
      hook.id,
      script.id,
    ]);
    expect(plan.items[0].status).toBe('needs-approval');
    expect(plan.items[0].destinationPath).toBe(path.join('C:', 'Users', 'test', '.claude', 'hooks'));
    expect(plan.items[0].warnings).toContain('Hook activation always requires a second confirmation.');
  });

  it('blocks existing destinations by default and allows an explicit rename', () => {
    const service = new ImportPlanService({
      now: () => new Date('2026-08-07T00:00:00.000Z'),
      destinationExists: (destination) => destination.endsWith(path.join('skills', 'review')),
    });

    const blocked = service.create({
      sourceUrl: 'https://github.com/acme/repo',
      sourceRef: 'main',
      components: [skill],
      targets: [target],
      selections: [{ componentId: skill.id, targetId: target.id, selected: true }],
    });
    expect(blocked.items[0].status).toBe('conflict');
    expect(blocked.items[0].conflict?.strategy).toBe('block');

    const renamed = service.create({
      sourceUrl: 'https://github.com/acme/repo',
      sourceRef: 'main',
      components: [skill],
      targets: [target],
      selections: [{ componentId: skill.id, targetId: target.id, selected: true, conflictStrategy: 'rename', renameTo: 'review-v2' }],
    });
    expect(renamed.items[0].status).toBe('ready');
    expect(renamed.items[0].destinationPath).toContain(path.join('skills', 'review-v2'));
  });

  it('resolves the provider variant that matches the selected target', () => {
    const plan = new ImportPlanService({ now: () => new Date('2026-08-07T00:00:00.000Z') }).create({
      sourceUrl: 'https://github.com/pbakaus/impeccable',
      sourceRef: 'main',
      components: [variantSkill],
      targets: [target],
      selections: [{ componentId: variantSkill.id, targetId: target.id, selected: true }],
    });

    expect(plan.items[0].component.sourcePath).toBe('.claude/skills/impeccable');
    expect(plan.items[0].component.files[0].path).toBe('.claude/skills/impeccable/SKILL.md');
  });

  it('uses the canonical variant when the selected target has no provider-specific copy', () => {
    const centralTarget: ImportTarget = {
      ...target,
      id: 'central',
      adapterId: 'central',
      scope: 'central',
      componentRoots: { skill: path.join('C:', 'skills') },
      rootPath: path.join('C:', 'skills'),
      supportedKinds: ['skill'],
    };
    const plan = new ImportPlanService({ now: () => new Date('2026-08-07T00:00:00.000Z') }).create({
      sourceUrl: 'https://github.com/pbakaus/impeccable',
      sourceRef: 'main',
      components: [variantSkill],
      targets: [centralTarget],
      selections: [{ componentId: variantSkill.id, targetId: centralTarget.id, selected: true }],
    });

    expect(plan.items[0].component.sourcePath).toBe('.agents/skills/impeccable');
  });
});
