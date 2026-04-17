import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GitHubImportService } from './github-import.service';
import { SkillService } from './skill.service';
import type { ParsedGitHubRepo, DetectedSkill, GitHubRepoInfo } from '../types/github';

describe('GitHubImportService', () => {
  let tempSkillsRoot: string;
  let service: GitHubImportService;
  let repoInfo: GitHubRepoInfo;
  let parsed: ParsedGitHubRepo;

  beforeEach(() => {
    tempSkillsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'github-import-test-'));
    service = new GitHubImportService({
      get: () => ({
        githubToken: '',
        centralSkillsRoot: tempSkillsRoot,
      }),
    } as any);

    repoInfo = {
      name: 'repo',
      fullName: 'owner/repo',
      description: 'repo description',
      defaultBranch: 'master',
      isPrivate: false,
      htmlUrl: 'https://github.com/owner/repo',
      starsCount: 0,
    };

    parsed = {
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempSkillsRoot, { recursive: true, force: true });
  });

  const buildSkill = (overrides?: Partial<DetectedSkill>): DetectedSkill => ({
    name: 'incoming-skill',
    displayName: 'Incoming Skill',
    description: 'imported',
    sourcePath: 'incoming-skill',
    hasSkillMd: true,
    fileCount: 1,
    files: [
      {
        path: 'incoming-skill/SKILL.md',
        type: 'blob',
        sha: 'abc',
        size: 128,
      },
    ],
    structure: 'folder-per-skill',
    repoInfo,
    ...overrides,
  });

  it('should use effective default branch when importing files', async () => {
    const skill = buildSkill();
    const fetchRepoInfoSpy = vi.spyOn(service, 'fetchRepoInfo').mockResolvedValue(repoInfo);
    const fetchFileContentSpy = vi
      .spyOn(service, 'fetchFileContent')
      .mockImplementation(async (parsedArg: ParsedGitHubRepo) => {
        expect(parsedArg.branch).toBe('master');
        return `---
name: incoming-skill
displayName: Incoming Skill
description: imported
version: 1.0.0
targetIDEs: []
tags: []
---
`;
      });

    const result = await service.importSkills(parsed, [skill], {});

    expect(fetchRepoInfoSpy).toHaveBeenCalled();
    expect(fetchFileContentSpy).toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('imported');
  });

  it('should fail item when no importable text files are downloaded', async () => {
    const skill = buildSkill({ hasSkillMd: false });
    vi.spyOn(service, 'fetchRepoInfo').mockResolvedValue(repoInfo);
    vi.spyOn(service, 'fetchFileContent').mockRejectedValue(new Error('404'));

    const result = await service.importSkills(parsed, [skill], {});

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('error');
    expect(result[0].error).toContain('No importable text files');
  });

  it('should fail item when SKILL.md is missing for a skill that requires it', async () => {
    const skill = buildSkill({
      files: [
        { path: 'incoming-skill/README.md', type: 'blob', sha: '1', size: 64 },
        { path: 'incoming-skill/SKILL.md', type: 'blob', sha: '2', size: 64 },
      ],
    });

    vi.spyOn(service, 'fetchRepoInfo').mockResolvedValue(repoInfo);
    vi.spyOn(service, 'fetchFileContent').mockImplementation(async (_parsed, filePath) => {
      if (filePath.endsWith('README.md')) {
        return '# readme';
      }
      throw new Error('404');
    });

    const result = await service.importSkills(parsed, [skill], {});

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('error');
    expect(result[0].error).toContain('Required SKILL.md');
  });

  it('should reject invalid rename and collisions unless overwrite is explicit', async () => {
    const skill = buildSkill();
    vi.spyOn(service, 'fetchRepoInfo').mockResolvedValue(repoInfo);
    vi.spyOn(service, 'fetchFileContent').mockResolvedValue(`---
name: incoming-skill
displayName: Incoming Skill
description: imported
version: 1.0.0
targetIDEs: []
tags: []
---
`);

    const invalidRenameResult = await service.importSkills(parsed, [skill], {
      'incoming-skill': { strategy: 'rename', newName: '!!!' },
    });
    expect(invalidRenameResult[0].status).toBe('error');
    expect(invalidRenameResult[0].error).toContain('Invalid final skill name');

    const existingSkillService = new SkillService(tempSkillsRoot);
    existingSkillService.create({
      name: 'taken-name',
      displayName: 'Taken Name',
      description: 'existing',
      format: 'folder',
      targetIDEs: ['codex-cli'],
      tags: [],
    });

    const collisionResult = await service.importSkills(parsed, [skill], {
      'incoming-skill': { strategy: 'rename', newName: 'taken-name' },
    });
    expect(collisionResult[0].status).toBe('error');
    expect(collisionResult[0].error).toContain('already exists');

    const overwriteResult = await service.importSkills(parsed, [buildSkill({ name: 'taken-name' })], {
      'taken-name': { strategy: 'overwrite' },
    });
    expect(overwriteResult[0].status).toBe('imported');
  });
});

