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
});
