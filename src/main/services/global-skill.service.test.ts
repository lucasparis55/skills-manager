import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings, IDEDefinition, Link } from '../types/domain';
import { GlobalSkillService } from './global-skill.service';

const VALID_SKILL = `---
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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-manager-global-'));
  temporaryDirectories.push(directory);
  return directory;
}

function writeSkill(root: string, name: string, content = VALID_SKILL): string {
  const skillPath = path.join(root, name);
  fs.mkdirSync(skillPath, { recursive: true });
  fs.writeFileSync(path.join(skillPath, 'SKILL.md'), content, 'utf8');
  return skillPath;
}

function ide(id: string, name: string, root: string): IDEDefinition {
  return {
    id,
    name,
    configFormat: 'markdown',
    mode: 'skills',
    roots: {
      primaryGlobal: [root],
      secondaryGlobal: [],
      projectRelative: ['.skills'],
    },
    skillRootTemplates: [root],
  };
}

function createService(
  ides: IDEDefinition[],
  centralSkillsRoot: string,
  links: Link[] = [],
  trashItem: (targetPath: string) => Promise<void> = vi.fn(async () => undefined),
  symlinkService: { createExclusive: ReturnType<typeof vi.fn> } = {
    createExclusive: vi.fn(() => ({ success: true, strategy: 'junction' })),
  },
): GlobalSkillService {
  return new GlobalSkillService({
    settingsService: {
      get: (): AppSettings => ({
        centralSkillsRoot,
        checkForUpdates: true,
        autoScanProjects: true,
        symlinkStrategy: 'auto',
        developerModeEnabled: false,
        theme: 'dark',
        projectScanDepth: 2,
        ideRootOverrides: {},
      }),
    },
    ideService: {
      list: () => ides,
    },
    linkService: {
      list: () => links,
    },
    symlinkService,
    trashItem,
  });
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('GlobalSkillService', () => {
  it('lists every tool, including empty tools, and deduplicates shared roots', () => {
    const sharedRoot = createTemporaryDirectory();
    const missingRoot = path.join(createTemporaryDirectory(), 'missing');
    const centralRoot = createTemporaryDirectory();
    const managedPath = writeSkill(sharedRoot, 'managed-review');
    const externalPath = writeSkill(sharedRoot, 'external-review');

    const result = createService(
      [
        ide('codex-cli', 'Codex CLI', sharedRoot),
        ide('codex-desktop', 'Codex Desktop', sharedRoot),
        ide('cursor', 'Cursor', missingRoot),
      ],
      centralRoot,
      [
        {
          id: 'managed-review-__global__-codex-cli',
          skillId: 'managed-review',
          projectId: null,
          ideName: 'codex-cli',
          scope: 'global',
          sourcePath: path.join(centralRoot, 'managed-review'),
          destinationPath: managedPath,
          status: 'linked',
          createdAt: new Date().toISOString(),
        },
      ],
    ).scan();

    expect(result.tools).toHaveLength(3);
    expect(result.tools.find((tool) => tool.ideId === 'cursor')?.detected).toBe(false);
    expect(result.totalSkills).toBe(2);
    expect(result.managedCount).toBe(1);
    expect(result.externalCount).toBe(1);

    const sharedEntries = result.tools
      .filter((tool) => tool.ideId !== 'cursor')
      .flatMap((tool) => tool.skills);
    expect(sharedEntries).toHaveLength(4);
    expect(new Set(sharedEntries.map((entry) => entry.id)).size).toBe(2);
    expect(sharedEntries.find((entry) => entry.path === managedPath)?.origin).toBe('managed');
    expect(sharedEntries.find((entry) => entry.path === externalPath)?.origin).toBe('external');
    expect(sharedEntries.find((entry) => entry.path === externalPath)?.sharedWith).toEqual(
      expect.arrayContaining(['Codex CLI', 'Codex Desktop']),
    );
  });

  it('protects entries inside the central skills root', () => {
    const centralRoot = createTemporaryDirectory();
    const protectedPath = writeSkill(centralRoot, 'central-review');
    const service = createService(
      [ide('codex-cli', 'Codex CLI', centralRoot)],
      centralRoot,
      [],
      vi.fn(async () => undefined),
    );

    const entry = service.scan().tools[0].skills.find((item) => item.path === protectedPath);

    expect(entry?.status).toBe('protected');
  });

  it('keeps unreadable skill directories visible as broken entries', () => {
    const root = createTemporaryDirectory();
    const centralRoot = createTemporaryDirectory();
    fs.mkdirSync(path.join(root, 'broken-skill'));

    const result = createService([ide('cursor', 'Cursor', root)], centralRoot).scan();

    expect(result.tools[0].skills).toHaveLength(1);
    expect(result.tools[0].skills[0]).toMatchObject({
      name: 'broken-skill',
      status: 'broken',
    });
  });

  it('reads a bounded markdown preview for an inventory item', async () => {
    const root = createTemporaryDirectory();
    const centralRoot = createTemporaryDirectory();
    const skillPath = writeSkill(root, 'preview-me');
    const service = createService([ide('cursor', 'Cursor', root)], centralRoot);
    const entry = service.scan().tools[0].skills[0];

    const preview = await service.preview(entry.id);

    expect(preview.id).toBe(entry.id);
    expect(preview.path).toBe(skillPath);
    expect(preview.content).toContain('# Review');
  });

  it('limits previews to the configured content size', async () => {
    const root = createTemporaryDirectory();
    const centralRoot = createTemporaryDirectory();
    const largeContent = `${VALID_SKILL}${'x'.repeat(300 * 1024)}`;
    writeSkill(root, 'large-preview', largeContent);
    const service = createService([ide('cursor', 'Cursor', root)], centralRoot);
    const entry = service.scan().tools[0].skills[0];

    const preview = await service.preview(entry.id);

    expect(preview.content.length).toBe(256 * 1024);
    expect(preview.truncated).toBe(true);
  });

  it('removes only entries that belong to the current global inventory', async () => {
    const root = createTemporaryDirectory();
    const centralRoot = createTemporaryDirectory();
    writeSkill(root, 'remove-me');
    const trashItem = vi.fn(async () => undefined);
    const service = createService([ide('cursor', 'Cursor', root)], centralRoot, [], trashItem);
    const entry = service.scan().tools[0].skills[0];

    const results = await service.remove([entry.id, 'not-a-current-entry']);

    expect(results.map((result) => result.status)).toEqual(['trashed', 'already-missing']);
    expect(trashItem).toHaveBeenCalledTimes(1);
    expect(trashItem).toHaveBeenCalledWith(entry.path);
  });

  it('offers undo for a managed link and restores only the global entry', async () => {
    const root = createTemporaryDirectory();
    const centralRoot = createTemporaryDirectory();
    const sourcePath = writeSkill(centralRoot, 'restore-me');
    const destinationPath = path.join(root, 'restore-me');
    fs.symlinkSync(sourcePath, destinationPath, process.platform === 'win32' ? 'junction' : 'dir');
    const trashItem = vi.fn(async (targetPath: string) => {
      fs.rmSync(targetPath, { recursive: false, force: true });
    });
    const symlinkService = {
      createExclusive: vi.fn(() => ({ success: true, strategy: 'junction' })),
    };
    const service = createService(
      [ide('cursor', 'Cursor', root)],
      centralRoot,
      [{
        id: 'restore-me-__global__-cursor',
        skillId: 'restore-me',
        projectId: null,
        ideName: 'cursor',
        scope: 'global',
        sourcePath,
        destinationPath,
        status: 'linked',
        createdAt: new Date().toISOString(),
      }],
      trashItem,
      symlinkService,
    );

    const entry = service.scan().tools[0].skills[0];
    const [removal] = await service.remove([entry.id]);

    expect(removal).toMatchObject({ status: 'trashed', canUndo: true });
    expect(removal.undoToken).toEqual(expect.any(String));

    const [undo] = await service.undo([removal.undoToken!]);

    expect(undo).toMatchObject({ status: 'restored', path: destinationPath });
    expect(symlinkService.createExclusive).toHaveBeenCalledWith(sourcePath, destinationPath, 'auto');
  });

  it('does not trash a real directory that only has stale managed metadata', async () => {
    const root = createTemporaryDirectory();
    const centralRoot = createTemporaryDirectory();
    const destinationPath = writeSkill(root, 'stale-managed');
    const trashItem = vi.fn(async () => undefined);
    const service = createService(
      [ide('cursor', 'Cursor', root)],
      centralRoot,
      [{
        id: 'stale-managed-__global__-cursor',
        skillId: 'stale-managed',
        projectId: null,
        ideName: 'cursor',
        scope: 'global',
        sourcePath: path.join(centralRoot, 'stale-managed'),
        destinationPath,
        status: 'linked',
        createdAt: new Date().toISOString(),
      }],
      trashItem,
    );

    const entry = service.scan().tools[0].skills[0];
    const [result] = await service.remove([entry.id]);

    expect(result.status).toBe('blocked');
    expect(trashItem).not.toHaveBeenCalled();
  });
});
