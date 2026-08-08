import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GitHubImportReview } from './GitHubImportReview';
import { renderWithProviders } from '../../test-utils';
import type { ImportComponentResult, ImportPlan, ImportTarget } from '../../../../main/types/import';

const target: ImportTarget = {
  id: 'claude-code:global', label: 'Claude Code (global)', adapterId: 'claude-code', scope: 'global',
  rootPath: 'C:/Users/test/.claude', componentRoots: { hook: 'C:/Users/test/.claude/hooks' },
  supportedKinds: ['hook'], native: true, available: true,
};

const plan: ImportPlan = {
  id: 'plan-1', createdAt: 'now', sourceUrl: 'https://github.com/acme/repo', sourceRef: 'main',
  items: [{
    component: {
      id: 'hook:hooks/hooks.json', kind: 'hook', name: 'hooks', displayName: 'Repository hooks', description: 'hook',
      sourcePath: 'hooks', files: [], dependencies: [], risk: 'high', hasExecutableFiles: true,
      requiresActivation: true, events: ['SessionStart'], nativeTargets: ['claude-code'], metadata: {},
    },
    target,
    selection: { componentId: 'hook:hooks/hooks.json', targetId: target.id, selected: true },
    status: 'ready', destinationPath: 'C:/Users/test/.claude/hooks/repository-hooks', warnings: [],
  }],
  warnings: [], blockers: [],
};

const result: ImportComponentResult = {
  componentId: 'hook:hooks/hooks.json', componentName: 'Repository hooks', kind: 'hook', targetId: target.id,
  status: 'installed', activation: {
    componentId: 'hook:hooks/hooks.json', targetId: target.id, hookName: 'Repository hooks', events: ['SessionStart'],
    command: '${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh', content: '{"hooks":{}}', contentSha256: 'hash',
    configPath: 'C:/Users/test/.claude/settings.json', currentlyActive: false,
  },
};

describe('GitHubImportReview', () => {
  it('shows hook content/events and requires an explicit activation click', async () => {
    const onActivateHook = vi.fn();
    renderWithProviders(
      <GitHubImportReview
        plan={plan}
        results={[result]}
        onBack={vi.fn()}
        onInstall={vi.fn()}
        onActivateHook={onActivateHook}
        onRunFallback={vi.fn()}
        installing={false}
      />,
    );

    expect(screen.getByText(/SessionStart/)).toBeInTheDocument();
    expect(screen.getByText(/\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/session-start\.sh/)).toBeInTheDocument();
    expect(screen.getByText('{"hooks":{}}')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Confirm and activate hook' }));
    expect(onActivateHook).toHaveBeenCalledWith(plan.items[0], result.activation);
  });
});
