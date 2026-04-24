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
          hasGithubToken: true,
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

    await userEvent.type(screen.getByPlaceholderText('ghp_xxxxxxxxxxxxxxxxxxxx'), 'ghp_secure_value');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(api.settings.setGithubToken).toHaveBeenCalledWith('ghp_secure_value');
    });

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => {
      expect(api.settings.clearGithubToken).toHaveBeenCalledTimes(1);
    });

    await userEvent.click(screen.getByRole('button', { name: 'Test' }));
    expect(await screen.findByText('Connection OK')).toBeInTheDocument();
  });

  it('displays detected IDE roots and manages overrides', async () => {
    const api = createApiMock({
      settings: {
        get: vi.fn(async () => ({
          centralSkillsRoot: 'C:/skills',
          checkForUpdates: true,
          autoScanProjects: false,
          symlinkStrategy: 'auto',
          theme: 'dark',
          hasGithubToken: false,
          ideRootOverrides: {},
        })),
        update: vi.fn(async () => ({})),
      },
      ides: {
        list: vi.fn(async () => [
          { id: 'claude-code', name: 'Claude Code CLI', configFormat: 'json', mode: 'subagents' },
        ]),
        detectRoots: vi.fn(async () => [
          { ideId: 'claude-code', root: 'C:/Users/test/.claude', exists: true, isPrimary: true, isConfigured: false },
          { ideId: 'claude-code', root: 'C:/Users/test/.claude-secondary', exists: false, isPrimary: false, isConfigured: false },
        ]),
      },
    });

    renderWithProviders(<SettingsPage />);

    expect(await screen.findByText('Claude Code CLI')).toBeInTheDocument();
    expect(screen.getByText('C:/Users/test/.claude')).toBeInTheDocument();
    expect(screen.getByText('C:/Users/test/.claude-secondary')).toBeInTheDocument();

    const overrideInput = screen.getByPlaceholderText('Override path (optional)');
    await userEvent.type(overrideInput, 'D:/custom/claude');

    await userEvent.click(screen.getByRole('button', { name: 'Save Override' }));
    await waitFor(() => {
      expect(api.settings.update).toHaveBeenCalledWith({
        ideRootOverrides: { 'claude-code': 'D:/custom/claude' },
      });
    });
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
          hasGithubToken: false,
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
