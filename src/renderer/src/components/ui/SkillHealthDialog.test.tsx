import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SkillHealthDialog from './SkillHealthDialog';
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

const skill = {
  id: 'skill-1',
  displayName: 'Review Skill',
};

const report = {
  checkedAt: '2026-08-06T15:00:00.000Z',
  skillId: 'skill-1',
  skillName: 'review',
  sourcePath: 'C:/skills/review',
  destinations: [
    {
      linkId: 'healthy-link',
      skillId: 'skill-1',
      skillName: 'review',
      ideId: 'cursor',
      ideName: 'Cursor',
      scope: 'global' as const,
      projectId: null,
      projectName: 'Global',
      sourcePath: 'C:/skills/review',
      destinationPath: 'C:/Users/lucas/.cursor/skills/review',
      expectedPath: 'C:/Users/lucas/.cursor/skills/review',
      status: 'healthy' as const,
      repairable: false,
    },
    {
      linkId: 'broken-link',
      skillId: 'skill-1',
      skillName: 'review',
      ideId: 'claude-code',
      ideName: 'Claude Code',
      scope: 'project' as const,
      projectId: 'demo',
      projectName: 'Demo project',
      sourcePath: 'C:/skills/review',
      destinationPath: 'C:/repo/.claude/skills/review',
      expectedPath: 'C:/repo/.claude/skills/review',
      status: 'broken' as const,
      repairable: true,
      message: 'Canonical destination is missing; it can be recreated.',
    },
    {
      linkId: 'conflict-link',
      skillId: 'skill-1',
      skillName: 'review',
      ideId: 'cursor',
      ideName: 'Cursor',
      scope: 'global' as const,
      projectId: null,
      projectName: 'Global',
      sourcePath: 'C:/skills/review',
      destinationPath: 'C:/Users/lucas/.cursor/skills/review-copy',
      expectedPath: 'C:/Users/lucas/.cursor/skills/review-copy',
      status: 'conflict' as const,
      repairable: false,
      message: 'Destination exists but is not a managed symlink or junction.',
    },
  ],
  summary: {
    total: 3,
    healthy: 1,
    attention: 2,
    blocked: 1,
    repairable: 1,
  },
};

describe('SkillHealthDialog', () => {
  it('checks first, lets the user select repairs, confirms, and refreshes results', async () => {
    const api = createApiMock({
      skills: {
        checkDistribution: vi.fn()
          .mockResolvedValueOnce(report)
          .mockResolvedValueOnce({
            ...report,
            summary: { ...report.summary, healthy: 2, attention: 1, repairable: 0 },
          }),
        repairDistribution: vi.fn(async () => [
          {
            ...report.destinations[1],
            status: 'repaired' as const,
            previousPath: report.destinations[1].destinationPath,
          },
          {
            ...report.destinations[2],
            status: 'blocked' as const,
            message: 'Conflict was left untouched.',
          },
        ]),
      },
    });

    renderWithProviders(
      <SkillHealthDialog open={true} onOpenChange={vi.fn()} skill={skill} />,
    );

    expect(await screen.findByText('Distribution health')).toBeInTheDocument();
    expect(api.skills.checkDistribution).toHaveBeenCalledWith('skill-1');
    expect(screen.getByText('1 destination can be repaired')).toBeInTheDocument();
    expect(screen.getByText('Destination exists but is not a managed symlink or junction.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Claude Code — Demo project' }));
    await userEvent.click(screen.getByRole('button', { name: /Repair selected/ }));
    expect(screen.getByText('Repair selected destinations?')).toBeInTheDocument();
    expect(screen.getByText(/Claude Code · Demo project/)).toBeInTheDocument();
    expect(api.skills.repairDistribution).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Repair destinations' }));

    await waitFor(() => {
      expect(api.skills.repairDistribution).toHaveBeenCalledWith('skill-1', ['broken-link']);
      expect(api.skills.checkDistribution).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('Repair completed')).toBeInTheDocument();
    expect(screen.getByText(/Blocked — Conflict was left untouched\./)).toBeInTheDocument();
  });

  it('shows a useful empty state when the skill has no persisted destinations', async () => {
    const api = createApiMock({
      skills: {
        checkDistribution: vi.fn(async () => ({
          ...report,
          destinations: [],
          summary: { total: 0, healthy: 0, attention: 0, blocked: 0, repairable: 0 },
        })),
      },
    });

    renderWithProviders(
      <SkillHealthDialog open={true} onOpenChange={vi.fn()} skill={skill} />,
    );

    expect(await screen.findByText('No persisted destinations found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
    expect(api.skills.repairDistribution).not.toHaveBeenCalled();
  });

  it('shows a retryable error when verification fails', async () => {
    const api = createApiMock({
      skills: {
        checkDistribution: vi.fn()
          .mockRejectedValueOnce(new Error('Permission denied'))
          .mockResolvedValueOnce({
            ...report,
            destinations: [],
            summary: { total: 0, healthy: 0, attention: 0, blocked: 0, repairable: 0 },
          }),
      },
    });

    renderWithProviders(
      <SkillHealthDialog open={true} onOpenChange={vi.fn()} skill={skill} />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No persisted destinations found')).toBeInTheDocument();
    expect(api.skills.checkDistribution).toHaveBeenCalledTimes(2);
  });
});
