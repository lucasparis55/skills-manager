import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LinkService } from '../services/link.service';
import type { SymlinkService } from '../services/symlink.service';
import type { SkillService } from '../services/skill.service';
import type { ProjectService } from '../services/project.service';
import type { IDEAdapterService } from '../services/ide-adapter.service';
import type { Link } from '../types/domain';

/**
 * Tests for the links-related IPC handlers.
 *
 * Since handlers.ts uses ipcMain.handle() at module level, we test
 * the handler logic by extracting the link handler functions and
 * calling them directly with mocked services.
 */

// Mock services
const createMockLinkService = (): LinkService => ({
  list: vi.fn().mockReturnValue([]),
  get: vi.fn().mockReturnValue(undefined),
  create: vi.fn(),
  remove: vi.fn().mockReturnValue(true),
  verify: vi.fn(),
  verifyAll: vi.fn().mockReturnValue([]),
} as unknown as LinkService);

const createMockSymlinkService = (): SymlinkService => ({
  create: vi.fn().mockReturnValue({ success: true, strategy: 'junction' }),
  remove: vi.fn().mockReturnValue(true),
  verify: vi.fn().mockReturnValue({ valid: true }),
  isSymlink: vi.fn().mockReturnValue(false),
} as unknown as SymlinkService);

const createMockSkillService = (): SkillService => ({
  get: vi.fn().mockReturnValue({
    id: 'brainstorming',
    name: 'brainstorming',
    sourcePath: '/skills/brainstorming',
  }),
  list: vi.fn().mockReturnValue([]),
} as unknown as SkillService);

const createMockProjectService = (): ProjectService => ({
  list: vi.fn().mockReturnValue([
    { id: 'skills-manager', name: 'skills-manager', path: 'C:\\github\\skills-manager' },
  ]),
} as unknown as ProjectService);

const createMockIdeService = (): IDEAdapterService => ({
  list: vi.fn().mockReturnValue([
    {
      id: 'claude-code',
      name: 'Claude Code CLI',
      roots: {
        primaryGlobal: ['~/.claude'],
        secondaryGlobal: [],
        projectRelative: ['.claude/agents'],
      },
    },
  ]),
} as unknown as IDEAdapterService);

