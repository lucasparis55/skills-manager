import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SkillEditDialog from './SkillEditDialog';
import { createApiMock, renderWithProviders } from '../../test-utils';

vi.mock('@radix-ui/react-dialog', () => ({
  Root: ({ open, children }: any) => (open ? <div>{children}</div> : null),
  Portal: ({ children }: any) => <>{children}</>,
  Overlay: ({ children }: any) => <div>{children}</div>,
  Content: ({ children }: any) => <div>{children}</div>,
  Title: ({ children }: any) => <div>{children}</div>,
  Close: ({ children }: any) => <>{children}</>,
}));

vi.mock('./FileBrowser', () => ({
  default: ({ skillId, onFileChange }: any) => (
    <div>
      <span>Files for {skillId}</span>
      <button onClick={onFileChange}>refresh-files</button>
    </div>
  ),
}));

const skill = {
  id: 'skill-1',
  name: 'skill-1',
  displayName: 'Skill 1',
  description: 'A useful skill',
  version: '1.0.0',
  targetIDEs: ['claude-code'],
  tags: ['core'],
};

describe('SkillEditDialog', () => {
  it('saves metadata updates and shows success feedback', async () => {
    const onSave = vi.fn();
    const api = createApiMock({
      skills: {
        update: vi.fn(async () => ({})),
      },
    });

    renderWithProviders(
      <SkillEditDialog open={true} onOpenChange={vi.fn()} skill={skill} onSave={onSave} />,
    );

    expect(screen.getByText('Edit Skill: Skill 1')).toBeInTheDocument();

    const displayNameInput = screen.getAllByRole('textbox')[0];
    await userEvent.clear(displayNameInput);
    await userEvent.type(displayNameInput, 'Skill One');
    await userEvent.click(screen.getByRole('button', { name: 'Save Metadata' }));

    await waitFor(() => {
      expect(api.skills.update).toHaveBeenCalledWith('skill-1', expect.objectContaining({
        displayName: 'Skill One',
      }));
    });
    expect(onSave).toHaveBeenCalled();
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('loads and saves SKILL.md content', async () => {
    const onSave = vi.fn();
    const api = createApiMock({
      skills: {
        getContent: vi.fn(async () => '# Title\n\nBody'),
        saveContent: vi.fn(async () => ({ success: true })),
      },
    });

    renderWithProviders(
      <SkillEditDialog open={true} onOpenChange={vi.fn()} skill={skill} onSave={onSave} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'SKILL.md' }));
    const editor = await screen.findByPlaceholderText('Edit SKILL.md content...');
    expect((editor as HTMLTextAreaElement).value).toContain('Title');
    await userEvent.type(editor, '\nNew line');
    await userEvent.click(screen.getByRole('button', { name: 'Save Content' }));

    await waitFor(() => {
      expect(api.skills.saveContent).toHaveBeenCalledWith('skill-1', expect.stringContaining('New line'));
    });
    expect(onSave).toHaveBeenCalled();
  });

  it('renders files tab and bubbles file-change callback', async () => {
    const onSave = vi.fn();
    createApiMock();

    renderWithProviders(
      <SkillEditDialog open={true} onOpenChange={vi.fn()} skill={skill} onSave={onSave} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Files' }));
    expect(await screen.findByText('Files for skill-1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'refresh-files' }));
    expect(onSave).toHaveBeenCalled();
  });
});
