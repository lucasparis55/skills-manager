import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import FileBrowser from './FileBrowser';
import { createApiMock, renderWithProviders } from '../../test-utils';

vi.mock('./ConfirmDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div data-testid="confirm-delete">
        <div>{props.title}</div>
        <button onClick={props.onConfirm}>{props.confirmLabel || 'confirm'}</button>
      </div>
    ) : null,
}));

const files = [
  { path: 'SKILL.md', name: 'SKILL.md', isDirectory: false, size: 1024 },
  { path: 'assets', name: 'assets', isDirectory: true, size: 0 },
  { path: 'docs/usage.md', name: 'usage.md', isDirectory: false, size: 10 },
];

describe('FileBrowser', () => {
  it('loads files, opens folder, and edits/saves a file', async () => {
    const onFileChange = vi.fn();
    const api = createApiMock({
      skills: {
        listFiles: vi.fn(async () => files),
        openFolder: vi.fn(async () => ({ success: true })),
        readFile: vi.fn(async () => '# existing content'),
        writeFile: vi.fn(async () => ({ success: true })),
      },
    });

    renderWithProviders(<FileBrowser skillId="s1" onFileChange={onFileChange} />);

    expect(await screen.findByText('Skill Files (3)')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
    expect(api.skills.openFolder).toHaveBeenCalledWith('s1');

    await userEvent.click(screen.getAllByTitle('Edit file')[0]);
    expect(api.skills.readFile).toHaveBeenCalledWith('s1', 'SKILL.md');
    expect(await screen.findByText('Edit: SKILL.md')).toBeInTheDocument();

    await userEvent.clear(screen.getByPlaceholderText('File content...'));
    await userEvent.type(screen.getByPlaceholderText('File content...'), 'updated');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(api.skills.writeFile).toHaveBeenCalledWith('s1', 'SKILL.md', 'updated');
    });
    expect(onFileChange).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('creates a new file and deletes an existing file', async () => {
    const onFileChange = vi.fn();
    const api = createApiMock({
      skills: {
        listFiles: vi.fn(async () => files),
        writeFile: vi.fn(async () => ({ success: true })),
        deleteFile: vi.fn(async () => ({ success: true })),
      },
    });

    renderWithProviders(<FileBrowser skillId="s1" onFileChange={onFileChange} />);
    await screen.findByText('Skill Files (3)');

    await userEvent.click(screen.getByRole('button', { name: 'New File' }));
    await userEvent.type(screen.getByPlaceholderText('filename.md'), 'notes.md');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('New File: notes.md')).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText('File content...'), 'hello');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(api.skills.writeFile).toHaveBeenCalledWith('s1', 'notes.md', 'hello');
    });

    const list = screen.getByText('Skill Files (3)').closest('div');
    expect(list).not.toBeNull();
    await userEvent.click(screen.getAllByTitle('Delete file')[0]);
    const confirm = await screen.findByTestId('confirm-delete');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(api.skills.deleteFile).toHaveBeenCalledWith('s1', 'SKILL.md');
    });
    expect(onFileChange).toHaveBeenCalled();
    expect(await screen.findByText('Deleted')).toBeInTheDocument();
  });
});
