import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GitHubImportInventory } from './GitHubImportInventory';
import { renderWithProviders } from '../../test-utils';
import type { ImportComponent, ImportTarget } from '../../../../main/types/import';

const component: ImportComponent = {
  id: 'hook:hooks/hooks.json',
  kind: 'hook',
  name: 'repository-hooks',
  displayName: 'Repository hooks',
  description: 'Session start hook',
  sourcePath: 'hooks',
  files: [{ path: 'hooks/hooks.json', sha: 'hooks', type: 'blob' }],
  dependencies: ['script:hooks/session-start.sh'],
  risk: 'high',
  hasExecutableFiles: true,
  requiresActivation: true,
  events: ['SessionStart'],
  nativeTargets: ['claude-code'],
  metadata: {},
};

const target: ImportTarget = {
  id: 'claude-code:global',
  label: 'Claude Code (global)',
  adapterId: 'claude-code',
  scope: 'global',
  rootPath: 'C:/Users/test/.claude',
  componentRoots: { hook: 'C:/Users/test/.claude/hooks' },
  supportedKinds: ['hook'],
  native: true,
  available: true,
};

describe('GitHubImportInventory', () => {
  it('shows the hook risk, dependency and target selector', async () => {
    const onChange = vi.fn();
    renderWithProviders(
      <GitHubImportInventory
        components={[component]}
        targets={[target]}
        selections={{ [component.id]: { componentId: component.id, targetId: target.id, selected: false } }}
        onSelectionChange={onChange}
        onPreview={vi.fn()}
      />,
    );

    expect(screen.getByText('Repository hooks')).toBeInTheDocument();
    expect(screen.getByText('high risk')).toBeInTheDocument();
    expect(screen.getByText('Depends on: script:hooks/session-start.sh')).toBeInTheDocument();
    expect(screen.getByLabelText('Destination for Repository hooks')).toHaveValue(target.id);

    await userEvent.click(screen.getByLabelText('Select Repository hooks'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ selected: true }));
  });
});
