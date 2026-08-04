import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import GlobalSkillsView from './GlobalSkillsView';
import { createApiMock, renderWithProviders } from '../../test-utils';

function inventory() {
  const review = {
    id: 'review-id',
    name: 'review',
    displayName: 'Review',
    description: 'Review changes',
    path: 'C:/global/review',
    rootPath: 'C:/global',
    origin: 'managed' as const,
    status: 'available' as const,
    ideIds: ['codex-cli'],
    ideNames: ['Codex CLI'],
    sharedWith: [],
  };
  const external = {
    id: 'external-id',
    name: 'external',
    displayName: 'External',
    description: 'An external skill',
    path: 'C:/cursor/skills/external',
    rootPath: 'C:/cursor/skills',
    origin: 'external' as const,
    status: 'available' as const,
    ideIds: ['cursor'],
    ideNames: ['Cursor'],
    sharedWith: [],
  };

  return {
    scannedAt: 'now',
    tools: [
      {
        ideId: 'codex-cli',
        ideName: 'Codex CLI',
        detected: true,
        roots: [{ path: 'C:/global', exists: true, isConfigured: true }],
        skills: [review],
      },
      {
        ideId: 'cursor',
        ideName: 'Cursor',
        detected: true,
        roots: [{ path: 'C:/cursor/skills', exists: true, isConfigured: true }],
        skills: [external],
      },
      {
        ideId: 'claude-code',
        ideName: 'Claude Code CLI',
        detected: false,
        roots: [{ path: 'C:/claude/skills', exists: false, isConfigured: true }],
        skills: [],
      },
    ],
    totalSkills: 2,
    managedCount: 1,
    externalCount: 1,
    brokenCount: 0,
    protectedCount: 0,
  };
}

describe('GlobalSkillsView', () => {
  it('shows global inventory by tool, empty tools, and read-only preview', async () => {
    const api = createApiMock({
      globalSkills: {
        scan: vi.fn(async () => inventory()),
        preview: vi.fn(async () => ({
          id: 'review-id',
          name: 'review',
          displayName: 'Review',
          description: 'Review changes',
          path: 'C:/global/review',
          rootPath: 'C:/global',
          origin: 'managed',
          status: 'available',
          content: '# Review changes',
          truncated: false,
        })),
      },
    });

    renderWithProviders(<GlobalSkillsView />);

    expect(await screen.findByText('Review')).toBeInTheDocument();
    expect(screen.getAllByText('Managed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('External').length).toBeGreaterThan(0);
    expect(screen.getByText('Not detected')).toBeInTheDocument();
    expect(screen.getByText('No global skills found')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Preview Review' }));

    expect(await screen.findByText('# Review changes')).toBeInTheDocument();
    expect(api.globalSkills.preview).toHaveBeenCalledWith('review-id');
  });

  it('selects skills across tools and confirms a grouped removal', async () => {
    const api = createApiMock({
      globalSkills: {
        scan: vi.fn(async () => inventory()),
        remove: vi.fn(async (ids: string[]) => ids.map((id) => ({
          id,
          name: id,
          status: 'trashed' as const,
          canUndo: id === 'review-id',
          ...(id === 'review-id' ? { undoToken: 'undo-review' } : {}),
        }))),
      },
    });

    renderWithProviders(<GlobalSkillsView />);
    expect(await screen.findByText('Review')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Select Review'));
    await userEvent.click(screen.getByLabelText('Select External'));
    await userEvent.click(screen.getByRole('button', { name: 'Remove selected' }));

    expect(screen.getAllByText('C:/global/review').length).toBeGreaterThan(0);
    expect(screen.getAllByText('C:/cursor/skills/external').length).toBeGreaterThan(0);
    expect(screen.getByText(/External skills are not preserved/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove skills' }));

    await waitFor(() => {
      expect(api.globalSkills.remove).toHaveBeenCalledWith(['review-id', 'external-id']);
    });
    expect(await screen.findByText('Skills removed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(api.globalSkills.undo).toHaveBeenCalledWith(['undo-review']);
    });
  });
});
