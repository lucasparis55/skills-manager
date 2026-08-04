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

vi.mock('../components/ui/ConfirmDialog', () => ({
  default: (props: any) => props.open ? (
    <div>
      <p>{props.description}</p>
      <button onClick={props.onConfirm}>confirm-migration</button>
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
          projectScanDepth: 2,
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

    const selects = screen.getAllByRole('combobox');
    await userEvent.selectOptions(selects[0], 'junction');
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

  it('previews misplaced links and applies only ready migrations after confirmation', async () => {
    const api = createApiMock({
      settings: {
        get: vi.fn(async () => ({
          centralSkillsRoot: 'C:/skills',
          checkForUpdates: true,
          autoScanProjects: true,
          symlinkStrategy: 'auto',
          theme: 'dark',
          hasGithubToken: false,
          ideRootOverrides: {},
        })),
      },
      ides: {
        list: vi.fn(async () => []),
        detectRoots: vi.fn(async () => []),
      },
      links: {
        previewMigration: vi.fn(async () => ({
          scannedAt: 'now',
          candidates: [
            {
              linkId: 'cursor-review',
              skillId: 'review',
              skillName: 'review',
              ideId: 'cursor',
              ideName: 'Cursor',
              sourcePath: 'C:/skills/review',
              currentPath: 'C:/Users/test/.cursor/review',
              targetPath: 'C:/Users/test/.cursor/skills/review',
              status: 'ready',
            },
            {
              linkId: 'codex-conflict',
              skillId: 'conflict',
              skillName: 'conflict',
              ideId: 'codex-desktop',
              ideName: 'Codex Desktop',
              sourcePath: 'C:/skills/conflict',
              currentPath: 'C:/Users/test/.codex/conflict',
              targetPath: 'C:/Users/test/.codex/skills/conflict',
              status: 'conflict',
              message: 'Canonical destination already exists.',
            },
          ],
        })),
        migrate: vi.fn(async () => [{
          linkId: 'cursor-review',
          skillId: 'review',
          skillName: 'review',
          ideId: 'cursor',
          ideName: 'Cursor',
          sourcePath: 'C:/skills/review',
          currentPath: 'C:/Users/test/.cursor/review',
          targetPath: 'C:/Users/test/.cursor/skills/review',
          status: 'migrated',
        }]),
      },
    });

    renderWithProviders(<SettingsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Scan for misplaced links' }));

    expect(await screen.findByText('C:/Users/test/.cursor/review')).toBeInTheDocument();
    expect(screen.getByText('Conflict')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Migrate 1 ready link' }));
    expect(screen.getByText(/This will create canonical links/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'confirm-migration' }));

    await waitFor(() => {
      expect(api.links.migrate).toHaveBeenCalledWith(['cursor-review']);
    });
    expect(await screen.findByText('Migration completed')).toBeInTheDocument();
  });
});
