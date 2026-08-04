import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IDEDefinition } from '../types/domain';
import { LinkService } from './link.service';
import { LinkMigrationService } from './link-migration.service';
import { SymlinkService } from './symlink.service';

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-manager-link-migration-'));
  temporaryDirectories.push(directory);
  return directory;
}

function createMigrationService(
  root: string,
  linkService: LinkService,
  symlinkService: SymlinkService,
): LinkMigrationService {
  const ide: IDEDefinition = {
    id: 'cursor',
    name: 'Cursor',
    configFormat: 'markdown',
    mode: 'rules',
    roots: {
      primaryGlobal: [path.join(root, 'cursor')],
      secondaryGlobal: [],
      projectRelative: ['.cursor/rules'],
    },
    skillRootTemplates: [path.join(root, 'cursor', 'skills')],
  };

  return new LinkMigrationService({
    settingsService: { get: () => ({ ideRootOverrides: {}, symlinkStrategy: 'auto' }) } as any,
    skillService: {
      get: (id: string) => id === 'review' ? {
        id,
        name: 'review',
        sourcePath: path.join(root, 'central', 'review'),
      } : undefined,
    } as any,
    linkService,
    symlinkService,
    ideService: { list: () => [ide] },
  });
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('LinkMigrationService', () => {
  it('previews and migrates a managed global link into the canonical skills directory', async () => {
    const root = createTemporaryDirectory();
    const sourcePath = path.join(root, 'central', 'review');
    const oldPath = path.join(root, 'cursor', 'review');
    const newPath = path.join(root, 'cursor', 'skills', 'review');
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.writeFileSync(path.join(sourcePath, 'SKILL.md'), '# Review', 'utf8');

    const symlinkService = new SymlinkService();
    expect(symlinkService.create(sourcePath, oldPath, 'auto').success).toBe(true);
    const linkService = new LinkService(path.join(root, 'data'));
    const link = linkService.create(
      { skillId: 'review', projectId: 'skills-manager', ideName: 'cursor', scope: 'global' },
      sourcePath,
      oldPath,
    );
    const service = createMigrationService(root, linkService, symlinkService);

    const preview = await service.preview();

    expect(preview.candidates).toEqual([
      expect.objectContaining({
        linkId: link.id,
        currentPath: oldPath,
        targetPath: newPath,
        status: 'ready',
      }),
    ]);

    const results = await service.migrate([link.id]);

    expect(results).toEqual([
      expect.objectContaining({
        linkId: link.id,
        status: 'migrated',
        targetPath: newPath,
      }),
    ]);
    expect(fs.existsSync(oldPath)).toBe(false);
    expect(symlinkService.isSymlink(newPath)).toBe(true);
    expect(linkService.get(link.id)?.destinationPath).toBe(newPath);
  });

  it('reports a target conflict without replacing the existing entry', async () => {
    const root = createTemporaryDirectory();
    const sourcePath = path.join(root, 'central', 'review');
    const oldPath = path.join(root, 'cursor', 'review');
    const newPath = path.join(root, 'cursor', 'skills', 'review');
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.mkdirSync(newPath, { recursive: true });
    fs.writeFileSync(path.join(newPath, 'keep.txt'), 'keep', 'utf8');

    const symlinkService = new SymlinkService();
    expect(symlinkService.create(sourcePath, oldPath, 'auto').success).toBe(true);
    const linkService = new LinkService(path.join(root, 'data'));
    const link = linkService.create(
      { skillId: 'review', projectId: 'skills-manager', ideName: 'cursor', scope: 'global' },
      sourcePath,
      oldPath,
    );
    const service = createMigrationService(root, linkService, symlinkService);

    const preview = await service.preview();
    expect(preview.candidates[0]).toEqual(expect.objectContaining({ status: 'conflict' }));

    const results = await service.migrate([link.id]);

    expect(results[0].status).toBe('skipped');
    expect(fs.existsSync(oldPath)).toBe(true);
    expect(fs.readFileSync(path.join(newPath, 'keep.txt'), 'utf8')).toBe('keep');
    expect(linkService.get(link.id)?.destinationPath).toBe(oldPath);
  });

  it('blocks entries that are not symlinks and leaves them untouched', async () => {
    const root = createTemporaryDirectory();
    const sourcePath = path.join(root, 'central', 'review');
    const oldPath = path.join(root, 'cursor', 'review');
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.mkdirSync(oldPath, { recursive: true });
    fs.writeFileSync(path.join(oldPath, 'keep.txt'), 'keep', 'utf8');

    const symlinkService = new SymlinkService();
    const linkService = new LinkService(path.join(root, 'data'));
    const link = linkService.create(
      { skillId: 'review', projectId: 'skills-manager', ideName: 'cursor', scope: 'global' },
      sourcePath,
      oldPath,
    );
    const service = createMigrationService(root, linkService, symlinkService);

    const preview = await service.preview();
    expect(preview.candidates[0]).toEqual(expect.objectContaining({ status: 'blocked' }));

    const results = await service.migrate([link.id]);

    expect(results[0].status).toBe('skipped');
    expect(fs.existsSync(oldPath)).toBe(true);
    expect(fs.readFileSync(path.join(oldPath, 'keep.txt'), 'utf8')).toBe('keep');
    expect(linkService.get(link.id)?.destinationPath).toBe(oldPath);
  });

  it('blocks links whose actual target differs from the persisted source', async () => {
    const root = createTemporaryDirectory();
    const persistedSourcePath = path.join(root, 'central', 'review');
    const actualSourcePath = path.join(root, 'other-central', 'review');
    const oldPath = path.join(root, 'cursor', 'review');
    fs.mkdirSync(persistedSourcePath, { recursive: true });
    fs.mkdirSync(actualSourcePath, { recursive: true });
    fs.writeFileSync(path.join(persistedSourcePath, 'SKILL.md'), '# Persisted', 'utf8');
    fs.writeFileSync(path.join(actualSourcePath, 'SKILL.md'), '# Actual', 'utf8');

    const symlinkService = new SymlinkService();
    expect(symlinkService.create(actualSourcePath, oldPath, 'auto').success).toBe(true);
    const linkService = new LinkService(path.join(root, 'data'));
    const link = linkService.create(
      { skillId: 'review', projectId: 'skills-manager', ideName: 'cursor', scope: 'global' },
      persistedSourcePath,
      oldPath,
    );
    const service = createMigrationService(root, linkService, symlinkService);

    const preview = await service.preview();

    expect(preview.candidates[0]).toEqual(expect.objectContaining({
      status: 'blocked',
      message: expect.stringContaining('does not match'),
    }));

    const results = await service.migrate([link.id]);

    expect(results[0].status).toBe('skipped');
    expect(fs.readlinkSync(oldPath)).toBe(actualSourcePath);
    expect(linkService.get(link.id)?.destinationPath).toBe(oldPath);
  });

  it('blocks links whose persisted source differs from the current skill source', async () => {
    const root = createTemporaryDirectory();
    const persistedSourcePath = path.join(root, 'legacy', 'review');
    const currentSkillSourcePath = path.join(root, 'central', 'review');
    const oldPath = path.join(root, 'cursor', 'review');
    fs.mkdirSync(persistedSourcePath, { recursive: true });
    fs.mkdirSync(currentSkillSourcePath, { recursive: true });

    const symlinkService = new SymlinkService();
    expect(symlinkService.create(persistedSourcePath, oldPath, 'auto').success).toBe(true);
    const linkService = new LinkService(path.join(root, 'data'));
    const link = linkService.create(
      { skillId: 'review', projectId: 'skills-manager', ideName: 'cursor', scope: 'global' },
      persistedSourcePath,
      oldPath,
    );
    const service = createMigrationService(root, linkService, symlinkService);

    const preview = await service.preview();

    expect(preview.candidates[0]).toEqual(expect.objectContaining({
      status: 'blocked',
      message: 'Persisted link source does not match the current skill source.',
    }));

    const results = await service.migrate([link.id]);

    expect(results[0].status).toBe('skipped');
    expect(fs.readlinkSync(oldPath)).toBe(persistedSourcePath);
  });

  it('rolls back when the old link changes after preview', async () => {
    const root = createTemporaryDirectory();
    const sourcePath = path.join(root, 'central', 'review');
    const changedSourcePath = path.join(root, 'other-central', 'review');
    const oldPath = path.join(root, 'cursor', 'review');
    const newPath = path.join(root, 'cursor', 'skills', 'review');
    fs.mkdirSync(sourcePath, { recursive: true });
    fs.mkdirSync(changedSourcePath, { recursive: true });

    const symlinkService = new SymlinkService();
    expect(symlinkService.create(sourcePath, oldPath, 'auto').success).toBe(true);
    const linkService = new LinkService(path.join(root, 'data'));
    const link = linkService.create(
      { skillId: 'review', projectId: 'skills-manager', ideName: 'cursor', scope: 'global' },
      sourcePath,
      oldPath,
    );
    const originalCreateExclusive = symlinkService.createExclusive.bind(symlinkService);
    vi.spyOn(symlinkService, 'createExclusive').mockImplementation((source, destination, strategy) => {
      const result = originalCreateExclusive(source, destination, strategy);
      if (result.success) {
        symlinkService.remove(oldPath);
        symlinkService.create(changedSourcePath, oldPath, 'auto');
      }
      return result;
    });
    const service = createMigrationService(root, linkService, symlinkService);

    const preview = await service.preview();
    expect(preview.candidates[0].status).toBe('ready');

    const results = await service.migrate([link.id]);

    expect(results[0].status).toBe('failed');
    expect(fs.existsSync(newPath)).toBe(false);
    expect(fs.readlinkSync(oldPath)).toBe(changedSourcePath);
    expect(linkService.get(link.id)?.destinationPath).toBe(oldPath);
  });
});
