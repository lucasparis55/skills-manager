import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IDEDefinition, Project, Skill } from '../types/domain';
import { SkillService } from './skill.service';
import { LinkService } from './link.service';
import { LinkMigrationService } from './link-migration.service';
import { SymlinkService } from './symlink.service';
import { SkillHealthService } from './skill-health.service';

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-manager-health-'));
  temporaryDirectories.push(directory);
  return directory;
}

function createIde(root: string, id: string, name: string): IDEDefinition {
  return {
    id,
    name,
    configFormat: 'markdown',
    mode: 'rules',
    roots: {
      primaryGlobal: [path.join(root, id)],
      secondaryGlobal: [],
      projectRelative: [`.${id}/rules`],
    },
    skillRootTemplates: [path.join(root, id, 'skills')],
  };
}

function createProject(root: string, id = 'demo'): Project {
  fs.mkdirSync(root, { recursive: true });
  return {
    id,
    name: 'Demo project',
    path: root,
    detectedIDEs: [],
    addedAt: new Date().toISOString(),
    lastScanned: new Date().toISOString(),
    metadata: {},
  };
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('SkillHealthService', () => {
  it('reports healthy, repairable, conflicting, and unavailable destinations', async () => {
    const root = createTemporaryDirectory();
    const skillsRoot = path.join(root, 'central');
    const sourcePath = path.join(skillsRoot, 'review');
    const projectRoot = path.join(root, 'project');
    const ideRoot = path.join(root, 'ides');
    const skillService = new SkillService(skillsRoot);
    const skill = skillService.create({
      name: 'review',
      displayName: 'Review',
      description: 'Review changes',
      format: 'folder',
      targetIDEs: [],
      tags: [],
    });
    const linkService = new LinkService(path.join(root, 'data'));
    const symlinkService = new SymlinkService();
    const cursor = createIde(ideRoot, 'cursor', 'Cursor');
    const claude = createIde(ideRoot, 'claude', 'Claude');
    const project = createProject(projectRoot);
    const healthyPath = path.join(ideRoot, 'cursor', 'skills', 'review');
    const missingPath = path.join(projectRoot, '.cursor', 'rules', 'review');
    const conflictPath = path.join(ideRoot, 'claude', 'skills', 'review');

    expect(symlinkService.create(sourcePath, healthyPath, 'auto').success).toBe(true);
    fs.mkdirSync(conflictPath, { recursive: true });
    fs.writeFileSync(path.join(conflictPath, 'keep.txt'), 'keep', 'utf8');

    linkService.create(
      { skillId: skill.id, projectId: null, ideName: 'cursor', scope: 'global' },
      sourcePath,
      healthyPath,
    );
    const missingLink = linkService.create(
      { skillId: skill.id, projectId: project.id, ideName: 'cursor', scope: 'project' },
      sourcePath,
      missingPath,
    );
    const conflictLink = linkService.create(
      { skillId: skill.id, projectId: null, ideName: 'claude', scope: 'global' },
      sourcePath,
      conflictPath,
    );
    const unavailableLink = linkService.create(
      { skillId: skill.id, projectId: 'removed-project', ideName: 'cursor', scope: 'project' },
      sourcePath,
      path.join(root, 'removed', 'review'),
    );

    const service = new SkillHealthService({
      settingsService: { get: () => ({ ideRootOverrides: {}, symlinkStrategy: 'auto' }) },
      skillService,
      linkService,
      symlinkService,
      ideService: { list: () => [cursor, claude] },
      projectService: { list: () => [project] },
    });

    const report = await service.checkDistribution(skill.id);

    expect(report.sourcePath).toBe(sourcePath);
    expect(report.summary).toEqual({
      total: 4,
      healthy: 1,
      attention: 3,
      blocked: 2,
      repairable: 1,
    });
    expect(report.destinations).toEqual(expect.arrayContaining([
      expect.objectContaining({ linkId: expect.any(String), status: 'healthy', repairable: false }),
      expect.objectContaining({ linkId: missingLink.id, status: 'broken', repairable: true }),
      expect.objectContaining({ linkId: conflictLink.id, status: 'conflict', repairable: false }),
      expect.objectContaining({ linkId: unavailableLink.id, status: 'unavailable', repairable: false }),
    ]));
  });

  it('repairs a free destination and leaves conflicts untouched', async () => {
    const root = createTemporaryDirectory();
    const skillsRoot = path.join(root, 'central');
    const sourcePath = path.join(skillsRoot, 'review');
    const ideRoot = path.join(root, 'ides');
    const skillService = new SkillService(skillsRoot);
    const skill = skillService.create({
      name: 'review',
      displayName: 'Review',
      description: 'Review changes',
      format: 'folder',
      targetIDEs: [],
      tags: [],
    });
    const linkService = new LinkService(path.join(root, 'data'));
    const symlinkService = new SymlinkService();
    const cursor = createIde(ideRoot, 'cursor', 'Cursor');
    const missingPath = path.join(ideRoot, 'cursor', 'skills', 'review');
    const conflictPath = path.join(ideRoot, 'cursor', 'skills', 'other');
    fs.mkdirSync(conflictPath, { recursive: true });
    fs.writeFileSync(path.join(conflictPath, 'keep.txt'), 'keep', 'utf8');

    const missingLink = linkService.create(
      { skillId: skill.id, projectId: null, ideName: 'cursor', scope: 'global' },
      sourcePath,
      missingPath,
    );
    const conflictLink = linkService.create(
      { skillId: skill.id, projectId: 'demo', ideName: 'cursor', scope: 'project' },
      sourcePath,
      conflictPath,
    );

    const service = new SkillHealthService({
      settingsService: { get: () => ({ ideRootOverrides: {}, symlinkStrategy: 'auto' }) },
      skillService,
      linkService,
      symlinkService,
      ideService: { list: () => [cursor] },
      projectService: { list: () => [] },
    });

    const results = await service.repairDistribution(skill.id, [missingLink.id, conflictLink.id]);

    expect(results).toEqual([
      expect.objectContaining({ linkId: missingLink.id, status: 'repaired' }),
      expect.objectContaining({ linkId: conflictLink.id, status: 'blocked' }),
    ]);
    expect(symlinkService.verify(missingPath).valid).toBe(true);
    expect(linkService.get(missingLink.id)?.status).toBe('linked');
    expect(fs.readFileSync(path.join(conflictPath, 'keep.txt'), 'utf8')).toBe('keep');
  });

  it('rolls back the new link and persisted destination when post-repair verification fails', async () => {
    const root = createTemporaryDirectory();
    const skillsRoot = path.join(root, 'central');
    const sourcePath = path.join(skillsRoot, 'review');
    const ideRoot = path.join(root, 'ides');
    const previousPath = path.join(root, 'stale', 'review');
    const canonicalPath = path.join(ideRoot, 'cursor', 'skills', 'review');
    const skillService = new SkillService(skillsRoot);
    const skill = skillService.create({
      name: 'review',
      displayName: 'Review',
      description: 'Review changes',
      format: 'folder',
      targetIDEs: [],
      tags: [],
    });
    const linkService = new LinkService(path.join(root, 'data'));
    const symlinkService = new SymlinkService();
    const cursor = createIde(ideRoot, 'cursor', 'Cursor');
    const link = linkService.create(
      { skillId: skill.id, projectId: null, ideName: 'cursor', scope: 'global' },
      sourcePath,
      previousPath,
    );
    const originalVerify = symlinkService.verify.bind(symlinkService);
    vi.spyOn(symlinkService, 'verify').mockImplementation((destination) => {
      if (destination === canonicalPath) return { valid: false };
      return originalVerify(destination);
    });

    const service = new SkillHealthService({
      settingsService: { get: () => ({ ideRootOverrides: {}, symlinkStrategy: 'auto' }) },
      skillService,
      linkService,
      symlinkService,
      ideService: { list: () => [cursor] },
      projectService: { list: () => [] },
    });

    const results = await service.repairDistribution(skill.id, [link.id]);

    expect(results[0]).toEqual(expect.objectContaining({
      linkId: link.id,
      status: 'failed',
      previousPath,
    }));
    expect(fs.existsSync(canonicalPath)).toBe(false);
    expect(linkService.get(link.id)?.destinationPath).toBe(previousPath);
  });

  it('cleans up the filesystem when persisting a repaired destination fails', async () => {
    const root = createTemporaryDirectory();
    const skillsRoot = path.join(root, 'central');
    const sourcePath = path.join(skillsRoot, 'review');
    const ideRoot = path.join(root, 'ides');
    const destinationPath = path.join(ideRoot, 'cursor', 'skills', 'review');
    const skillService = new SkillService(skillsRoot);
    const skill = skillService.create({
      name: 'review',
      displayName: 'Review',
      description: 'Review changes',
      format: 'folder',
      targetIDEs: [],
      tags: [],
    });
    const linkService = new LinkService(path.join(root, 'data'));
    const symlinkService = new SymlinkService();
    const cursor = createIde(ideRoot, 'cursor', 'Cursor');
    const link = linkService.create(
      { skillId: skill.id, projectId: null, ideName: 'cursor', scope: 'global' },
      sourcePath,
      destinationPath,
    );
    vi.spyOn(linkService, 'updateDestination').mockImplementationOnce(() => {
      throw new Error('links database is read-only');
    });

    const service = new SkillHealthService({
      settingsService: { get: () => ({ ideRootOverrides: {}, symlinkStrategy: 'auto' }) },
      skillService,
      linkService,
      symlinkService,
      ideService: { list: () => [cursor] },
      projectService: { list: () => [] },
    });

    const results = await service.repairDistribution(skill.id, [link.id]);

    expect(results[0]).toEqual(expect.objectContaining({ status: 'failed', message: expect.stringContaining('read-only') }));
    expect(fs.existsSync(destinationPath)).toBe(false);
    expect(linkService.get(link.id)?.destinationPath).toBe(destinationPath);
  });

  it('reports a persisted link as blocked when the managed source is missing', async () => {
    const root = createTemporaryDirectory();
    const missingSource = path.join(root, 'central', 'review');
    const destinationPath = path.join(root, 'ides', 'cursor', 'skills', 'review');
    const linkService = new LinkService(path.join(root, 'data'));
    const link = linkService.create(
      { skillId: 'review', projectId: null, ideName: 'cursor', scope: 'global' },
      missingSource,
      destinationPath,
    );
    const ide = createIde(path.join(root, 'ides'), 'cursor', 'Cursor');
    const service = new SkillHealthService({
      settingsService: { get: () => ({ ideRootOverrides: {}, symlinkStrategy: 'auto' }) },
      skillService: {
        get: () => ({ id: 'review', name: 'review', sourcePath: missingSource }) as unknown as Skill,
      },
      linkService,
      symlinkService: new SymlinkService(),
      ideService: { list: () => [ide] },
      projectService: { list: () => [] },
    });

    const report = await service.checkDistribution('review');

    expect(report.destinations).toEqual([
      expect.objectContaining({
        linkId: link.id,
        status: 'broken',
        repairable: false,
        message: 'Managed skill source is unavailable.',
      }),
    ]);
  });

  it('uses the migration service for a valid legacy global destination', async () => {
    const root = createTemporaryDirectory();
    const skillsRoot = path.join(root, 'central');
    const sourcePath = path.join(skillsRoot, 'review');
    const ideRoot = path.join(root, 'ides');
    const oldPath = path.join(ideRoot, 'cursor', 'review');
    const canonicalPath = path.join(ideRoot, 'cursor', 'skills', 'review');
    const skillService = new SkillService(skillsRoot);
    const skill = skillService.create({
      name: 'review',
      displayName: 'Review',
      description: 'Review changes',
      format: 'folder',
      targetIDEs: [],
      tags: [],
    });
    const linkService = new LinkService(path.join(root, 'data'));
    const symlinkService = new SymlinkService();
    const cursor = createIde(ideRoot, 'cursor', 'Cursor');
    expect(symlinkService.create(sourcePath, oldPath, 'auto').success).toBe(true);
    const link = linkService.create(
      { skillId: skill.id, projectId: null, ideName: 'cursor', scope: 'global' },
      sourcePath,
      oldPath,
    );
    const settingsService = { get: () => ({ ideRootOverrides: {}, symlinkStrategy: 'auto' }) };
    const linkMigrationService = new LinkMigrationService({
      settingsService,
      skillService,
      linkService,
      symlinkService,
      ideService: { list: () => [cursor] },
    });

    const service = new SkillHealthService({
      settingsService,
      skillService,
      linkService,
      symlinkService,
      ideService: { list: () => [cursor] },
      projectService: { list: () => [] },
      linkMigrationService,
    });

    const report = await service.checkDistribution(skill.id);
    expect(report.destinations[0]).toEqual(expect.objectContaining({ status: 'legacy', repairable: true }));

    const results = await service.repairDistribution(skill.id, [link.id]);

    expect(results[0]).toEqual(expect.objectContaining({ linkId: link.id, status: 'repaired' }));
    expect(fs.existsSync(oldPath)).toBe(false);
    expect(symlinkService.verify(canonicalPath).valid).toBe(true);
    expect(linkService.get(link.id)?.destinationPath).toBe(canonicalPath);
  });

  it('blocks repairs for managed links outside known IDE skills roots', async () => {
    const root = createTemporaryDirectory();
    const skillsRoot = path.join(root, 'central');
    const sourcePath = path.join(skillsRoot, 'review');
    const ideRoot = path.join(root, 'ides');
    const externalPath = path.join(root, 'external', 'review');
    const canonicalPath = path.join(ideRoot, 'cursor', 'skills', 'review');
    const skillService = new SkillService(skillsRoot);
    const skill = skillService.create({
      name: 'review',
      displayName: 'Review',
      description: 'Review changes',
      format: 'folder',
      targetIDEs: [],
      tags: [],
    });
    const linkService = new LinkService(path.join(root, 'data'));
    const symlinkService = new SymlinkService();
    const cursor = createIde(ideRoot, 'cursor', 'Cursor');
    expect(symlinkService.create(sourcePath, externalPath, 'auto').success).toBe(true);
    const link = linkService.create(
      { skillId: skill.id, projectId: null, ideName: 'cursor', scope: 'global' },
      sourcePath,
      externalPath,
    );
    const service = new SkillHealthService({
      settingsService: { get: () => ({ ideRootOverrides: {}, symlinkStrategy: 'auto' }) },
      skillService,
      linkService,
      symlinkService,
      ideService: { list: () => [cursor] },
      projectService: { list: () => [] },
    });

    const report = await service.checkDistribution(skill.id);
    expect(report.destinations).toEqual([
      expect.objectContaining({
        linkId: link.id,
        status: 'conflict',
        repairable: false,
        message: 'Current destination is outside a known IDE skills root.',
      }),
    ]);

    const results = await service.repairDistribution(skill.id, [link.id]);

    expect(results[0]).toEqual(expect.objectContaining({ linkId: link.id, status: 'blocked' }));
    expect(symlinkService.verify(externalPath).valid).toBe(true);
    expect(fs.existsSync(canonicalPath)).toBe(false);
    expect(linkService.get(link.id)?.destinationPath).toBe(externalPath);
  });

  it('blocks repairs when another persisted link claims the canonical destination', async () => {
    const root = createTemporaryDirectory();
    const skillsRoot = path.join(root, 'central');
    const sourcePath = path.join(skillsRoot, 'review');
    const ideRoot = path.join(root, 'ides');
    const projectRoot = path.join(root, 'project');
    const oldPath = path.join(ideRoot, 'cursor', 'review');
    const canonicalPath = path.join(ideRoot, 'cursor', 'skills', 'review');
    const skillService = new SkillService(skillsRoot);
    const skill = skillService.create({
      name: 'review',
      displayName: 'Review',
      description: 'Review changes',
      format: 'folder',
      targetIDEs: [],
      tags: [],
    });
    const linkService = new LinkService(path.join(root, 'data'));
    const symlinkService = new SymlinkService();
    const cursor = createIde(ideRoot, 'cursor', 'Cursor');
    const project = createProject(projectRoot, 'collision-project');
    const link = linkService.create(
      { skillId: skill.id, projectId: null, ideName: 'cursor', scope: 'global' },
      sourcePath,
      oldPath,
    );
    linkService.create(
      { skillId: skill.id, projectId: project.id, ideName: 'cursor', scope: 'project' },
      sourcePath,
      canonicalPath,
    );
    const service = new SkillHealthService({
      settingsService: { get: () => ({ ideRootOverrides: {}, symlinkStrategy: 'auto' }) },
      skillService,
      linkService,
      symlinkService,
      ideService: { list: () => [cursor] },
      projectService: { list: () => [project] },
    });

    const report = await service.checkDistribution(skill.id);
    expect(report.destinations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        linkId: link.id,
        status: 'conflict',
        repairable: false,
        message: 'Expected destination is already claimed by another managed link.',
      }),
    ]));

    const results = await service.repairDistribution(skill.id, [link.id]);

    expect(results[0]).toEqual(expect.objectContaining({ linkId: link.id, status: 'blocked' }));
    expect(fs.existsSync(canonicalPath)).toBe(false);
    expect(linkService.get(link.id)?.destinationPath).toBe(oldPath);
  });
});
