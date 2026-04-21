import { act, screen, waitFor } from '@testing-library/react';
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
  Close: ({ children }: any) => <>{children}</>,
}));

const detectedSkills = [
  {
    name: 'skill-1',
    displayName: 'Skill 1',
    description: 'First skill',
    sourcePath: '/skills/skill-1',
    hasSkillMd: true,
    fileCount: 4,
    structure: 'folder-per-skill',
    repoInfo: {
      fullName: 'acme/skills',
      htmlUrl: 'https://github.com/acme/skills',
      description: 'desc',
      starsCount: 1,
    },
  },
  {
    name: 'skill-2',
    displayName: 'Skill 2',
    description: 'Second skill',
    sourcePath: '/skills/skill-2',
    hasSkillMd: false,
    fileCount: 2,
    structure: 'folder-per-skill',
    repoInfo: {
      fullName: 'acme/skills',
      htmlUrl: 'https://github.com/acme/skills',
      description: 'desc',
      starsCount: 1,
    },
  },
];

describe('GitHubImportDialog', () => {
  it('shows error when URL parse fails', async () => {
    const api = createApiMock({
      githubImport: {
        parseUrl: vi.fn(async () => ({ error: true, message: 'Invalid URL format' })),
      },
    });

    renderWithProviders(
      <GitHubImportDialog open={true} onOpenChange={vi.fn()} />,
    );

    await userEvent.type(screen.getByPlaceholderText('https://github.com/owner/repo'), 'owner/repo');
    await userEvent.click(screen.getByRole('button', { name: 'Analyze' }));

    expect(await screen.findByText('Invalid URL format')).toBeInTheDocument();
    expect(api.githubImport.analyze).not.toHaveBeenCalled();
  });

  it('imports selected skills without conflicts and closes with completion callback', async () => {
    const onOpenChange = vi.fn();
    const onImportComplete = vi.fn();
    const api = createApiMock({
      githubImport: {
        parseUrl: vi.fn(async () => ({ owner: 'acme', repo: 'skills' })),
        analyze: vi.fn(async () => ({
          repoInfo: { fullName: 'acme/skills', description: 'Test repo' },
          skills: detectedSkills,
        })),
        checkConflicts: vi.fn(async () => ({ 'skill-1': false, 'skill-2': false })),
        importSkills: vi.fn(async () => [
          { skillName: 'Skill 1', status: 'imported' },
          { skillName: 'Skill 2', status: 'skipped' },
        ]),
      },
    });

    renderWithProviders(
      <GitHubImportDialog open={true} onOpenChange={onOpenChange} onImportComplete={onImportComplete} />,
    );

    await userEvent.type(screen.getByPlaceholderText('https://github.com/owner/repo'), 'owner/repo');
    await userEvent.click(screen.getByRole('button', { name: 'Analyze' }));

    expect(await screen.findByText('acme/skills')).toBeInTheDocument();
    expect(screen.getByText('2 of 2 selected')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Import Selected (2)' }));

    expect(await screen.findByText('1 imported')).toBeInTheDocument();
    expect(screen.getByText('1 skipped')).toBeInTheDocument();
    expect(api.githubImport.importSkills).toHaveBeenCalledWith({
      parsed: { owner: 'acme', repo: 'skills' },
      skills: detectedSkills,
      resolutions: {},
    });

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onImportComplete).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('handles conflicts, progress updates, and cancel import action', async () => {
    let progressListener: ((progress: any) => void) | null = null;
    let resolveImport: ((value: any[]) => void) | null = null;
    const importPromise = new Promise<any[]>((resolve) => {
      resolveImport = resolve;
    });

    const api = createApiMock({
      githubImport: {
        parseUrl: vi.fn(async () => ({ owner: 'acme', repo: 'skills' })),
        analyze: vi.fn(async () => ({
          repoInfo: { fullName: 'acme/skills', description: 'Test repo' },
          skills: detectedSkills,
        })),
        checkConflicts: vi.fn(async () => ({ 'skill-1': true, 'skill-2': false })),
        importSkills: vi.fn(() => importPromise),
        cancelImport: vi.fn(async () => ({ success: true })),
        onProgress: vi.fn((cb: (progress: any) => void) => {
          progressListener = cb;
          return () => {};
        }),
      },
    });

    renderWithProviders(
      <GitHubImportDialog open={true} onOpenChange={vi.fn()} />,
    );

    await userEvent.type(screen.getByPlaceholderText('https://github.com/owner/repo'), 'owner/repo');
    await userEvent.click(screen.getByRole('button', { name: 'Analyze' }));
    await screen.findByText('acme/skills');

    await userEvent.click(screen.getByRole('button', { name: 'Import Selected (2)' }));
    expect(await screen.findByText('Resolve Conflicts')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Rename to:'));
    await userEvent.clear(screen.getByDisplayValue('skill-1-2'));
    await userEvent.type(screen.getByRole('textbox'), 'skill-1-renamed');
    await userEvent.click(screen.getByRole('button', { name: 'Proceed with Import' }));

    expect(await screen.findByText('Starting import...')).toBeInTheDocument();
    expect(api.githubImport.onProgress).toHaveBeenCalledTimes(1);

    act(() => {
      progressListener?.({
        current: 1,
        total: 2,
        currentSkillName: 'Skill 1',
        phase: 'fetching',
        percentComplete: 50,
      });
    });
    expect(await screen.findByText('Fetching Skill 1... (1/2)')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel Import' }));
    expect(api.githubImport.cancelImport).toHaveBeenCalledTimes(1);

    resolveImport?.([{ skillName: 'Skill 1', status: 'renamed', originalName: 'skill-1' }]);
    await waitFor(() => {
      expect(screen.getByText('1 imported')).toBeInTheDocument();
    });
    expect(api.githubImport.importSkills).toHaveBeenCalledWith({
      parsed: { owner: 'acme', repo: 'skills' },
      skills: detectedSkills,
      resolutions: { 'skill-1': { strategy: 'rename', newName: 'skill-1-renamed' } },
    });
  });
});
