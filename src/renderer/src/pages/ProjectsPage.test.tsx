import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ProjectsPage from './ProjectsPage';
import { createApiMock, renderWithProviders } from '../test-utils';

vi.mock('../components/ui/FormDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div>
        <button onClick={() => props.onSubmit({ path: 'C:/repo/new-project' })}>submit-project</button>
      </div>
    ) : null,
}));

vi.mock('../components/ui/ConfirmDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div>
        <button onClick={props.onConfirm}>{props.confirmLabel || 'confirm'}</button>
      </div>
    ) : null,
}));

describe('ProjectsPage', () => {
  it('renders projects, scans, adds and removes project', async () => {
    const api = createApiMock({
      projects: {
        list: vi
          .fn()
          .mockResolvedValueOnce([
            {
              id: 'p1',
              name: 'Repo 1',
              path: 'C:/repo1',
              detectedIDEs: ['claude-code'],
              addedAt: '2024-01-01',
              metadata: { hasGit: true },
            },
          ])
          .mockResolvedValue([
            {
              id: 'p1',
              name: 'Repo 1',
              path: 'C:/repo1',
              detectedIDEs: ['claude-code'],
              addedAt: '2024-01-01',
              metadata: { hasGit: true },
            },
          ]),
        scan: vi.fn(async () => [{ id: 'p1' }]),
        add: vi.fn(async () => ({ id: 'p2' })),
        remove: vi.fn(async () => ({ success: true })),
      },
    });

    renderWithProviders(<ProjectsPage />);

    expect(await screen.findByText('1 Projects')).toBeInTheDocument();
    expect(screen.getByText('Repo 1')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Scan' }));
    await waitFor(() => {
      expect(api.projects.scan).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText('Scan Complete')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add Project' }));
    await userEvent.click(screen.getByRole('button', { name: 'submit-project' }));
    await waitFor(() => {
      expect(api.projects.add).toHaveBeenCalledWith('C:/repo/new-project');
    });
    expect(await screen.findByText('Project added')).toBeInTheDocument();

    expect(api.projects.remove).not.toHaveBeenCalled();
  });

  it('selects all projects and removes selected items with partial failure feedback', async () => {
    const api = createApiMock({
      projects: {
        list: vi.fn(async () => [
          {
            id: 'p1',
            name: 'Repo 1',
            path: 'C:/repo1',
            detectedIDEs: [],
            addedAt: '2024-01-01',
            metadata: { hasGit: true },
          },
          {
            id: 'p2',
            name: 'Repo 2',
            path: 'C:/repo2',
            detectedIDEs: [],
            addedAt: '2024-01-01',
            metadata: { hasGit: false },
          },
        ]),
        remove: vi
          .fn()
          .mockResolvedValueOnce({ success: true })
          .mockRejectedValueOnce(new Error('remove failed')),
      },
    });

    renderWithProviders(<ProjectsPage />);

    expect(await screen.findByText('2 Projects')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Select all'));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Selected' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(api.projects.remove).toHaveBeenCalledTimes(2);
    });
    expect(api.projects.remove).toHaveBeenNthCalledWith(1, 'p1');
    expect(api.projects.remove).toHaveBeenNthCalledWith(2, 'p2');
    expect(await screen.findByText('Partial removal')).toBeInTheDocument();
  });
});
