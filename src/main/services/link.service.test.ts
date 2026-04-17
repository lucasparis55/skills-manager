import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { LinkService } from './link.service';
import type { CreateLinkInput } from '../types/domain';

describe('LinkService', () => {
  let tempDir: string;
  let linkService: LinkService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'link-service-test-'));
    linkService = new LinkService(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should create links.json if absent on construction', () => {
    const linksPath = path.join(tempDir, 'links.json');
    expect(fs.existsSync(linksPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(linksPath, 'utf-8'));
    expect(content).toEqual([]);
  });

  it('should load existing links.json on construction', () => {
    const existingLinks = [
      {
        id: 'skill1-project1-claude-code',
        skillId: 'skill1',
        projectId: 'project1',
        ideName: 'claude-code',
        scope: 'project',
        sourcePath: '/source/skill1',
        destinationPath: '/dest/skill1',
        status: 'linked',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    fs.writeFileSync(
      path.join(tempDir, 'links.json'),
      JSON.stringify(existingLinks, null, 2),
      'utf-8',
    );

    const service = new LinkService(tempDir);
    expect(service.list()).toHaveLength(1);
    expect(service.list()[0].id).toBe('skill1-project1-claude-code');
  });

  it('should persist a new link via create()', () => {
    const input: CreateLinkInput = {
      skillId: 'brainstorming',
      projectId: 'skills-manager',
      ideName: 'claude-code',
      scope: 'project',
    };

    const link = linkService.create(input, '/skills/brainstorming', '/project/.claude/agents/brainstorming');

    expect(link.id).toBe('brainstorming-skills-manager-claude-code');
    expect(link.skillId).toBe('brainstorming');
    expect(link.projectId).toBe('skills-manager');
    expect(link.ideName).toBe('claude-code');
    expect(link.scope).toBe('project');
    expect(link.sourcePath).toBe('/skills/brainstorming');
    expect(link.destinationPath).toBe('/project/.claude/agents/brainstorming');
    expect(link.status).toBe('linked');
    expect(link.createdAt).toBeDefined();

    // Verify persisted to disk
    const onDisk = JSON.parse(fs.readFileSync(path.join(tempDir, 'links.json'), 'utf-8'));
    expect(onDisk).toHaveLength(1);
    expect(onDisk[0].id).toBe('brainstorming-skills-manager-claude-code');

    // Verify available via list()
    expect(linkService.list()).toHaveLength(1);
  });

  it('should throw on duplicate id in create()', () => {
    const input: CreateLinkInput = {
      skillId: 'brainstorming',
      projectId: 'skills-manager',
      ideName: 'claude-code',
      scope: 'project',
    };

    linkService.create(input, '/src1', '/dest1');

    expect(() => {
      linkService.create(input, '/src2', '/dest2');
    }).toThrow(/already exists/);
  });

  it('should return a link by id via get()', () => {
    const input: CreateLinkInput = {
      skillId: 'brainstorming',
      projectId: 'skills-manager',
      ideName: 'claude-code',
      scope: 'project',
    };
    linkService.create(input, '/src', '/dest');

    const found = linkService.get('brainstorming-skills-manager-claude-code');
    expect(found).toBeDefined();
    expect(found!.skillId).toBe('brainstorming');
  });

  it('should return undefined for non-existent id via get()', () => {
    const found = linkService.get('non-existent-id');
    expect(found).toBeUndefined();
  });

  it('should return all links via list()', () => {
    linkService.create(
      { skillId: 'skill1', projectId: 'project1', ideName: 'claude-code', scope: 'project' },
      '/src1',
      '/dest1',
    );
    linkService.create(
      { skillId: 'skill2', projectId: 'project1', ideName: 'cursor', scope: 'global' },
      '/src2',
      '/dest2',
    );

    const links = linkService.list();
    expect(links).toHaveLength(2);
  });

  it('should delete a link and persist via remove()', () => {
    linkService.create(
      { skillId: 'skill1', projectId: 'project1', ideName: 'claude-code', scope: 'project' },
      '/src1',
      '/dest1',
    );

    const result = linkService.remove('skill1-project1-claude-code');
    expect(result).toBe(true);
    expect(linkService.list()).toHaveLength(0);
    expect(linkService.get('skill1-project1-claude-code')).toBeUndefined();

    // Verify persisted to disk
    const onDisk = JSON.parse(fs.readFileSync(path.join(tempDir, 'links.json'), 'utf-8'));
    expect(onDisk).toHaveLength(0);
  });

  it('should return false when removing non-existent link', () => {
    const result = linkService.remove('non-existent-id');
    expect(result).toBe(false);
  });

  it('should verify a link and update status via verify()', () => {
    linkService.create(
      { skillId: 'skill1', projectId: 'project1', ideName: 'claude-code', scope: 'project' },
      '/src1',
      '/dest1',
    );

    const mockSymlinkService = {
      verify: () => ({ valid: false, target: '/src1' }),
    } as any;

    const result = linkService.verify('skill1-project1-claude-code', mockSymlinkService);
    expect(result.valid).toBe(false);
    expect(result.link.status).toBe('broken');

    // Verify status persisted
    const link = linkService.get('skill1-project1-claude-code');
    expect(link!.status).toBe('broken');
  });

  it('should fall back to empty array for corrupt links.json', () => {
    fs.writeFileSync(path.join(tempDir, 'links.json'), '{invalid json', 'utf-8');

    const service = new LinkService(tempDir);
    expect(service.list()).toEqual([]);
  });

  it('should ignore non-array payloads from links.json', () => {
    fs.writeFileSync(path.join(tempDir, 'links.json'), JSON.stringify({ invalid: true }), 'utf-8');

    const service = new LinkService(tempDir);
    expect(service.list()).toEqual([]);
  });

  it('should return false entries for removeMultiple when ids do not exist', () => {
    linkService.create(
      { skillId: 'skill1', projectId: 'project1', ideName: 'claude-code', scope: 'project' },
      '/src1',
      '/dest1',
    );
    const results = linkService.removeMultiple(['missing-1', 'missing-2']);

    expect(results).toEqual([
      { id: 'missing-1', success: false },
      { id: 'missing-2', success: false },
    ]);
    expect(linkService.list()).toHaveLength(1);
  });

  it('should remove multiple links and persist only successful deletions', () => {
    linkService.create(
      { skillId: 'skill1', projectId: 'project1', ideName: 'claude-code', scope: 'project' },
      '/src1',
      '/dest1',
    );
    linkService.create(
      { skillId: 'skill2', projectId: 'project1', ideName: 'cursor', scope: 'project' },
      '/src2',
      '/dest2',
    );

    const results = linkService.removeMultiple(['skill1-project1-claude-code', 'missing']);

    expect(results).toEqual([
      { id: 'skill1-project1-claude-code', success: true },
      { id: 'missing', success: false },
    ]);
    expect(linkService.list()).toHaveLength(1);

    const onDisk = JSON.parse(fs.readFileSync(path.join(tempDir, 'links.json'), 'utf-8'));
    expect(onDisk).toHaveLength(1);
    expect(onDisk[0].id).toBe('skill2-project1-cursor');
  });

  it('should throw when verifying an unknown link id', () => {
    expect(() => linkService.verify('unknown-link', { verify: () => ({ valid: true }) } as any)).toThrow(
      'Link "unknown-link" not found',
    );
  });

  it('should verify all links and update statuses', () => {
    linkService.create(
      { skillId: 'linked', projectId: 'project1', ideName: 'claude-code', scope: 'project' },
      '/src-linked',
      '/dest-linked',
    );
    linkService.create(
      { skillId: 'broken', projectId: 'project1', ideName: 'claude-code', scope: 'project' },
      '/src-broken',
      '/dest-broken',
    );

    const verified = linkService.verifyAll({
      verify: (destination: string) => ({ valid: destination.includes('linked') }),
    } as any);

    expect(verified.find((link) => link.id === 'linked-project1-claude-code')?.status).toBe('linked');
    expect(verified.find((link) => link.id === 'broken-project1-claude-code')?.status).toBe('broken');
  });
});
