import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { GitHubImportService } from './github-import.service';
import { ImportProvenanceService } from './import-provenance.service';
import { ImportStagingService } from './import-staging.service';
import type { AnalyzeResult, GitHubRepoInfo, ParsedGitHubRepo } from '../types/github';
import type { ImportComponent, ImportTarget } from '../types/import';

describe('GitHubImportService component import API', () => {
  it('creates a plan from the main-process inventory and preserves per-component targets', async () => {
    const service = new GitHubImportService({ get: () => ({ centralSkillsRoot: 'C:/skills' }) } as any);
    const parsed: ParsedGitHubRepo = { owner: 'acme', repo: 'repo', branch: 'main' };
    const repoInfo: GitHubRepoInfo = {
      name: 'repo',
      fullName: 'acme/repo',
      description: 'repo',
      defaultBranch: 'main',
      isPrivate: false,
      htmlUrl: 'https://github.com/acme/repo',
      starsCount: 0,
    };
    const component: ImportComponent = {
      id: 'skill:review',
      kind: 'skill',
      name: 'review',
      displayName: 'Review',
      description: 'skill',
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
    const target: ImportTarget = {
      id: 'central',
      label: 'Central',
      adapterId: 'central',
      scope: 'central',
      rootPath: 'C:/skills',
      componentRoots: { skill: 'C:/skills' },
      supportedKinds: ['skill'],
      native: true,
      available: true,
    };
    const analysis: AnalyzeResult = {
      repoInfo,
      skills: [],
      components: [component],
      targets: [target],
      revision: { ref: 'main', commitSha: 'commit', treeSha: 'tree', resolvedAt: 'now' },
      warnings: [],
    };

    vi.spyOn(service, 'analyze').mockResolvedValue(analysis);
    vi.spyOn(service, 'getImportTargets').mockReturnValue([target]);

    const plan = await service.createImportPlan(parsed, [{
      componentId: component.id,
      targetId: target.id,
      selected: true,
    }]);

    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].component.id).toBe(component.id);
    expect(plan.items[0].target.id).toBe('central');
    expect(plan.commitSha).toBe('commit');
  });

  it('stages, installs and records provenance for a native component', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'github-components-'));
    const provenance = new ImportProvenanceService(path.join(root, 'data'));
    const adapter = {
      install: vi.fn(async () => ({ destinationPath: path.join(root, 'skills', 'review') })),
      listTargets: vi.fn(() => []),
    };
    const service = new GitHubImportService({ get: () => ({ centralSkillsRoot: path.join(root, 'skills') }) } as any, {
      adapterService: adapter as any,
      provenanceService: provenance,
      stagingService: new ImportStagingService({ tempRoot: root }),
    });
    const parsed: ParsedGitHubRepo = { owner: 'acme', repo: 'repo', branch: 'main' };
    const component: ImportComponent = {
      id: 'skill:review',
      kind: 'skill',
      name: 'review',
      displayName: 'Review',
      description: 'skill',
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
    const target: ImportTarget = {
      id: 'central',
      label: 'Central',
      adapterId: 'central',
      scope: 'central',
      rootPath: path.join(root, 'skills'),
      componentRoots: { skill: path.join(root, 'skills') },
      supportedKinds: ['skill'],
      native: true,
      available: true,
    };
    vi.spyOn(service, 'analyze').mockResolvedValue({
      repoInfo: {
        name: 'repo', fullName: 'acme/repo', description: 'repo', defaultBranch: 'main', isPrivate: false,
        htmlUrl: 'https://github.com/acme/repo', starsCount: 0,
      },
      skills: [],
      components: [component],
      targets: [target],
      revision: { ref: 'main', commitSha: 'commit', treeSha: 'tree', resolvedAt: 'now' },
      warnings: [],
    });
    vi.spyOn(service, 'getImportTargets').mockReturnValue([target]);
    vi.spyOn(service, 'fetchFileBuffer').mockResolvedValue(Buffer.from('# review'));

    try {
      const plan = await service.createImportPlan(parsed, [{ componentId: component.id, targetId: target.id, selected: true }]);
      const results = await service.importComponents(plan.id);

      expect(results[0].status).toBe('installed');
      expect(adapter.install).toHaveBeenCalledTimes(1);
      expect(provenance.list()[0].source.commitSha).toBe('commit');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not execute an authorized fallback after the plan expires', async () => {
    const commandService = { run: vi.fn(async () => ({ exitCode: 0, signal: null, stdout: 'ok', stderr: '' })) };
    const service = new GitHubImportService({ get: () => ({ centralSkillsRoot: 'C:/skills' }) } as any, {
      commandService: commandService as any,
    });
    const parsed: ParsedGitHubRepo = { owner: 'acme', repo: 'repo', branch: 'main' };
    const component: ImportComponent = {
      id: 'manual:install.ps1',
      kind: 'manual-step',
      name: 'install.ps1',
      displayName: 'Review installer',
      description: 'installer',
      sourcePath: 'install.ps1',
      files: [{ path: 'install.ps1', sha: 'installer', type: 'blob' }],
      dependencies: [],
      risk: 'high',
      hasExecutableFiles: true,
      requiresActivation: true,
      events: [],
      nativeTargets: [],
      fallback: {
        executable: 'npx',
        args: ['skills', 'add', 'acme/repo'],
        reason: 'manual review',
        requiresExplicitAuthorization: true,
      },
      metadata: {},
    };
    const target: ImportTarget = {
      id: 'central',
      label: 'Central',
      adapterId: 'central',
      scope: 'central',
      rootPath: 'C:/skills',
      componentRoots: { 'manual-step': 'C:/skills' },
      supportedKinds: [],
      native: false,
      available: true,
    };
    vi.spyOn(service, 'analyze').mockResolvedValue({
      repoInfo: {
        name: 'repo', fullName: 'acme/repo', description: 'repo', defaultBranch: 'main', isPrivate: false,
        htmlUrl: 'https://github.com/acme/repo', starsCount: 0,
      },
      skills: [],
      components: [component],
      targets: [target],
      revision: { ref: 'main', commitSha: 'commit', treeSha: 'tree', resolvedAt: 'now' },
      warnings: [],
    });
    vi.spyOn(service, 'getImportTargets').mockReturnValue([target]);

    const plan = await service.createImportPlan(parsed, [{
      componentId: component.id,
      targetId: target.id,
      selected: true,
      fallbackAuthorized: true,
    }]);
    plan.expiresAt = new Date(Date.now() - 1_000).toISOString();

    await expect(service.runFallback({ planId: plan.id, componentId: component.id, targetId: target.id }))
      .rejects.toThrow('expired');
    expect(commandService.run).not.toHaveBeenCalled();
  });
});
