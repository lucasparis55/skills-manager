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
  variants: [
    { sourcePath: '.agents/skills/impeccable', displayName: 'Agents', nativeTargets: ['codex-cli'], files: componentFiles('agents') },
    { sourcePath: '.claude/skills/impeccable', displayName: 'Claude', nativeTargets: ['claude-code'], files: componentFiles('claude') },
  ],
};

function componentFiles(prefix: string) {
  return [{ path: `${prefix}/SKILL.md`, sha: prefix, type: 'blob' as const }];
}

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
  it('explains a hook without exposing technical controls by default', async () => {
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

    expect(screen.getByText('Choose what to import')).toBeInTheDocument();
    expect(screen.getByText('Hooks')).toBeInTheDocument();
    expect(screen.getByText('Automatic actions triggered by events. Installed disabled and reviewed separately.')).toBeInTheDocument();
    expect(screen.getByText('high risk')).toBeInTheDocument();
    expect(screen.getByText('2 provider variants')).toBeInTheDocument();
    expect(screen.getByText('Disabled by default')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select Repository hooks' })).not.toBeChecked();

    await userEvent.click(screen.getByRole('button', { name: 'Show details' }));
    expect(screen.getByText('Included support')).toBeInTheDocument();
    expect(screen.getByText('script:hooks/session-start.sh')).toBeInTheDocument();
    expect(screen.getByText('.agents/skills/impeccable')).toBeInTheDocument();
    expect(screen.getByText('.claude/skills/impeccable')).toBeInTheDocument();
    expect(screen.getByLabelText('Destination for Repository hooks')).toHaveValue(target.id);

    await userEvent.click(screen.getByLabelText('Select Repository hooks'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ selected: true }));
  });

  it('offers global and per-group selection controls', async () => {
    const onChange = vi.fn();
    const skill = { ...component, id: 'skill:impeccable', kind: 'skill' as const, displayName: 'Impeccable' };
    renderWithProviders(
      <GitHubImportInventory
        components={[skill, component]}
        targets={[target]}
        selections={{
          [skill.id]: { componentId: skill.id, targetId: target.id, selected: false },
          [component.id]: { componentId: component.id, targetId: target.id, selected: false },
        }}
        onSelectionChange={onChange}
        onPreview={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Select all choices' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ componentId: skill.id, selected: true }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ componentId: component.id, selected: true }));

    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ componentId: skill.id, selected: false }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ componentId: component.id, selected: false }));
  });
});
