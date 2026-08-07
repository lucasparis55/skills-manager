import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PluginsPage from './PluginsPage';
import { createApiMock, renderWithProviders } from '../test-utils';

const inventory = {
  scannedAt: '2026-08-07T18:00:00.000Z',
  rootPath: 'C:/Users/test/.codex/plugins/cache',
  plugins: [{
    id: 'openai-curated-remote/codex-security@1.2.3',
    marketplace: 'openai-curated-remote',
    name: 'codex-security',
    displayName: 'Codex Security',
    version: '1.2.3',
    description: 'Security checks for Codex projects',
    bundlePath: 'C:/Users/test/.codex/plugins/cache/openai-curated-remote/codex-security/1.2.3',
    manifestPath: 'C:/Users/test/.codex/plugins/cache/openai-curated-remote/codex-security/1.2.3/.codex-plugin/plugin.json',
    status: 'cache-detected' as const,
  }],
};

describe('PluginsPage', () => {
  it('loads and refreshes a read-only Codex Desktop plugin inventory', async () => {
    const api = createApiMock({
      plugins: {
        scan: vi.fn(async () => inventory),
      },
    });

    renderWithProviders(<PluginsPage />);

    expect(await screen.findByRole('heading', { name: 'Codex Desktop plugins' })).toBeInTheDocument();
    expect(screen.getByText('Codex Security')).toBeInTheDocument();
    expect(screen.getByText('codex-security')).toBeInTheDocument();
    expect(screen.getByText('openai-curated-remote')).toBeInTheDocument();
    expect(screen.getByText('v1.2.3')).toBeInTheDocument();
    expect(screen.getByText(/Last scan:/)).toBeInTheDocument();
    expect(screen.getByText(inventory.rootPath)).toBeInTheDocument();
    expect(api.plugins.scan).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(api.plugins.scan).toHaveBeenCalledTimes(2));
  });

  it('shows a comprehensible empty state when no plugin bundle is found', async () => {
    createApiMock({
      plugins: {
        scan: vi.fn(async () => ({ ...inventory, plugins: [] })),
      },
    });

    renderWithProviders(<PluginsPage />);

    expect(await screen.findByText('No Codex Desktop plugins found in the local cache.')).toBeInTheDocument();
  });

  it('shows a retry action when the inventory read fails', async () => {
    const api = createApiMock({
      plugins: {
        scan: vi
          .fn()
          .mockRejectedValueOnce(new Error('Cache read failed'))
          .mockResolvedValue(inventory),
      },
    });

    renderWithProviders(<PluginsPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Cache read failed');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Codex Security')).toBeInTheDocument();
    expect(api.plugins.scan).toHaveBeenCalledTimes(2);
  });
});
