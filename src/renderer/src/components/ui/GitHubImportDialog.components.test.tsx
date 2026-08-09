import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import GitHubImportDialog from './GitHubImportDialog';
import { createApiMock, renderWithProviders } from '../../test-utils';

vi.mock('@radix-ui/react-dialog', () => ({
  Root: ({ open, children }: any) => (open ? <div>{children}</div> : null),
  Portal: ({ children }: any) => <>{children}</>,
  Overlay: ({ children }: any) => <div>{children}</div>,
  Content: ({ children }: any) => <div>{children}</div>,
  Title: ({ children }: any) => <div>{children}</div>,
  Description: ({ children }: any) => <div>{children}</div>,
  Close: ({ children }: any) => <>{children}</>,
}));

const hookComponent = {
  id: 'hook:hooks',
  kind: 'hook',
  name: 'repository-hooks',
  displayName: 'Repository hooks',
  description: 'Repository lifecycle hooks',
  sourcePath: 'hooks',
  files: [{ path: 'hooks/hooks.json', sha: 'hook-sha', type: 'blob', size: 16 }],
  dependencies: [],
  risk: 'critical',
  hasExecutableFiles: true,
  requiresActivation: true,
  events: ['SessionStart'],
  nativeTargets: ['claude-code'],
  metadata: { manifestPath: 'hooks/hooks.json' },
};

const informationalBundle = {
  id: 'bundle:.claude-plugin/plugin.json',
  kind: 'bundle',
  name: 'impeccable',
  displayName: 'Impeccable package',
  description: 'Repository bundle',
  sourcePath: '',
  files: [{ path: '.claude-plugin/plugin.json', sha: 'bundle-sha', type: 'blob' as const }],
  dependencies: [hookComponent.id],
  risk: 'medium',
  hasExecutableFiles: false,
  requiresActivation: false,
  events: [],
  nativeTargets: ['claude-code'],
  metadata: { informational: true },
};

const target = {
  id: 'claude-code:global',
  label: 'Claude Code (global)',
  adapterId: 'claude-code',
  scope: 'global',
  ideId: 'claude-code',
  rootPath: 'C:/Users/test/.claude',
  componentRoots: { hook: 'C:/Users/test/.claude/hooks', script: 'C:/Users/test/.claude/hooks' },
  supportedKinds: ['hook', 'script'],
  native: true,
  available: true,
  hookConfigPath: 'C:/Users/test/.claude/settings.json',
};

describe('GitHubImportDialog component flow', () => {
  it('reviews files, installs a hook disabled, and requires explicit activation', async () => {
    const api = createApiMock({
      githubImport: {
        parseUrl: vi.fn(async () => ({ owner: 'addyosmani', repo: 'agent-skills', branch: 'main' })),
        analyze: vi.fn(async () => ({
          repoInfo: { fullName: 'addyosmani/agent-skills', description: 'Agent skills' },
          skills: [],
          components: [informationalBundle, hookComponent],
          targets: [target],
          revision: { ref: 'main', commitSha: 'commit-sha' },
          warnings: [],
        })),
        previewComponent: vi.fn(async () => ({
          componentId: hookComponent.id,
          files: [{ path: 'hooks/hooks.json', content: '{"hooks":{}}', truncated: false }],
          revision: { ref: 'main', commitSha: 'commit-sha' },
        })),
        plan: vi.fn(async () => ({
          id: 'plan-1',
          createdAt: '2026-08-07T00:00:00.000Z',
          sourceUrl: 'https://github.com/addyosmani/agent-skills',
          sourceRef: 'main',
          items: [{
            component: hookComponent,
            target,
            selection: { componentId: hookComponent.id, targetId: target.id, selected: true, conflictStrategy: 'block', activate: false },
            status: 'ready',
            destinationPath: 'C:/Users/test/.claude/hooks/repository-hooks',
            warnings: [],
          }],
          warnings: [],
          blockers: [],
        })),
        importComponents: vi.fn(async () => [{
          componentId: hookComponent.id,
          componentName: hookComponent.displayName,
          kind: 'hook',
          targetId: target.id,
          status: 'installed',
          destinationPath: 'C:/Users/test/.claude/hooks/repository-hooks',
          activation: {
            componentId: hookComponent.id,
            targetId: target.id,
            hookName: 'Repository hooks',
            events: ['SessionStart'],
            command: '${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh',
            content: '{"hooks":{}}',
            contentSha256: 'hash',
            currentlyActive: false,
          },
        }]),
        activateHook: vi.fn(async () => ({ success: true })),
      },
    });

    renderWithProviders(<GitHubImportDialog open={true} onOpenChange={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText('https://github.com/owner/repo'), 'addyosmani/agent-skills');
    await userEvent.click(screen.getByRole('button', { name: 'Analyze' }));

    expect(await screen.findByText('Repository inventory')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select Repository hooks' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Select Impeccable package' })).not.toBeChecked();
    await userEvent.click(screen.getAllByRole('button', { name: 'Review files' })[1]);
    expect(await screen.findByText('{"hooks":{}}')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close preview' }));

    await userEvent.click(screen.getByRole('button', { name: 'Review selected (1)' }));
    expect(await screen.findByText('Review installation')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Install reviewed components' }));
    expect(await screen.findByRole('button', { name: 'Confirm and activate hook' })).toBeInTheDocument();
    expect(api.githubImport.importComponents).toHaveBeenCalledWith('plan-1');

    await userEvent.click(screen.getByRole('button', { name: 'Confirm and activate hook' }));
    expect(api.githubImport.activateHook).toHaveBeenCalledWith({
      planId: 'plan-1',
      componentId: hookComponent.id,
      targetId: target.id,
      approval: { contentSha256: 'hash', events: ['SessionStart'] },
    });
  });
});
