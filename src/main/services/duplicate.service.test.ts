import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DetectedSkillRoot } from '../types/domain';
import { DuplicateService } from './duplicate.service';
import { SkillService } from './skill.service';

const validFrontmatter = `---
name: review
displayName: Review
description: Review changes
version: 1.0.0
targetIDEs: []
tags: []
---

# Review
`;

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-manager-duplicates-'));
  temporaryDirectories.push(directory);
  return directory;
}

function writeSkill(root: string, name: string, files: Record<string, string>): string {
  const skillPath = path.join(root, name);
  fs.mkdirSync(skillPath, { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(skillPath, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }
  return skillPath;
}

function createDuplicateService(
  roots: DetectedSkillRoot[],
  centralRoot: string,
  trashItem: (targetPath: string) => Promise<void> = vi.fn(async () => undefined),
): DuplicateService {
  return new DuplicateService({
    settingsService: {
      get: () => ({
        centralSkillsRoot: centralRoot,
        ideRootOverrides: {},
      }),
    } as any,
    ideService: {
      detectSkillRoots: vi.fn(() => roots),
    },
    trashItem,
  });
}

function root(rootPath: string, ideId: string, ideName = ideId): DetectedSkillRoot {
  return { root: rootPath, ideIds: [ideId], ideNames: [ideName] };
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('DuplicateService', () => {
  it('groups same-name directories only when every file byte matches', async () => {
    const rootA = createTemporaryDirectory();
    const rootB = createTemporaryDirectory();
    const rootC = createTemporaryDirectory();
    const centralRoot = createTemporaryDirectory();
    const skillFiles = {
      'SKILL.md': validFrontmatter,
      'docs/guide.md': 'same bytes',
    };
    const firstPath = writeSkill(rootA, 'review', skillFiles);
    const secondPath = writeSkill(rootB, 'review', skillFiles);
    const differentPath = writeSkill(rootC, 'review', {
      ...skillFiles,
      'docs/guide.md': 'different bytes',
    });

    const result = await createDuplicateService([
      root(rootA, 'claude-code', 'Claude Code'),
      root(rootB, 'codex-cli', 'Codex CLI'),
      root(rootC, 'cursor', 'Cursor'),
    ], centralRoot).scan();

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].occurrences.map((item) => item.path)).toEqual(
      expect.arrayContaining([firstPath, secondPath]),
    );
    expect(result.groups[0].occurrences.map((item) => item.path)).not.toContain(differentPath);
  });

  it('ignores timestamps and excludes missing roots from the scan', async () => {
    const rootA = createTemporaryDirectory();
    const rootB = createTemporaryDirectory();
    const centralRoot = createTemporaryDirectory();
    const firstPath = writeSkill(rootA, 'review', { 'SKILL.md': validFrontmatter });
    const secondPath = writeSkill(rootB, 'review', { 'SKILL.md': validFrontmatter });
    const oldTime = new Date('2020-01-01T00:00:00.000Z');
    fs.utimesSync(path.join(secondPath, 'SKILL.md'), oldTime, oldTime);

    const result = await createDuplicateService([
      root(rootA, 'claude-code'),
      root(rootB, 'codex-cli'),
      root(path.join(centralRoot, 'missing'), 'cursor'),
    ], centralRoot).scan();

    expect(result.roots).toHaveLength(3);
    expect(result.groups[0].occurrences.map((item) => item.path)).toEqual(
      expect.arrayContaining([firstPath, secondPath]),
    );
  });

  it('represents a shared physical root once with all tool metadata', async () => {
    const sharedRoot = createTemporaryDirectory();
    const otherRoot = createTemporaryDirectory();
    const centralRoot = createTemporaryDirectory();
    const sharedPath = writeSkill(sharedRoot, 'review', { 'SKILL.md': validFrontmatter });
    const otherPath = writeSkill(otherRoot, 'review', { 'SKILL.md': validFrontmatter });

    const result = await createDuplicateService([
      {
        root: sharedRoot,
        ideIds: ['codex-cli'],
        ideNames: ['Codex CLI'],
      },
      {
        root: sharedRoot,
        ideIds: ['codex-desktop'],
        ideNames: ['Codex Desktop'],
      },
      root(otherRoot, 'opencode', 'OpenCode'),
    ], centralRoot).scan();

    const sharedOccurrence = result.groups[0].occurrences.find((item) => item.path === sharedPath);
    expect(result.groups[0].occurrences).toHaveLength(2);
    expect(sharedOccurrence?.ideIds).toEqual(expect.arrayContaining(['codex-cli', 'codex-desktop']));
    expect(result.groups[0].occurrences.map((item) => item.path)).toContain(otherPath);
  });

  it('ignores symlinked skill directories', async () => {
    const rootA = createTemporaryDirectory();
    const rootB = createTemporaryDirectory();
    const centralRoot = createTemporaryDirectory();
    writeSkill(rootA, 'review', { 'SKILL.md': validFrontmatter });
    writeSkill(rootB, 'review', { 'SKILL.md': validFrontmatter });
    const target = writeSkill(rootA, 'linked-review', { 'SKILL.md': validFrontmatter });
    const linkPath = path.join(rootB, 'linked-review');

    try {
      fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      return;
    }

    const result = await createDuplicateService([
      root(rootA, 'claude-code'),
      root(rootB, 'codex-cli'),
    ], centralRoot).scan();

    expect(result.groups.some((group) => group.name === 'linked-review')).toBe(false);
  });

  it('requires the SKILL.md marker to use the exact filename', async () => {
    const rootA = createTemporaryDirectory();
    const rootB = createTemporaryDirectory();
    const centralRoot = createTemporaryDirectory();
    writeSkill(rootA, 'review', { 'SKILL.md': validFrontmatter });
    writeSkill(rootB, 'review', { 'skill.md': validFrontmatter });

    const result = await createDuplicateService([
      root(rootA, 'claude-code'),
      root(rootB, 'codex-cli'),
    ], centralRoot).scan();

    expect(result.groups).toHaveLength(0);
  });

  it('continues removal after a trash failure and reports each path', async () => {
    const rootA = createTemporaryDirectory();
    const rootB = createTemporaryDirectory();
    const centralRoot = createTemporaryDirectory();
    const firstPath = writeSkill(rootA, 'review', { 'SKILL.md': validFrontmatter });
    const secondPath = writeSkill(rootB, 'review', { 'SKILL.md': validFrontmatter });
    const trashItem = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Recycle Bin unavailable'));
    const service = createDuplicateService([
      root(rootA, 'claude-code'),
      root(rootB, 'codex-cli'),
    ], centralRoot, trashItem);

    const results = await service.removeOccurrences([firstPath, secondPath]);

    expect(results.map((result) => result.status)).toEqual(['trashed', 'failed']);
    expect(trashItem).toHaveBeenCalledTimes(2);
  });

  it('copies and validates one central skill before trashing selected sources', async () => {
    const rootA = createTemporaryDirectory();
    const rootB = createTemporaryDirectory();
    const centralRoot = createTemporaryDirectory();
    const sourceA = writeSkill(rootA, 'review', { 'SKILL.md': validFrontmatter, 'guide.md': 'same' });
    const sourceB = writeSkill(rootB, 'review', { 'SKILL.md': validFrontmatter, 'guide.md': 'same' });
    const trashItem = vi.fn(async () => undefined);
    const service = createDuplicateService([
      root(rootA, 'claude-code'),
      root(rootB, 'codex-cli'),
    ], centralRoot, trashItem);

    const results = await service.migrateOccurrences([sourceA, sourceB]);

    expect(fs.readFileSync(path.join(centralRoot, 'review', 'SKILL.md'), 'utf8')).toBe(validFrontmatter);
    expect(results.every((result) => result.status === 'migrated')).toBe(true);
    expect(trashItem).toHaveBeenCalledWith(sourceA);
    expect(trashItem).toHaveBeenCalledWith(sourceB);
  });

  it('holds the migration lock while selected sources are sent to the trash', async () => {
    const sourceRoot = createTemporaryDirectory();
    const centralRoot = createTemporaryDirectory();
    const sourcePath = writeSkill(sourceRoot, 'review', { 'SKILL.md': validFrontmatter });
    const lockPath = path.join(centralRoot, '.review.migration.lock');
    const trashItem = vi.fn(async () => {
      expect(fs.existsSync(lockPath)).toBe(true);
      const centralWriter = new SkillService(centralRoot);
      expect(() => centralWriter.writeFile('review', 'during-migration.md', 'blocked'))
        .toThrow(/being migrated/);
    });
    const service = createDuplicateService([root(sourceRoot, 'claude-code')], centralRoot, trashItem);

    const results = await service.migrateOccurrences([sourcePath]);

    expect(results[0].status).toBe('migrated');
    expect(fs.existsSync(lockPath)).toBe(false);
    expect(trashItem).toHaveBeenCalledWith(sourcePath);
  });

  it('keeps the final central path absent until the staged copy is ready', async () => {
    const sourceRoot = createTemporaryDirectory();
    const centralRoot = createTemporaryDirectory();
    const sourcePath = writeSkill(sourceRoot, 'review', { 'SKILL.md': validFrontmatter });
    const centralPath = path.join(centralRoot, 'review');
    const trashItem = vi.fn(async () => undefined);
    const service = createDuplicateService([root(sourceRoot, 'claude-code')], centralRoot, trashItem);
    const originalCp = fs.promises.cp.bind(fs.promises);
    const cpSpy = vi.spyOn(fs.promises, 'cp').mockImplementation(async (...args: any[]) => {
      expect(fs.existsSync(centralPath)).toBe(false);
      return (originalCp as any)(...args);
    });

    try {
      const results = await service.migrateOccurrences([sourcePath]);

      expect(results[0].status).toBe('migrated');
      expect(cpSpy).toHaveBeenCalled();
      expect(fs.existsSync(centralPath)).toBe(true);
    } finally {
      cpSpy.mockRestore();
    }
  });

  it('recovers a stale migration lock and its owned staging directory', async () => {
    const sourceRoot = createTemporaryDirectory();
    const centralRoot = createTemporaryDirectory();
    const sourcePath = writeSkill(sourceRoot, 'review', { 'SKILL.md': validFrontmatter });
    const staleStagingPath = path.join(centralRoot, '.review.staging-stale');
    writeSkill(centralRoot, '.review.staging-stale', { 'SKILL.md': validFrontmatter });
    const lockPath = path.join(centralRoot, '.review.migration.lock');
    fs.writeFileSync(lockPath, JSON.stringify({
      token: 'stale-token',
      pid: -1,
      stagingPath: staleStagingPath,
    }), 'utf8');
    const trashItem = vi.fn(async () => undefined);
    const service = createDuplicateService([root(sourceRoot, 'claude-code')], centralRoot, trashItem);

    const results = await service.migrateOccurrences([sourcePath]);

    expect(results[0].status).toBe('migrated');
    expect(fs.existsSync(path.join(centralRoot, 'review'))).toBe(true);
    expect(fs.existsSync(staleStagingPath)).toBe(false);
    expect(fs.existsSync(lockPath)).toBe(false);
    expect(trashItem).toHaveBeenCalledWith(sourcePath);
  });

  it('does not remove a lock replaced while stale recovery is racing', async () => {
    const sourceRoot = createTemporaryDirectory();
    const centralRoot = createTemporaryDirectory();
    const sourcePath = writeSkill(sourceRoot, 'review', { 'SKILL.md': validFrontmatter });
    const lockPath = path.join(centralRoot, '.review.migration.lock');
    fs.writeFileSync(lockPath, JSON.stringify({
      token: 'stale-token',
      pid: -1,
      stagingPath: path.join(centralRoot, '.review.staging-stale'),
    }), 'utf8');
    const trashItem = vi.fn(async () => undefined);
    const service = createDuplicateService([root(sourceRoot, 'claude-code')], centralRoot, trashItem);
    const originalRename = fs.promises.rename.bind(fs.promises);
    const renameSpy = vi.spyOn(fs.promises, 'rename').mockImplementation(async (...args: any[]) => {
      const sourcePathArg = typeof args[0] === 'string' ? path.resolve(args[0]) : '';
      const destinationPath = typeof args[1] === 'string' ? path.resolve(args[1]) : '';
      if (
        sourcePathArg === path.resolve(lockPath) &&
        path.basename(destinationPath).startsWith('.review.migration.reclaim-')
      ) {
        fs.rmSync(lockPath, { force: true });
        fs.writeFileSync(lockPath, JSON.stringify({
          token: 'new-live-token',
          pid: process.pid,
          stagingPath: path.join(centralRoot, '.review.staging-live'),
        }), 'utf8');
        throw Object.assign(new Error('Stale lock was claimed by another process'), { code: 'ENOENT' });
      }
      return (originalRename as any)(...args);
    });

    try {
      const results = await service.migrateOccurrences([sourcePath]);

      expect(results[0].status).toBe('blocked');
      expect(fs.existsSync(lockPath)).toBe(true);
      expect(fs.existsSync(sourcePath)).toBe(true);
      expect(trashItem).not.toHaveBeenCalled();
    } finally {
      renameSpy.mockRestore();
    }
  });

  it('blocks without touching sources while another migration is alive', async () => {
    const sourceRoot = createTemporaryDirectory();
    const centralRoot = createTemporaryDirectory();
    const sourcePath = writeSkill(sourceRoot, 'review', { 'SKILL.md': validFrontmatter });
    const lockPath = path.join(centralRoot, '.review.migration.lock');
    fs.writeFileSync(lockPath, JSON.stringify({
      token: 'live-token',
      pid: process.pid,
      stagingPath: path.join(centralRoot, '.review.staging-live'),
    }), 'utf8');
    const trashItem = vi.fn(async () => undefined);
    const service = createDuplicateService([root(sourceRoot, 'claude-code')], centralRoot, trashItem);

    const results = await service.migrateOccurrences([sourcePath]);

    expect(results[0].status).toBe('blocked');
    expect(fs.existsSync(sourcePath)).toBe(true);
    expect(fs.existsSync(lockPath)).toBe(true);
    expect(trashItem).not.toHaveBeenCalled();
  });

  it('reuses identical central content and blocks a different central skill', async () => {
    const rootA = createTemporaryDirectory();
    const rootB = createTemporaryDirectory();
    const centralRoot = createTemporaryDirectory();
    const sourceA = writeSkill(rootA, 'review', { 'SKILL.md': validFrontmatter });
    const sourceB = writeSkill(rootB, 'review', { 'SKILL.md': validFrontmatter });
    writeSkill(centralRoot, 'review', { 'SKILL.md': validFrontmatter });
    const trashItem = vi.fn(async () => undefined);
    const service = createDuplicateService([
      root(rootA, 'claude-code'),
      root(rootB, 'codex-cli'),
    ], centralRoot, trashItem);

    const reusedResults = await service.migrateOccurrences([sourceA, sourceB]);
    expect(reusedResults.every((result) => result.status === 'migrated')).toBe(true);
    expect(trashItem).toHaveBeenCalledTimes(2);

    const differentRoot = createTemporaryDirectory();
    const differentSource = writeSkill(differentRoot, 'review', {
      'SKILL.md': validFrontmatter,
      'extra.md': 'different',
    });
    const blockedTrash = vi.fn(async () => undefined);
    const blockedService = createDuplicateService([
      root(differentRoot, 'cursor'),
    ], centralRoot, blockedTrash);
    const blockedResults = await blockedService.migrateOccurrences([differentSource]);

    expect(blockedResults[0].status).toBe('blocked');
    expect(blockedTrash).not.toHaveBeenCalled();
  });

  it('revalidates a central skill that appears before atomic final install', async () => {
    const sourceRoot = createTemporaryDirectory();
    const centralRoot = createTemporaryDirectory();
    const sourcePath = writeSkill(sourceRoot, 'review', {
      'SKILL.md': validFrontmatter,
      'guide.md': 'source',
    });
    const centralPath = path.join(centralRoot, 'review');
    const trashItem = vi.fn(async () => undefined);
    const service = createDuplicateService([root(sourceRoot, 'claude-code')], centralRoot, trashItem);
    const originalRename = fs.promises.rename.bind(fs.promises);
    const renameSpy = vi.spyOn(fs.promises, 'rename').mockImplementation(async (...args: any[]) => {
      const destinationPath = typeof args[1] === 'string' ? path.resolve(args[1]) : '';
      if (destinationPath === centralPath) {
        writeSkill(centralRoot, 'review', {
          'SKILL.md': validFrontmatter,
          'guide.md': 'concurrent central content',
        });
        throw Object.assign(new Error('Central path already exists'), { code: 'EEXIST' });
      }
      return (originalRename as any)(...args);
    });

    try {
      const results = await service.migrateOccurrences([sourcePath]);

      expect(results[0].status).toBe('blocked');
      expect(trashItem).not.toHaveBeenCalled();
      expect(fs.readFileSync(path.join(centralPath, 'guide.md'), 'utf8')).toBe('concurrent central content');
      expect(fs.readFileSync(path.join(sourcePath, 'guide.md'), 'utf8')).toBe('source');
    } finally {
      renameSpy.mockRestore();
    }
  });

  it('preserves different central content if a writer overtakes final install', async () => {
    const sourceRoot = createTemporaryDirectory();
    const centralRoot = createTemporaryDirectory();
    const sourcePath = writeSkill(sourceRoot, 'review', {
      'SKILL.md': validFrontmatter,
      'guide.md': 'source',
    });
    const centralPath = path.join(centralRoot, 'review');
    const trashItem = vi.fn(async () => undefined);
    const service = createDuplicateService([root(sourceRoot, 'claude-code')], centralRoot, trashItem);
    const originalRename = fs.promises.rename.bind(fs.promises);
    const renameSpy = vi.spyOn(fs.promises, 'rename').mockImplementation(async (...args: any[]) => {
      const destinationPath = typeof args[1] === 'string' ? path.resolve(args[1]) : '';
      if (destinationPath === centralPath) {
        writeSkill(centralRoot, 'review', {
          'SKILL.md': validFrontmatter,
          'guide.md': 'concurrent central content',
        });
        return undefined;
      }
      return (originalRename as any)(...args);
    });

    try {
      const results = await service.migrateOccurrences([sourcePath]);

      expect(results[0].status).toBe('blocked');
      expect(fs.readFileSync(path.join(centralPath, 'guide.md'), 'utf8')).toBe('concurrent central content');
      expect(fs.readFileSync(path.join(sourcePath, 'guide.md'), 'utf8')).toBe('source');
      expect(trashItem).not.toHaveBeenCalled();
    } finally {
      renameSpy.mockRestore();
    }
  });

  it('blocks invalid source frontmatter for migration but allows removal', async () => {
    const sourceRoot = createTemporaryDirectory();
    const centralRoot = createTemporaryDirectory();
    const invalidSource = writeSkill(sourceRoot, 'review', { 'SKILL.md': '# no frontmatter' });
    const trashItem = vi.fn(async () => undefined);
    const service = createDuplicateService([root(sourceRoot, 'claude-code')], centralRoot, trashItem);

    const migration = await service.migrateOccurrences([invalidSource]);
    expect(migration[0].status).toBe('blocked');
    expect(fs.existsSync(path.join(centralRoot, 'review'))).toBe(false);
    expect(trashItem).not.toHaveBeenCalled();

    const removal = await service.removeOccurrences([invalidSource]);
    expect(removal[0].status).toBe('trashed');
    expect(trashItem).toHaveBeenCalledWith(invalidSource);
  });

  it('blocks unsafe, central, and already-missing paths', async () => {
    const sourceRoot = createTemporaryDirectory();
    const outsideRoot = createTemporaryDirectory();
    const centralRoot = createTemporaryDirectory();
    const sourcePath = writeSkill(sourceRoot, 'review', { 'SKILL.md': validFrontmatter });
    const outsidePath = writeSkill(outsideRoot, 'outside-review', { 'SKILL.md': validFrontmatter });
    const centralPath = writeSkill(centralRoot, 'central-review', { 'SKILL.md': validFrontmatter });
    const trashItem = vi.fn(async () => undefined);
    const service = createDuplicateService([root(sourceRoot, 'claude-code')], centralRoot, trashItem);

    const results = await service.removeOccurrences([
      path.join(outsidePath, '..', path.basename(outsidePath)),
      centralPath,
      path.join(sourceRoot, 'missing'),
      sourcePath,
    ]);

    expect(results.map((result) => result.status)).toEqual([
      'blocked',
      'blocked',
      'already-missing',
      'trashed',
    ]);
    expect(trashItem).toHaveBeenCalledTimes(1);
  });
});
