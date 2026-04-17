import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings, CreateLinkInput } from '../types/domain';
import {
  IPCHandlerDependencies,
  registerIPCHandlers,
  resolveLinkDestination,
} from './handlers';

type Handler = (event: any, ...args: any[]) => any;

const defaultSettings: AppSettings = {
  centralSkillsRoot: 'C:/skills',
  checkForUpdates: true,
  autoScanProjects: true,
  symlinkStrategy: 'auto',
  developerModeEnabled: false,
  theme: 'dark',
  ideRootOverrides: {},
  githubToken: '',
};

const createHarness = (overrides: Partial<IPCHandlerDependencies> = {}) => {
  const handlers = new Map<string, Handler>();

  const skill = {
    id: 'brainstorming',
    name: 'brainstorming',
    displayName: 'Brainstorming',
    sourcePath: 'C:/skills/brainstorming',
  };

  const project = {
    id: 'skills-manager',
    path: 'C:/repo/skills-manager',
  };

  const ide = {
    id: 'claude-code',
    roots: {
      primaryGlobal: ['~/.claude'],
      projectRelative: ['.claude/agents'],
    },
  };

  const skillService = {
    list: vi.fn(() => [skill]),
    get: vi.fn((id: string) => (id === skill.id ? skill : null)),
    create: vi.fn((input: any) => input),
    update: vi.fn((id: string, input: any) => ({ id, ...input })),
    delete: vi.fn(),
    scan: vi.fn(() => []),
    getContent: vi.fn(() => '# SKILL'),
    saveContent: vi.fn(),
    listFiles: vi.fn(() => []),
    readFile: vi.fn(() => 'content'),
    writeFile: vi.fn(),
    deleteFile: vi.fn(),
    getSkillPath: vi.fn(() => 'C:/skills/brainstorming'),
  };

  const deps: IPCHandlerDependencies = {
    ipcMain: {
      handle: vi.fn((channel: string, listener: Handler) => {
        handlers.set(channel, listener);
      }),
    },
    dialog: {
      showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['C:/repo'] })),
    },
    shell: {
      openPath: vi.fn(async () => ''),
    },
    settingsService: {
      get: vi.fn(() => defaultSettings),
      update: vi.fn((input: any) => ({ ...defaultSettings, ...input })),
    },
    projectService: {
      list: vi.fn(() => [project]),
      add: vi.fn((projectPath: string) => ({ id: 'id', path: projectPath })),
      remove: vi.fn(),
      scan: vi.fn(() => []),
    },
    symlinkService: {
      create: vi.fn(() => ({ success: true, strategy: 'junction' })),
      remove: vi.fn(() => true),
      verify: vi.fn(() => ({ valid: true })),
      checkPermissions: vi.fn(() => ({ canCreate: true })),
    },
    linkService: {
      list: vi.fn(() => []),
      create: vi.fn((input: CreateLinkInput, sourcePath: string, destinationPath: string) => ({
        id: `${input.skillId}-${input.projectId}-${input.ideName}`,
        scope: input.scope,
        destinationPath,
        sourcePath,
      })),
      get: vi.fn(),
      remove: vi.fn(() => true),
      removeMultiple: vi.fn((ids: string[]) => ids.map((id) => ({ id, success: true }))),
      verify: vi.fn(() => ({ valid: true })),
      verifyAll: vi.fn(() => []),
    },
    ideService: {
      list: vi.fn(() => [ide]),
      detectRoots: vi.fn(() => []),
    },
    detectionService: {
      checkDuplicates: vi.fn(() => ({ hasDuplicate: false })),
    },
    githubImportService: {
      parseGitHubUrl: vi.fn((url: string) => ({ owner: 'acme', repo: url })),
      analyze: vi.fn(async () => ({ skills: [] })),
      checkConflicts: vi.fn(() => ({})),
      importSkills: vi.fn(async () => []),
      cancelImport: vi.fn(),
    },
    createSkillService: vi.fn(() => skillService),
    expandPath: vi.fn((input: string) => input.replace('~', 'C:/Users/test')),
    platform: 'linux',
    log: { log: vi.fn(), error: vi.fn() },
  };

  const merged = { ...deps, ...overrides } as IPCHandlerDependencies;
  registerIPCHandlers(merged);

  const invoke = async (channel: string, ...args: any[]) => {
    const handler = handlers.get(channel);
    if (!handler) {
      throw new Error(`Missing handler for ${channel}`);
    }
    return handler({ sender: { send: vi.fn() } }, ...args);
  };

  const invokeWithSender = async (channel: string, sender: { send: ReturnType<typeof vi.fn> }, ...args: any[]) => {
    const handler = handlers.get(channel);
    if (!handler) {
      throw new Error(`Missing handler for ${channel}`);
    }
    return handler({ sender }, ...args);
  };

  return {
    handlers,
    deps: merged,
    skillService,
    invoke,
    invokeWithSender,
  };
};

