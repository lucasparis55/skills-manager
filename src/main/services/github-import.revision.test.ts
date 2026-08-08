import { describe, expect, it, vi } from 'vitest';
import { GitHubImportService } from './github-import.service';
import type { GitHubRepoInfo, GitHubTreeEntry, ParsedGitHubRepo } from '../types/github';

describe('GitHubImportService repository inventory', () => {
  it('returns a component inventory and keeps the resolved revision for every download', async () => {
    const service = new GitHubImportService({
      get: () => ({ centralSkillsRoot: 'C:/skills' }),
    } as any);
    const parsed: ParsedGitHubRepo = { owner: 'addyosmani', repo: 'agent-skills', branch: 'main' };
    const repoInfo: GitHubRepoInfo = {
      name: 'agent-skills',
      fullName: 'addyosmani/agent-skills',
      description: 'skills',
      defaultBranch: 'main',
      isPrivate: false,
      htmlUrl: 'https://github.com/addyosmani/agent-skills',
      starsCount: 10,
    };
    const tree = [
      { path: '.claude-plugin/plugin.json', type: 'blob', sha: 'manifest' },
      { path: 'skills/review/SKILL.md', type: 'blob', sha: 'skill' },
      { path: 'hooks/hooks.json', type: 'blob', sha: 'hooks' },
      { path: 'hooks/session-start.sh', type: 'blob', sha: 'script' },
    ] as GitHubTreeEntry[];
    Object.assign(tree, {
      revision: {
        ref: 'main',
        commitSha: 'commit-123',
        treeSha: 'tree-123',
        resolvedAt: '2026-08-07T00:00:00.000Z',
      },
    });

    vi.spyOn(service, 'fetchRepoInfo').mockResolvedValue(repoInfo);
    vi.spyOn(service, 'fetchRepoTree').mockResolvedValue(tree);
    const fetchFileContent = vi.spyOn(service, 'fetchFileContent').mockImplementation(async (_parsed, filePath) => {
      if (filePath.endsWith('plugin.json')) return '{"name":"agent-skills"}';
      return '{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh"}]}]}}';
    });

    const result = await service.analyze(parsed);

    expect(result.revision.commitSha).toBe('commit-123');
    expect(result.revision.treeSha).toBe('tree-123');
    expect(result.components.some((component) => component.kind === 'hook')).toBe(true);
    expect(result.components.some((component) => component.kind === 'script')).toBe(true);
    expect(fetchFileContent).toHaveBeenCalledWith(expect.objectContaining({ branch: 'main' }), '.claude-plugin/plugin.json', expect.anything());
  });
});
