import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SettingsPage from './SettingsPage';
import { createApiMock, renderWithProviders } from '../test-utils';

vi.mock('../components/ui/FormDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div>
        <button onClick={() => props.onSubmit({ centralSkillsRoot: 'D:/skills' })}>submit-path</button>
      </div>
    ) : null,
}));

describe('SettingsPage', () => {
  it('loads and updates settings controls', async () => {
    const api = createApiMock({
      settings: {
        get: vi.fn(async () => ({
          centralSkillsRoot: 'C:/skills',
          checkForUpdates: true,
          autoScanProjects: false,
          symlinkStrategy: 'auto',
          theme: 'dark',
          githubToken: '',
        })),
        update: vi.fn(async () => ({})),
      },
      githubImport: {
        parseUrl: vi.fn(async () => ({ owner: 'anthropics', repo: 'skills' })),
        analyze: vi.fn(async () => ({ skills: [] })),
      },
    });

    renderWithProviders(<SettingsPage />);

    expect(await screen.findByDisplayValue('C:/skills')).toBeInTheDocument();

    const select = screen.getByRole('combobox');
    await userEvent.selectOptions(select, 'junction');
    await waitFor(() => {
      expect(api.settings.update).toHaveBeenCalledWith({ symlinkStrategy: 'junction' });
    });

    const toggles = screen.getAllByRole('checkbox');
    await userEvent.click(toggles[0]);
    await waitFor(() => {
      expect(api.settings.update).toHaveBeenCalledWith({ checkForUpdates: false });
    });

    await userEvent.click(screen.getByRole('button', { name: 'Test' }));
    expect(await screen.findByText('Connection OK')).toBeInTheDocument();
  });

  it('reports token test failure from API errors', async () => {
    createApiMock({
      settings: {
        get: vi.fn(async () => ({
          centralSkillsRoot: 'C:/skills',
          checkForUpdates: true,
          autoScanProjects: true,
          symlinkStrategy: 'auto',
          theme: 'dark',
          githubToken: '',
        })),
      },
      githubImport: {
        parseUrl: vi.fn(async () => ({ owner: 'anthropics', repo: 'skills' })),
        analyze: vi.fn(async () => ({ error: true, message: 'Rate limit exceeded' })),
      },
    });

    renderWithProviders(<SettingsPage />);
    await screen.findByText('GitHub Integration');

    await userEvent.click(screen.getByRole('button', { name: 'Test' }));
    expect(await screen.findByText('Connection Failed')).toBeInTheDocument();
    expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument();
  });
});