describe('resolveLinkDestination', () => {
  it('builds global destination using expanded root', () => {
    const destination = resolveLinkDestination(
      'brainstorming',
      'C:/repo/project',
      {
        roots: {
          primaryGlobal: ['~/.claude'],
          projectRelative: ['.claude/agents'],
        },
      },
      'global',
      (value) => value.replace('~', 'C:/Users/me'),
    );

    expect(destination).toContain(path.normalize('C:/Users/me'));
    expect(destination).toContain('brainstorming');
  });

  it('builds project destination for project scope', () => {
    const destination = resolveLinkDestination(
      'brainstorming',
      'C:/repo/project',
      {
        roots: {
          primaryGlobal: ['~/.claude'],
          projectRelative: ['.claude/agents'],
        },
      },
      'project',
    );

    expect(destination).toContain(path.normalize('C:/repo/project'));
    expect(destination).toContain('.claude');
  });
});

describe('registerIPCHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers expected handler channels', () => {
    const { handlers } = createHarness();

    expect(handlers.has('skills:list')).toBe(true);
    expect(handlers.has('links:create')).toBe(true);
    expect(handlers.has('links:createMultiple')).toBe(true);
    expect(handlers.has('dialog:selectFolder')).toBe(true);
    expect(handlers.has('github:analyze')).toBe(true);
  });

  it('returns null for canceled folder dialog', async () => {
    const harness = createHarness({
      dialog: {
        showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
      },
    });

    await expect(harness.invoke('dialog:selectFolder')).resolves.toBeNull();
  });

  it('returns selected folder when dialog succeeds', async () => {
    const harness = createHarness({
      dialog: {
        showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['C:/project'] })),
      },
    });

    await expect(harness.invoke('dialog:selectFolder')).resolves.toBe('C:/project');
    expect(harness.deps.dialog.showOpenDialog).toHaveBeenCalledWith({
      properties: ['openDirectory'],
      defaultPath: undefined,
      title: 'Select Project Directory',
    });
  });

  it('passes dialog options through when selecting folder', async () => {
    const harness = createHarness({
      dialog: {
        showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['C:/custom'] })),
      },
    });

    await expect(
      harness.invoke('dialog:selectFolder', { defaultPath: 'C:/base', title: 'Pick folder' }),
    ).resolves.toBe('C:/custom');
    expect(harness.deps.dialog.showOpenDialog).toHaveBeenCalledWith({
      properties: ['openDirectory'],
      defaultPath: 'C:/base',
      title: 'Pick folder',
    });
  });

  it('throws when links:create cannot find skill/project/or ide', async () => {
    const missingSkillHarness = createHarness({
      createSkillService: vi.fn(() => ({
        ...harnessBaseSkillService(),
        get: vi.fn(() => null),
      })),
    });

    await expect(
      missingSkillHarness.invoke('links:create', {
        skillId: 'missing-skill',
        projectId: 'skills-manager',
        ideName: 'claude-code',
        scope: 'project',
      }),
    ).rejects.toThrow('Skill "missing-skill" not found');

    const missingProjectHarness = createHarness({
      projectService: {
        list: vi.fn(() => []),
        add: vi.fn(),
        remove: vi.fn(),
        scan: vi.fn(() => []),
      },
    });

    await expect(
      missingProjectHarness.invoke('links:create', {
        skillId: 'brainstorming',
        projectId: 'missing-project',
        ideName: 'claude-code',
        scope: 'project',
      }),
    ).rejects.toThrow('Project "missing-project" not found');

    const missingIdeHarness = createHarness({
      ideService: {
        list: vi.fn(() => []),
        detectRoots: vi.fn(() => []),
      },
    });

    await expect(
      missingIdeHarness.invoke('links:create', {
        skillId: 'brainstorming',
        projectId: 'skills-manager',
        ideName: 'missing-ide',
        scope: 'project',
      }),
    ).rejects.toThrow('IDE "missing-ide" not found');
  });

  it('throws when links:create symlink creation fails', async () => {
    const harness = createHarness({
      symlinkService: {
        create: vi.fn(() => ({ success: false, strategy: 'none', error: 'Access denied' })),
        remove: vi.fn(() => true),
        verify: vi.fn(() => ({ valid: true })),
        checkPermissions: vi.fn(() => ({ canCreate: true })),
      },
    });

    await expect(
      harness.invoke('links:create', {
        skillId: 'brainstorming',
        projectId: 'skills-manager',
        ideName: 'claude-code',
        scope: 'project',
      }),
    ).rejects.toThrow('Failed to create symlink: Access denied');
    expect(harness.deps.linkService.create).not.toHaveBeenCalled();
  });

  it('uses junction strategy when configured and falls back invalid setting to auto', async () => {
    const makeHarness = (symlinkStrategy: AppSettings['symlinkStrategy'] | 'invalid') =>
      createHarness({
        settingsService: {
          get: vi.fn(() => ({ ...defaultSettings, symlinkStrategy: symlinkStrategy as any })),
          update: vi.fn((input: any) => ({ ...defaultSettings, ...input })),
        },
      });

    const junctionHarness = makeHarness('junction');
    await junctionHarness.invoke('links:create', {
      skillId: 'brainstorming',
      projectId: 'skills-manager',
      ideName: 'claude-code',
      scope: 'project',
    });
    expect(junctionHarness.deps.symlinkService.create).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'junction',
    );

    const autoHarness = makeHarness('invalid');
    await autoHarness.invoke('links:create', {
      skillId: 'brainstorming',
      projectId: 'skills-manager',
      ideName: 'claude-code',
      scope: 'project',
    });
    expect(autoHarness.deps.symlinkService.create).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'auto',
    );
  });

  it('blocks links:create on windows when symlink permissions fail', async () => {
    const harness = createHarness({
      platform: 'win32',
      symlinkService: {
        create: vi.fn(() => ({ success: true, strategy: 'junction' })),
        remove: vi.fn(() => true),
        verify: vi.fn(() => ({ valid: true })),
        checkPermissions: vi.fn(() => ({ canCreate: false, message: 'Permission denied' })),
      },
    });

    await expect(
      harness.invoke('links:create', {
        skillId: 'brainstorming',
        projectId: 'skills-manager',
        ideName: 'claude-code',
        scope: 'project',
      }),
    ).rejects.toThrow('Permission denied');
  });

  it('blocks links:create for global destination conflict', async () => {
    const conflictDestination = resolveLinkDestination(
      'brainstorming',
      'C:/repo/skills-manager',
      {
        roots: {
          primaryGlobal: ['~/.claude'],
          projectRelative: ['.claude/agents'],
        },
      },
      'global',
      (input) => input.replace('~', 'C:/Users/test'),
    );

    const harness = createHarness({
      linkService: {
        list: vi.fn(() => [
          {
            id: 'existing-global',
            scope: 'global',
            destinationPath: conflictDestination,
          },
        ]),
        create: vi.fn(),
        get: vi.fn(),
        remove: vi.fn(() => true),
        removeMultiple: vi.fn(() => []),
        verify: vi.fn(() => ({ valid: true })),
        verifyAll: vi.fn(() => []),
      },
    });

    await expect(
      harness.invoke('links:create', {
        skillId: 'brainstorming',
        projectId: 'skills-manager',
        ideName: 'claude-code',
        scope: 'global',
      }),
    ).rejects.toThrow('Global destination already linked: existing-global');

    expect(harness.deps.symlinkService.create).not.toHaveBeenCalled();
  });

  it('rolls back symlink when links:create persistence fails', async () => {
    const harness = createHarness({
      linkService: {
        list: vi.fn(() => []),
        create: vi.fn(() => {
          throw new Error('DB write failed');
        }),
        get: vi.fn(),
        remove: vi.fn(() => true),
        removeMultiple: vi.fn(() => []),
        verify: vi.fn(() => ({ valid: true })),
        verifyAll: vi.fn(() => []),
      },
      symlinkService: {
        create: vi.fn(() => ({ success: true, strategy: 'junction' })),
        remove: vi.fn(() => true),
        verify: vi.fn(() => ({ valid: true })),
        checkPermissions: vi.fn(() => ({ canCreate: true })),
      },
    });

    await expect(
      harness.invoke('links:create', {
        skillId: 'brainstorming',
        projectId: 'skills-manager',
        ideName: 'claude-code',
        scope: 'project',
      }),
    ).rejects.toThrow('DB write failed');

    expect(harness.deps.symlinkService.remove).toHaveBeenCalledTimes(1);
  });

  it('throws createMultiple when project or ide is missing', async () => {
    const missingProjectHarness = createHarness({
      projectService: {
        list: vi.fn(() => []),
        add: vi.fn(),
        remove: vi.fn(),
        scan: vi.fn(() => []),
      },
    });
    await expect(
      missingProjectHarness.invoke('links:createMultiple', {
        skillIds: ['s1'],
        projectId: 'missing',
        ideName: 'claude-code',
        scope: 'project',
      }),
    ).rejects.toThrow('Project "missing" not found');

    const missingIdeHarness = createHarness({
      ideService: {
        list: vi.fn(() => []),
        detectRoots: vi.fn(() => []),
      },
    });
    await expect(
      missingIdeHarness.invoke('links:createMultiple', {
        skillIds: ['s1'],
        projectId: 'skills-manager',
        ideName: 'missing',
        scope: 'project',
      }),
    ).rejects.toThrow('IDE "missing" not found');
  });

  it('skips createMultiple global links with destination conflicts', async () => {
    const destination = resolveLinkDestination(
      's1',
      'C:/repo/skills-manager',
      {
        roots: { primaryGlobal: ['~/.claude'], projectRelative: ['.claude/agents'] },
        id: 'claude-code',
      },
      'global',
      (value) => value.replace('~', 'C:/Users/test'),
    );

    const harness = createHarness({
      createSkillService: vi.fn(() => ({
        ...harnessBaseSkillService(),
        get: vi.fn((id: string) => ({
          id,
          name: id,
          displayName: id.toUpperCase(),
          sourcePath: `C:/skills/${id}`,
        })),
      })),
      linkService: {
        list: vi.fn(() => [
          { id: 'already-there', scope: 'global', destinationPath: destination },
        ]),
        create: vi.fn(),
        get: vi.fn(),
        remove: vi.fn(() => true),
        removeMultiple: vi.fn(() => []),
        verify: vi.fn(() => ({ valid: true })),
        verifyAll: vi.fn(() => []),
      },
    });

    const result = await harness.invoke('links:createMultiple', {
      skillIds: ['s1'],
      projectId: 'skills-manager',
      ideName: 'claude-code',
      scope: 'global',
    });

    expect(result).toEqual([
      {
        skillId: 's1',
        skillName: 'S1',
        status: 'skipped',
        error: 'Global destination already linked: already-there',
      },
    ]);
    expect(harness.deps.symlinkService.create).not.toHaveBeenCalled();
  });

  it('rolls back symlink in createMultiple when persistence fails', async () => {
    const sender = { send: vi.fn() };
    const harness = createHarness({
      createSkillService: vi.fn(() => ({
        ...harnessBaseSkillService(),
        get: vi.fn((id: string) => ({
          id,
          name: id,
          displayName: id.toUpperCase(),
          sourcePath: `C:/skills/${id}`,
        })),
      })),
      linkService: {
        list: vi.fn(() => []),
        create: vi.fn(() => {
          throw new Error('Persistence failure');
        }),
        get: vi.fn(),
        remove: vi.fn(() => true),
        removeMultiple: vi.fn(() => []),
        verify: vi.fn(() => ({ valid: true })),
        verifyAll: vi.fn(() => []),
      },
      symlinkService: {
        create: vi.fn(() => ({ success: true, strategy: 'junction' })),
        remove: vi.fn(() => true),
        verify: vi.fn(() => ({ valid: true })),
        checkPermissions: vi.fn(() => ({ canCreate: true })),
      },
    });

    const results = await harness.invokeWithSender('links:createMultiple', sender, {
      skillIds: ['s3'],
      projectId: 'skills-manager',
      ideName: 'claude-code',
      scope: 'project',
    });

    expect(results).toEqual([
      {
        skillId: 's3',
        skillName: 'S3',
        status: 'error',
        error: 'Persistence failure',
      },
    ]);
    expect(harness.deps.symlinkService.remove).toHaveBeenCalledTimes(1);
  });

  it('removes only destinations not referenced after removeMultiple', async () => {
    const harness = createHarness({
      linkService: {
        list: vi.fn(() => [
          { id: 'a', scope: 'project', destinationPath: 'C:/dest/shared' },
          { id: 'b', scope: 'project', destinationPath: 'C:/dest/shared' },
          { id: 'c', scope: 'project', destinationPath: 'C:/dest/unique' },
        ]),
        create: vi.fn(),
        get: vi.fn(),
        remove: vi.fn(() => true),
        removeMultiple: vi.fn(() => [
          { id: 'a', success: true },
          { id: 'c', success: true },
        ]),
        verify: vi.fn(() => ({ valid: true })),
        verifyAll: vi.fn(() => []),
      },
      symlinkService: {
        create: vi.fn(() => ({ success: true, strategy: 'junction' })),
        remove: vi.fn(() => true),
        verify: vi.fn(() => ({ valid: true })),
        checkPermissions: vi.fn(() => ({ canCreate: true })),
      },
    });

    const result = await harness.invoke('links:removeMultiple', ['a', 'c']);

    expect(result).toEqual([
      { id: 'a', success: true },
      { id: 'c', success: true },
    ]);
    expect(harness.deps.symlinkService.remove).toHaveBeenCalledTimes(1);
    expect(harness.deps.symlinkService.remove).toHaveBeenCalledWith('C:/dest/unique');
  });

  it('returns structured error payload for github parse/analyze failures', async () => {
    const harness = createHarness({
      githubImportService: {
        parseGitHubUrl: vi.fn(() => {
          throw new Error('Invalid URL');
        }),
        analyze: vi.fn(async () => {
          throw Object.assign(new Error('Rate limited'), { isRateLimit: true });
        }),
        checkConflicts: vi.fn(() => ({})),
        importSkills: vi.fn(async () => []),
        cancelImport: vi.fn(),
      },
    });

    await expect(harness.invoke('github:parseUrl', 'not-a-url')).resolves.toEqual({
      error: true,
      message: 'Invalid URL',
    });

    await expect(harness.invoke('github:analyze', { owner: 'x', repo: 'y' })).resolves.toEqual({
      error: true,
      message: 'Rate limited',
      isRateLimit: true,
    });
  });

  it('processes links:createMultiple mix of error/skip/create and emits progress', async () => {
    const sender = { send: vi.fn() };

    const harness = createHarness({
      createSkillService: vi.fn(() => ({
        ...harnessBaseSkillService(),
        get: vi.fn((id: string) => {
          if (id === 'missing') return null;
          return {
            id,
            name: id,
            displayName: id.toUpperCase(),
            sourcePath: `C:/skills/${id}`,
          };
        }),
      })),
      linkService: {
        list: vi.fn(() => [{ id: 's1-skills-manager-claude-code', scope: 'project', destinationPath: 'x' }]),
        create: vi.fn((input: CreateLinkInput, sourcePath: string, destinationPath: string) => ({
          id: `${input.skillId}-${input.projectId}-${input.ideName}`,
          scope: input.scope,
          destinationPath,
          sourcePath,
        })),
        get: vi.fn(),
        remove: vi.fn(() => true),
        removeMultiple: vi.fn(() => []),
        verify: vi.fn(() => ({ valid: true })),
        verifyAll: vi.fn(() => []),
      },
      symlinkService: {
        create: vi.fn((source: string) => {
          if (source.includes('/s2')) {
            return { success: false, strategy: 'none', error: 'Disk full' };
          }
          return { success: true, strategy: 'junction' };
        }),
        remove: vi.fn(() => true),
        verify: vi.fn(() => ({ valid: true })),
        checkPermissions: vi.fn(() => ({ canCreate: true })),
      },
    });

    const results = await harness.invokeWithSender('links:createMultiple', sender, {
      skillIds: ['missing', 's1', 's2', 's3'],
      projectId: 'skills-manager',
      ideName: 'claude-code',
      scope: 'project',
    });

    expect(results).toEqual([
      { skillId: 'missing', skillName: 'missing', status: 'error', error: 'Skill not found' },
      { skillId: 's1', skillName: 'S1', status: 'skipped', error: 'Link already exists' },
      { skillId: 's2', skillName: 'S2', status: 'error', error: 'Disk full' },
      expect.objectContaining({ skillId: 's3', skillName: 'S3', status: 'created' }),
    ]);

    expect(sender.send).toHaveBeenCalledWith(
      'links:createProgress',
      expect.objectContaining({ currentSkillName: 'S2' }),
    );
    expect(sender.send).toHaveBeenCalledWith(
      'links:createProgress',
      expect.objectContaining({ currentSkillName: 'S3', percentComplete: 100 }),
    );
  });

  it('returns permission errors for all skills on createMultiple win32 pre-check', async () => {
    const harness = createHarness({
      platform: 'win32',
      symlinkService: {
        create: vi.fn(() => ({ success: true, strategy: 'junction' })),
        remove: vi.fn(() => true),
        verify: vi.fn(() => ({ valid: true })),
        checkPermissions: vi.fn(() => ({ canCreate: false, message: 'Need dev mode' })),
      },
    });

    const results = await harness.invoke('links:createMultiple', {
      skillIds: ['s1', 's2'],
      projectId: 'skills-manager',
      ideName: 'claude-code',
      scope: 'project',
    });

    expect(results).toEqual([
      { skillId: 's1', skillName: 's1', status: 'error', error: 'Need dev mode' },
      { skillId: 's2', skillName: 's2', status: 'error', error: 'Need dev mode' },
    ]);
  });

  it('delegates across non-link handlers and simple link operations', async () => {
    const harness = createHarness({
      linkService: {
        list: vi.fn(() => [
          { id: 'l1', scope: 'project', destinationPath: 'C:/dest/shared' },
          { id: 'l2', scope: 'project', destinationPath: 'C:/dest/shared' },
        ]),
        create: vi.fn(),
        get: vi.fn((id: string) => ({ id, scope: 'project', destinationPath: 'C:/dest/shared' })),
        remove: vi.fn(() => true),
        removeMultiple: vi.fn(() => []),
        verify: vi.fn(() => ({ valid: true })),
        verifyAll: vi.fn(() => []),
      },
      githubImportService: {
        parseGitHubUrl: vi.fn((url: string) => ({ owner: 'acme', repo: url })),
        analyze: vi.fn(async () => ({ skills: [] })),
        checkConflicts: vi.fn(() => ({ alpha: true })),
        importSkills: vi.fn(async () => [{ skillName: 'x', status: 'imported' }]),
        cancelImport: vi.fn(),
      },
    });

    await expect(harness.invoke('skills:list')).resolves.toEqual([
      expect.objectContaining({ id: 'brainstorming' }),
    ]);
    await expect(harness.invoke('skills:get', 'brainstorming')).resolves.toEqual(
      expect.objectContaining({ id: 'brainstorming' }),
    );
    await harness.invoke('skills:create', { name: 'x' });
    await harness.invoke('skills:update', 'brainstorming', { description: 'd' });
    await harness.invoke('skills:delete', 'brainstorming');
    await harness.invoke('skills:scan');
    await harness.invoke('skills:getContent', 'brainstorming');
    await harness.invoke('skills:saveContent', 'brainstorming', '# changed');
    await harness.invoke('skills:listFiles', 'brainstorming');
    await harness.invoke('skills:readFile', 'brainstorming', 'README.md');
    await harness.invoke('skills:writeFile', 'brainstorming', 'README.md', 'body');
    await harness.invoke('skills:deleteFile', 'brainstorming', 'README.md');
    await harness.invoke('skills:getPath', 'brainstorming');
    await harness.invoke('skills:openFolder', 'brainstorming');

    await harness.invoke('projects:list');
    await harness.invoke('projects:add', 'C:/repo/new');
    await harness.invoke('projects:remove', 'skills-manager');
    await harness.invoke('projects:scan', 'C:/repo');

    await harness.invoke('links:list');
    await harness.invoke('links:verify', 'l1');
    await harness.invoke('links:verifyAll');
    await expect(harness.invoke('links:remove', 'missing')).resolves.toEqual({ success: false });
    await expect(harness.invoke('links:remove', 'l1')).resolves.toEqual({ success: true });

    await harness.invoke('ides:list');
    await harness.invoke('ides:detect-roots');
    await harness.invoke('detection:check-duplicates', 's1', 'p1', 'ide');

    await harness.invoke('settings:get');
    await harness.invoke('settings:update', { theme: 'light' });

    await harness.invoke('github:parseUrl', 'acme/repo');
    await harness.invoke('github:analyze', { owner: 'acme', repo: 'repo' });
    await harness.invoke('github:checkConflicts', ['alpha']);
    await harness.invokeWithSender(
      'github:importSkills',
      { send: vi.fn() },
      { parsed: {}, skills: [], resolutions: {} },
    );
    await harness.invoke('github:cancelImport');

    expect(harness.deps.shell.openPath).toHaveBeenCalled();
    expect(harness.deps.settingsService.update).toHaveBeenCalledWith({ theme: 'light' });
    expect(harness.deps.githubImportService.cancelImport).toHaveBeenCalledTimes(1);
  });

  it('handles remove dedupe and github import error fallback payload', async () => {
    const sender = { send: vi.fn() };
    const harness = createHarness({
      linkService: {
        list: vi.fn(() => [
          { id: 'l1', scope: 'project', destinationPath: 'C:/dest/shared' },
          { id: 'l2', scope: 'project', destinationPath: 'C:/dest/shared' },
          { id: 'l3', scope: 'project', destinationPath: 'C:/dest/unique' },
        ]),
        create: vi.fn(),
        get: vi.fn((id: string) => ({ id, scope: 'project', destinationPath: id === 'l3' ? 'C:/dest/unique' : 'C:/dest/shared' })),
        remove: vi.fn(() => true),
        removeMultiple: vi.fn(() => []),
        verify: vi.fn(() => ({ valid: true })),
        verifyAll: vi.fn(() => []),
      },
      githubImportService: {
        parseGitHubUrl: vi.fn((url: string) => ({ owner: 'acme', repo: url })),
        analyze: vi.fn(async () => ({ skills: [] })),
        checkConflicts: vi.fn(() => ({})),
        importSkills: vi.fn(async () => {
          throw new Error('download failed');
        }),
        cancelImport: vi.fn(),
      },
      symlinkService: {
        create: vi.fn(() => ({ success: true, strategy: 'junction' })),
        remove: vi.fn(() => true),
        verify: vi.fn(() => ({ valid: true })),
        checkPermissions: vi.fn(() => ({ canCreate: true })),
      },
    });

    await expect(harness.invoke('links:remove', 'l1')).resolves.toEqual({ success: true });
    expect(harness.deps.symlinkService.remove).not.toHaveBeenCalledWith('C:/dest/shared');

    await expect(harness.invoke('links:remove', 'l3')).resolves.toEqual({ success: true });
    expect(harness.deps.symlinkService.remove).toHaveBeenCalledWith('C:/dest/unique');

    await expect(
      harness.invokeWithSender('github:importSkills', sender, { parsed: {}, skills: [], resolutions: {} }),
    ).resolves.toEqual([
      { skillName: 'unknown', status: 'error', error: 'download failed' },
    ]);
  });

  it('forwards github import progress events while importing', async () => {
    const sender = { send: vi.fn() };
    const harness = createHarness({
      githubImportService: {
        parseGitHubUrl: vi.fn((url: string) => ({ owner: 'acme', repo: url })),
        analyze: vi.fn(async () => ({ skills: [] })),
        checkConflicts: vi.fn(() => ({})),
        importSkills: vi.fn(async (_parsed: any, _skills: any[], _resolutions: Record<string, any>, onProgress: (progress: any) => void) => {
          onProgress({ current: 1, total: 1, phase: 'fetching', currentSkillName: 'S1' });
          return [{ skillName: 'S1', status: 'imported' }];
        }),
        cancelImport: vi.fn(),
      },
    });

    const result = await harness.invokeWithSender(
      'github:importSkills',
      sender,
      { parsed: { owner: 'acme', repo: 'skills' }, skills: [{ name: 's1' }], resolutions: {} },
    );

    expect(result).toEqual([{ skillName: 'S1', status: 'imported' }]);
    expect(sender.send).toHaveBeenCalledWith(
      'github:importProgress',
      expect.objectContaining({ current: 1, total: 1 }),
    );
  });
});

function harnessBaseSkillService() {
  return {
    list: vi.fn(() => []),
    get: vi.fn(() => null),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    scan: vi.fn(() => []),
    getContent: vi.fn(() => ''),
    saveContent: vi.fn(),
    listFiles: vi.fn(() => []),
    readFile: vi.fn(() => ''),
    writeFile: vi.fn(),
    deleteFile: vi.fn(),
    getSkillPath: vi.fn(() => ''),
  };
}
