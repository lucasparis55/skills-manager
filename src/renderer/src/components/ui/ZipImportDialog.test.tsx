import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ZipImportDialog from './ZipImportDialog';
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
    description: '',
    sourcePath: '',
    hasSkillMd: true,
    fileCount: 4,
    structure: 'single-skill',
    archiveInfo: {
      zipPath: 'C:/skills.zip',
      fileName: 'skills.zip',
      fileCount: 4,
    },
    files: [{ path: 'SKILL.md', archivePath: 'root/SKILL.md', size: 120 }],
  },
  {
    name: 'skill-2',
    displayName: 'Skill 2',
    description: '',
    sourcePath: 'skill-2',
    hasSkillMd: false,
    fileCount: 2,
    structure: 'folder-per-skill',
    archiveInfo: {
      zipPath: 'C:/skills.zip',
      fileName: 'skills.zip',
      fileCount: 4,
    },
    files: [{ path: 'skill-2/README.md', archivePath: 'root/skill-2/README.md', size: 32 }],
  },
];

describe('ZipImportDialog', () => {
  it('analyzes a selected ZIP and imports without conflicts', async () => {
    const onOpenChange = vi.fn();
    const onImportComplete = vi.fn();
    const api = createApiMock({
      dialog: {
        selectFile: vi.fn(async () => 'C:/skills.zip'),
      },
      zipImport: {
        analyze: vi.fn(async () => ({
          archiveInfo: {
            zipPath: 'C:/skills.zip',
            fileName: 'skills.zip',
            fileCount: 6,
          },
          skills: detectedSkills,
        })),
        checkConflicts: vi.fn(async () => ({ 'skill-1': false, 'skill-2': false })),
        importSkills: vi.fn(async () => [
          { skillName: 'skill-1', status: 'imported' },
          { skillName: 'skill-2', status: 'imported' },
        ]),
      },
    });

    renderWithProviders(
      <ZipImportDialog open={true} onOpenChange={onOpenChange} onImportComplete={onImportComplete} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Select ZIP' }));

    expect(api.dialog.selectFile).toHaveBeenCalledWith({
      title: 'Select Skill ZIP Archive',
      filters: [{ name: 'ZIP Archives', extensions: ['zip'] }],
    });
    expect(await screen.findByText('skills.zip')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Import Selected (2)' }));
    expect(await screen.findByText('2 imported')).toBeInTheDocument();
    expect(api.zipImport.importSkills).toHaveBeenCalledWith({
      zipPath: 'C:/skills.zip',
      skills: detectedSkills,
      resolutions: {},
    });

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onImportComplete).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('handles conflicts, progress updates, and cancel action', async () => {
    let progressListener: ((progress: any) => void) | null = null;
    let resolveImport: ((value: any[]) => void) | null = null;
    const importPromise = new Promise<any[]>((resolve) => {
      resolveImport = resolve;
    });

    const api = createApiMock({
      dialog: {
        selectFile: vi.fn(async () => 'C:/skills.zip'),
      },
      zipImport: {
        analyze: vi.fn(async () => ({
          archiveInfo: {
            zipPath: 'C:/skills.zip',
            fileName: 'skills.zip',
            fileCount: 6,
          },
          skills: detectedSkills,
        })),
        checkConflicts: vi.fn(async () => ({ 'skill-1': true, 'skill-2': false })),
        importSkills: vi.fn(() => importPromise),
        cancelImport: vi.fn(async () => ({ success: true })),
        onProgress: vi.fn((callback: (progress: any) => void) => {
          progressListener = callback;
          return () => {};
        }),
      },
    });

    renderWithProviders(<ZipImportDialog open={true} onOpenChange={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Select ZIP' }));
    await screen.findByText('skills.zip');

    await userEvent.click(screen.getByRole('button', { name: 'Import Selected (2)' }));
    expect(await screen.findByText('Resolve Conflicts')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Rename to:'));
    await userEvent.clear(screen.getByDisplayValue('skill-1-2'));
    await userEvent.type(screen.getByRole('textbox'), 'skill-1-renamed');
    await userEvent.click(screen.getByRole('button', { name: 'Proceed with Import' }));

    expect(await screen.findByText('Starting import...')).toBeInTheDocument();
    progressListener?.({
      current: 1,
      total: 2,
      currentSkillName: 'skill-1',
      phase: 'reading',
      percentComplete: 50,
    });
    expect(await screen.findByText('Reading skill-1... (1/2)')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel Import' }));
    expect(api.zipImport.cancelImport).toHaveBeenCalledTimes(1);

    resolveImport?.([{ skillName: 'skill-1-renamed', status: 'renamed', originalName: 'skill-1' }]);
    await waitFor(() => {
      expect(screen.getByText('1 imported')).toBeInTheDocument();
    });
    expect(api.zipImport.importSkills).toHaveBeenCalledWith({
      zipPath: 'C:/skills.zip',
      skills: detectedSkills,
      resolutions: { 'skill-1': { strategy: 'rename', newName: 'skill-1-renamed' } },
    });
  });
});
