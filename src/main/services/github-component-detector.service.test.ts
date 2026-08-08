import { describe, expect, it } from 'vitest';
import { GitHubComponentDetectorService } from './github-component-detector.service';
import type { GitHubRepoInfo, GitHubTreeEntry } from '../types/github';

describe('GitHubComponentDetectorService', () => {
  const repoInfo: GitHubRepoInfo = {
    name: 'agent-skills',
    fullName: 'addyosmani/agent-skills',
    description: 'Agent skills',
    defaultBranch: 'main',
    isPrivate: false,
    htmlUrl: 'https://github.com/addyosmani/agent-skills',
    starsCount: 1,
  };

  it('detects skills, hooks, scripts, agents, commands, references, configs and a bundle', () => {
    const tree: GitHubTreeEntry[] = [
      { path: '.claude-plugin/plugin.json', type: 'blob', sha: 'manifest' },
      { path: 'plugin.json', type: 'blob', sha: 'root-manifest' },
      { path: 'skills/review/SKILL.md', type: 'blob', sha: 'skill' },
      { path: 'skills/review/reference.md', type: 'blob', sha: 'ref' },
      { path: 'hooks/hooks.json', type: 'blob', sha: 'hooks' },
      { path: 'hooks/session-start.sh', type: 'blob', sha: 'script' },
      { path: 'agents/reviewer.md', type: 'blob', sha: 'agent' },
      { path: 'commands/review.md', type: 'blob', sha: 'command' },
      { path: '.claude/commands/spec.md', type: 'blob', sha: 'claude-command' },
      { path: 'scripts/check.sh', type: 'blob', sha: 'repo-script' },
      { path: 'agents/reviewer.agent.md', type: 'blob', sha: 'agent-persona' },
      { path: 'references/checklist.md', type: 'blob', sha: 'reference' },
      { path: 'assets/logo.svg', type: 'blob', sha: 'asset' },
      { path: 'settings.json', type: 'blob', sha: 'settings' },
      { path: 'README.md', type: 'blob', sha: 'readme' },
      { path: 'node_modules/ignored.js', type: 'blob', sha: 'ignored' },
    ];

    const result = new GitHubComponentDetectorService().detect(tree, repoInfo, {
      '.claude-plugin/plugin.json': JSON.stringify({
        name: 'agent-skills',
        commands: ['./commands'],
        skills: './skills',
      }),
      'hooks/hooks.json': JSON.stringify({
        hooks: {
          SessionStart: [{ hooks: [{ type: 'command', command: '${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh' }] }],
        },
      }),
    });

    expect(result.skills).toHaveLength(1);
    expect(result.components.map((component) => component.kind)).toEqual(expect.arrayContaining([
      'bundle',
      'skill',
      'hook',
      'script',
      'agent',
      'command',
      'reference',
      'asset',
      'config',
    ]));

    const hook = result.components.find((component) => component.kind === 'hook');
    expect(hook?.events).toEqual(['SessionStart']);
    expect(hook?.dependencies).toContain('script:hooks/session-start.sh');
    expect(hook?.requiresActivation).toBe(true);
    expect(hook?.risk).toBe('high');
    expect(result.components.filter((component) => component.kind === 'bundle')).toHaveLength(1);
    expect(result.components.some((component) => component.id === 'command:.claude/commands/spec.md')).toBe(true);
    expect(result.components.some((component) => component.id === 'script:scripts/check.sh')).toBe(true);
    expect(result.components.some((component) => component.sourcePath.includes('node_modules'))).toBe(false);
  });

  it('keeps unknown repository contents visible as a manual step', () => {
    const tree: GitHubTreeEntry[] = [
      { path: 'install.ps1', type: 'blob', sha: 'script' },
      { path: 'README.md', type: 'blob', sha: 'readme' },
    ];

    const result = new GitHubComponentDetectorService().detect(tree, repoInfo);
    const manual = result.components.find((component) => component.kind === 'manual-step');

    expect(manual).toBeDefined();
    expect(manual?.requiresActivation).toBe(true);
    expect(manual?.risk).toBe('high');
  });
});
