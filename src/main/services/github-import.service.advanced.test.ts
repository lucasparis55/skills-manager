import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DetectedSkill, GitHubTreeEntry, ParsedGitHubRepo } from '../types/github';

const { requestMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
}));

vi.mock('node:https', () => ({
  default: {
    request: requestMock,
  },
  request: requestMock,
}));

import { GitHubImportService } from './github-import.service';

type ResponseSpec = {
  statusCode?: number;
  headers?: Record<string, string>;
  body?: string;
  error?: Error;
  timeout?: boolean;
};

const queueHttpResponses = (specs: ResponseSpec[]) => {
  requestMock.mockImplementation((_: any, callback: (res: any) => void) => {
    const spec = specs.shift();
    if (!spec) {
      throw new Error('No queued response');
    }

    const req = new EventEmitter() as any;
    req.end = () => {
      if (spec.error) {
        req.emit('error', spec.error);
        return;
      }
      if (spec.timeout) {
        req.emit('timeout');
        return;
      }

      const res = new EventEmitter() as any;
      res.statusCode = spec.statusCode ?? 200;
      res.headers = spec.headers || {};
      callback(res);

      if (typeof spec.body === 'string') {
        res.emit('data', spec.body);
      }
      res.emit('end');
    };
    req.destroy = vi.fn();
    return req;
  });
};