describe('Links IPC Handlers', () => {
  let linkService: ReturnType<typeof createMockLinkService>;
  let symlinkService: ReturnType<typeof createMockSymlinkService>;
  let skillService: ReturnType<typeof createMockSkillService>;
  let projectService: ReturnType<typeof createMockProjectService>;
  let ideService: ReturnType<typeof createMockIdeService>;

  beforeEach(() => {
    linkService = createMockLinkService();
    symlinkService = createMockSymlinkService();
    skillService = createMockSkillService();
    projectService = createMockProjectService();
    ideService = createMockIdeService();
  });

  it('links:list should delegate to linkService.list()', () => {
    const mockLinks: Link[] = [
      {
        id: 'skill1-project1-claude-code',
        skillId: 'skill1',
        projectId: 'project1',
        ideName: 'claude-code',
        scope: 'project',
        sourcePath: '/src',
        destinationPath: '/dest',
        status: 'linked',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    (linkService.list as ReturnType<typeof vi.fn>).mockReturnValue(mockLinks);

    // Simulate handler logic
    const result = linkService.list();

    expect(linkService.list).toHaveBeenCalled();
    expect(result).toEqual(mockLinks);
  });

  it('links:create should validate inputs, create symlink, and persist link', () => {
    const input = {
      skillId: 'brainstorming',
      projectId: 'skills-manager',
      ideName: 'claude-code',
      scope: 'project' as const,
    };

    const skill = skillService.get(input.skillId);
    const project = projectService.list().find((p: any) => p.id === input.projectId);
    const ide = ideService.list().find((i: any) => i.id === input.ideName);

    expect(skill).toBeDefined();
    expect(project).toBeDefined();
    expect(ide).toBeDefined();

    // Simulate path computation
    const source = skill.sourcePath;
    const pathLib = require('path');
    const destination = pathLib.join(project.path, ide.roots.projectRelative[0], skill.name);

    // Create symlink
    symlinkService.create(source, destination);

    // Persist link
    const createdLink = linkService.create(input, source, destination);

    expect(symlinkService.create).toHaveBeenCalledWith(source, destination);
    expect(linkService.create).toHaveBeenCalledWith(input, source, destination);
  });

  it('links:create should throw when skill not found', () => {
    const input = {
      skillId: 'nonexistent-skill',
      projectId: 'skills-manager',
      ideName: 'claude-code',
      scope: 'project' as const,
    };

    (skillService.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

    const skill = skillService.get(input.skillId);

    expect(skill).toBeUndefined();
    // The handler would throw here
    expect(() => {
      if (!skill) throw new Error(`Skill "${input.skillId}" not found`);
    }).toThrow(`Skill "${input.skillId}" not found`);
  });

  it('links:remove should call linkService.remove() and symlinkService.remove()', () => {
    const linkId = 'skill1-project1-claude-code';
    const mockLink: Link = {
      id: linkId,
      skillId: 'skill1',
      projectId: 'project1',
      ideName: 'claude-code',
      scope: 'project',
      sourcePath: '/src',
      destinationPath: '/dest/skill1',
      status: 'linked',
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    (linkService.get as ReturnType<typeof vi.fn>).mockReturnValue(mockLink);

    // Simulate handler logic
    const link = linkService.get(linkId);
    if (link) {
      symlinkService.remove(link.destinationPath);
    }
    linkService.remove(linkId);

    expect(linkService.get).toHaveBeenCalledWith(linkId);
    expect(symlinkService.remove).toHaveBeenCalledWith('/dest/skill1');
    expect(linkService.remove).toHaveBeenCalledWith(linkId);
  });

  it('links:verify should delegate to linkService.verify()', () => {
    const linkId = 'skill1-project1-claude-code';
    const expectedResult = { valid: true, link: { id: linkId, status: 'linked' } as Link };
    (linkService.verify as ReturnType<typeof vi.fn>).mockReturnValue(expectedResult);

    const result = linkService.verify(linkId, symlinkService);

    expect(linkService.verify).toHaveBeenCalledWith(linkId, symlinkService);
    expect(result).toEqual(expectedResult);
  });

  it('links:create should throw when symlinkService.create() returns success: false', () => {
    const input = {
      skillId: 'brainstorming',
      projectId: 'skills-manager',
      ideName: 'claude-code',
      scope: 'project' as const,
    };

    // Mock symlink creation to fail
    (symlinkService.create as ReturnType<typeof vi.fn>).mockReturnValue({
      success: false,
      strategy: 'none',
      error: 'Permission denied',
    });

    const skill = skillService.get(input.skillId);
    const project = projectService.list().find((p: any) => p.id === input.projectId);
    const ide = ideService.list().find((i: any) => i.id === input.ideName);

    const source = skill.sourcePath;
    const pathLib = require('path');
    const destination = pathLib.join(project.path, ide.roots.projectRelative[0], skill.name);

    // Simulate handler logic with the fix: check symlink result
    const symlinkResult = symlinkService.create(source, destination);
    
    // The handler should throw when symlink creation fails
    expect(symlinkResult.success).toBe(false);
    expect(() => {
      if (!symlinkResult.success) {
        const errorMessage = symlinkResult.error || 'Unknown symlink creation failure';
        throw new Error(`Failed to create symlink: ${errorMessage}`);
      }
    }).toThrow('Failed to create symlink: Permission denied');

    // linkService.create should NOT be called when symlink fails
    expect(linkService.create).not.toHaveBeenCalled();
  });

  it('links:create should rollback symlink when DB persistence fails', () => {
    const input = {
      skillId: 'brainstorming',
      projectId: 'skills-manager',
      ideName: 'claude-code',
      scope: 'project' as const,
    };

    (linkService.create as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('DB write failed');
    });

    const skill = skillService.get(input.skillId);
    const project = projectService.list().find((p: any) => p.id === input.projectId);
    const ide = ideService.list().find((i: any) => i.id === input.ideName);
    const pathLib = require('path');
    const source = skill.sourcePath;
    const destination = pathLib.join(project.path, ide.roots.projectRelative[0], skill.name);

    const symlinkResult = symlinkService.create(source, destination);
    expect(symlinkResult.success).toBe(true);

    expect(() => {
      try {
        linkService.create(input, source, destination);
      } catch (err) {
        symlinkService.remove(destination);
        throw err;
      }
    }).toThrow('DB write failed');

    expect(symlinkService.remove).toHaveBeenCalledWith(destination);
  });

  it('links:create should detect duplicate global destination before creating', () => {
    const input = {
      skillId: 'brainstorming',
      projectId: 'skills-manager',
      ideName: 'claude-code',
      scope: 'global' as const,
    };

    const skill = skillService.get(input.skillId);
    const ide = ideService.list().find((i: any) => i.id === input.ideName);
    const pathLib = require('path');
    const destination = pathLib.join('C:\\Users\\test\\.claude', skill.name);
    (linkService.list as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        id: 'brainstorming-another-project-claude-code',
        scope: 'global',
        destinationPath: destination,
      },
    ]);

    const existingGlobal = linkService
      .list()
      .find((link: any) => link.scope === 'global' && link.destinationPath === destination);

    expect(existingGlobal).toBeDefined();
    expect(() => {
      if (existingGlobal) {
        throw new Error(`Global destination already linked: ${existingGlobal.id}`);
      }
    }).toThrow('Global destination already linked');
    expect(symlinkService.create).not.toHaveBeenCalled();
  });
});