describe('GitHubImportService advanced', () => {
  let tempSkillsRoot: string;
  let service: GitHubImportService;
  const parsed: ParsedGitHubRepo = { owner: 'acme', repo: 'skills', branch: 'main' };

  beforeEach(() => {
    requestMock.mockReset();
    tempSkillsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'github-import-advanced-'));
    service = new GitHubImportService({
      get: () => ({
        githubToken: '',
        centralSkillsRoot: tempSkillsRoot,
      }),
    } as any);
  });

  afterEach(() => {
    fs.rmSync(tempSkillsRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('parses github URLs and shorthand variants', () => {
    expect(service.parseGitHubUrl('acme/skills')).toEqual({
      owner: 'acme',
      repo: 'skills',
      branch: 'main',
    });

    expect(
      service.parseGitHubUrl('https://github.com/acme/skills/tree/dev/path/to/skills'),
    ).toEqual({
      owner: 'acme',
      repo: 'skills',
      branch: 'dev',
      subpath: 'path/to/skills',
    });

    expect(() => service.parseGitHubUrl('https://example.com/not-github')).toThrow('Invalid GitHub URL');
  });

  it('detects folder-per-skill, single-skill, and non-standard structures', () => {
    const repoInfo = {
      name: 'repo',
      fullName: 'acme/repo',
      description: 'desc',
      defaultBranch: 'main',
      isPrivate: false,
      htmlUrl: 'https://github.com/acme/repo',
      starsCount: 0,
    };

    const folderTree: GitHubTreeEntry[] = [
      { path: 'skills/a/SKILL.md', type: 'blob', sha: '1', size: 100 },
      { path: 'skills/a/README.md', type: 'blob', sha: '2', size: 50 },
      { path: 'skills/b/SKILL.md', type: 'blob', sha: '3', size: 100 },
      { path: 'node_modules/pkg/file.js', type: 'blob', sha: 'x', size: 1 },
    ];
    const folderSkills = service.detectSkillStructures(folderTree, repoInfo);
    expect(folderSkills).toHaveLength(2);
    expect(folderSkills.every((s) => s.structure === 'folder-per-skill')).toBe(true);

    const singleTree: GitHubTreeEntry[] = [
      { path: 'SKILL.md', type: 'blob', sha: '1', size: 100 },
      { path: 'README.md', type: 'blob', sha: '2', size: 50 },
    ];
    const single = service.detectSkillStructures(singleTree, repoInfo);
    expect(single).toHaveLength(1);
    expect(single[0].structure).toBe('single-skill');

    const nonStandardTree: GitHubTreeEntry[] = [
      { path: 'prompt.txt', type: 'blob', sha: '1', size: 30 },
    ];
    const nonStandard = service.detectSkillStructures(nonStandardTree, repoInfo, 'nested/path');
    expect(nonStandard[0].structure).toBe('non-standard');
    expect(nonStandard[0].sourcePath).toBe('nested/path');
  });

  it('analyzes repo using effective default branch fallback', async () => {
    const fetchRepoInfo = vi.spyOn(service, 'fetchRepoInfo').mockResolvedValue({
      name: 'repo',
      fullName: 'acme/repo',
      description: 'desc',
      defaultBranch: 'master',
      isPrivate: false,
      htmlUrl: 'https://github.com/acme/repo',
      starsCount: 0,
    });
    const fetchRepoTree = vi.spyOn(service, 'fetchRepoTree').mockResolvedValue([
      { path: 'SKILL.md', type: 'blob', sha: '1', size: 100 },
    ]);

    const result = await service.analyze(parsed);

    expect(fetchRepoInfo).toHaveBeenCalledWith(parsed);
    expect(fetchRepoTree).toHaveBeenCalledWith(expect.objectContaining({ branch: 'master' }));
    expect(result.skills).toHaveLength(1);
  });

  it('imports skills with conflict resolution, rename, overwrite and cancellation', async () => {
    const repoInfo = {
      name: 'repo',
      fullName: 'acme/repo',
      description: 'desc',
      defaultBranch: 'main',
      isPrivate: false,
      htmlUrl: 'https://github.com/acme/repo',
      starsCount: 0,
    };
    vi.spyOn(service, 'fetchRepoInfo').mockResolvedValue(repoInfo);
    vi.spyOn(service, 'fetchFileContent').mockImplementation(async (_parsed, filePath) => {
      if (filePath.endsWith('.bin')) {
        throw new Error('should not fetch binary');
      }
      return filePath.endsWith('SKILL.md')
        ? '---\nname: skill-a\ndisplayName: Skill A\ndescription: desc\nversion: 1.0.0\ntargetIDEs: []\ntags: []\n---'
        : '# readme';
    });

    const existingDir = path.join(tempSkillsRoot, 'existing-skill');
    fs.mkdirSync(existingDir, { recursive: true });
    fs.writeFileSync(
      path.join(existingDir, 'SKILL.md'),
      '---\nname: existing-skill\ndisplayName: Existing\ndescription: e\nversion: 1.0.0\ntargetIDEs: []\ntags: []\n---',
      'utf-8',
    );

    const skills: DetectedSkill[] = [
      {
        name: 'skip-me',
        displayName: 'Skip Me',
        description: '',
        sourcePath: 'skip-me',
        hasSkillMd: true,
        fileCount: 1,
        files: [{ path: 'skip-me/SKILL.md', type: 'blob', sha: '1', size: 100 }],
        structure: 'folder-per-skill',
        repoInfo,
      },
      {
        name: 'skill-a',
        displayName: 'Skill A',
        description: '',
        sourcePath: 'skill-a',
        hasSkillMd: true,
        fileCount: 3,
        files: [
          { path: 'skill-a/SKILL.md', type: 'blob', sha: '2', size: 120 },
          { path: 'skill-a/README.md', type: 'blob', sha: '3', size: 50 },
          { path: 'skill-a/data.bin', type: 'blob', sha: '4', size: 20 },
        ],
        structure: 'folder-per-skill',
        repoInfo,
      },
      {
        name: 'existing-skill',
        displayName: 'Existing Skill',
        description: '',
        sourcePath: 'existing-skill',
        hasSkillMd: true,
        fileCount: 1,
        files: [{ path: 'existing-skill/SKILL.md', type: 'blob', sha: '5', size: 120 }],
        structure: 'folder-per-skill',
        repoInfo,
      },
      {
        name: 'cancel-me',
        displayName: 'Cancel Me',
        description: '',
        sourcePath: 'cancel-me',
        hasSkillMd: true,
        fileCount: 1,
        files: [{ path: 'cancel-me/SKILL.md', type: 'blob', sha: '6', size: 120 }],
        structure: 'folder-per-skill',
        repoInfo,
      },
    ];

    const results = await service.importSkills(
      parsed,
      skills,
      {
        'skip-me': { strategy: 'skip' },
        'skill-a': { strategy: 'rename', newName: 'skill-a-renamed' },
        'existing-skill': { strategy: 'overwrite' },
      },
      (progress) => {
        if (progress.currentSkillName === 'existing-skill' && progress.phase === 'writing') {
          service.cancelImport();
        }
      },
    );

    expect(results[0].status).toBe('skipped');
    expect(results[1].status).toBe('renamed');
    expect(results[1].skillName).toBe('skill-a-renamed');
    expect(results[2].status).toBe('imported');
    expect(results[3].status).toBe('skipped');
    expect(results[3].error).toContain('cancelled');
  });

  it('handles GitHub API redirect, rate-limit, not-found, invalid JSON, timeout and connection errors', async () => {
    queueHttpResponses([
      {
        statusCode: 302,
        headers: { location: 'https://redirected.example.com/repos/acme/skills' },
      },
      {
        statusCode: 200,
        body: JSON.stringify({
          name: 'skills',
          full_name: 'acme/skills',
          description: 'desc',
          default_branch: 'main',
          private: false,
          html_url: 'https://github.com/acme/skills',
          stargazers_count: 10,
        }),
      },
    ]);
    const redirected = await service.fetchRepoInfo(parsed);
    expect(redirected.fullName).toBe('acme/skills');

    queueHttpResponses([
      {
        statusCode: 403,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '999' },
        body: JSON.stringify({ message: 'API rate limit exceeded' }),
      },
    ]);
    await expect(service.fetchRepoInfo(parsed)).rejects.toMatchObject({ isRateLimit: true, status: 403 });

    queueHttpResponses([{ statusCode: 404, body: '{}' }]);
    await expect(service.fetchRepoInfo(parsed)).rejects.toMatchObject({ status: 404 });

    queueHttpResponses([{ statusCode: 500, body: JSON.stringify({ message: 'server down' }) }]);
    await expect(service.fetchRepoInfo(parsed)).rejects.toMatchObject({ status: 500, message: 'server down' });

    queueHttpResponses([{ statusCode: 200, body: '{not-json' }]);
    await expect(service.fetchRepoInfo(parsed)).rejects.toThrow('Invalid JSON response');

    queueHttpResponses([{ timeout: true }]);
    await expect(service.fetchRepoInfo(parsed)).rejects.toMatchObject({ status: 0 });

    queueHttpResponses([{ error: new Error('socket hang up') }]);
    await expect(service.fetchRepoInfo(parsed)).rejects.toMatchObject({ status: 0, isRateLimit: false });
  });
});
