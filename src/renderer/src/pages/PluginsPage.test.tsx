import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PluginsPage from './PluginsPage';
import { createApiMock, renderWithProviders } from '../test-utils';

const componentProvenance = {
  pluginId: 'openai-curated-remote/codex-security',
  marketplace: 'openai-curated-remote',
  pluginName: 'codex-security',
  version: '1.2.3',
};

const inventory = {
  scannedAt: '2026-08-07T18:00:00.000Z',
  rootPath: 'C:/Users/test/.codex/plugins/cache',
  plugins: [{
    id: 'openai-curated-remote/codex-security',
    marketplace: 'openai-curated-remote',
    name: 'codex-security',
    displayName: 'Codex Security',
    author: 'OpenAI',
    description: 'Security checks for Codex projects',
    category: 'Engineering',
    capabilities: ['Read', 'Write'],
    status: 'cache-detected' as const,
    versions: [{
      id: 'openai-curated-remote/codex-security@1.2.3',
      version: '1.2.3',
      author: 'OpenAI',
      description: 'Security checks for Codex projects',
      category: 'Engineering',
      capabilities: ['Read', 'Write'],
      bundlePath: 'C:/Users/test/.codex/plugins/cache/openai-curated-remote/codex-security/1.2.3',
      manifestPath: 'C:/Users/test/.codex/plugins/cache/openai-curated-remote/codex-security/1.2.3/.codex-plugin/plugin.json',
      status: 'cache-detected' as const,
      components: [
        {
          id: 'skill:review',
          kind: 'skill' as const,
          name: 'review',
          reference: './skills/review',
          status: 'available' as const,
          provenance: componentProvenance,
        },
        {
          id: 'app:github',
          kind: 'app' as const,
          name: 'github',
          reference: './.app.json',
          status: 'available' as const,
          provenance: componentProvenance,
        },
        {
          id: 'mcp-server:security',
          kind: 'mcp-server' as const,
          name: 'security',
          reference: './.mcp.json',
          status: 'available' as const,
          provenance: componentProvenance,
        },
      ],
      componentCounts: { skills: 1, apps: 1, mcpServers: 1 },
      issues: [],
    }],
    componentCounts: { skills: 1, apps: 1, mcpServers: 1 },
    management: { uninstall: 'unavailable' as const },
    issues: [],
  }],
  invalidEntries: [],
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
    expect(screen.getAllByText('openai-curated-remote')).not.toHaveLength(0);
    expect(screen.getByText('v1.2.3')).toBeInTheDocument();
    expect(screen.getByText('review')).toBeInTheDocument();
    expect(screen.getByText('github')).toBeInTheDocument();
    expect(screen.getByText('security')).toBeInTheDocument();
    expect(screen.getAllByText('Plugin provenance: openai-curated-remote/codex-security@1.2.3')).toHaveLength(3);
    expect(screen.getAllByText('1 skill · 1 app · 1 MCP server')).not.toHaveLength(0);
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

  it('filters plugins by search, marketplace, category, and status', async () => {
    const bundledPlugin = {
      ...inventory.plugins[0],
      id: 'openai-bundled/documents',
      marketplace: 'openai-bundled',
      name: 'documents',
      displayName: 'Documents',
      description: 'Document tools',
      category: 'Productivity',
      capabilities: ['Read'],
      status: 'bundled' as const,
      versions: [{
        ...inventory.plugins[0].versions[0],
        id: 'openai-bundled/documents@1.0.0',
        version: '1.0.0',
        category: 'Productivity',
        capabilities: ['Read'],
        status: 'bundled' as const,
      }],
    };
    const api = createApiMock({
      plugins: {
        scan: vi.fn(async () => ({ ...inventory, plugins: [inventory.plugins[0], bundledPlugin] })),
      },
    });

    renderWithProviders(<PluginsPage />);

    expect(await screen.findByRole('heading', { name: 'Documents' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Codex Security' })).toBeInTheDocument();

    const search = screen.getByRole('searchbox', { name: 'Search plugins' });
    await userEvent.type(search, 'documents');
    expect(screen.getByRole('heading', { name: 'Documents' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Codex Security' })).not.toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by marketplace' }), 'openai-bundled');
    expect(screen.getByRole('heading', { name: 'Documents' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Codex Security' })).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by category' }), 'Engineering');
    expect(screen.queryByRole('heading', { name: 'Documents' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Codex Security' })).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by marketplace' }), 'all');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by category' }), 'all');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), 'cache-detected');
    expect(screen.getByRole('heading', { name: 'Codex Security' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Documents' })).not.toBeInTheDocument();
    expect(api.plugins.scan).toHaveBeenCalledTimes(1);
  });

  it('offers an explicit category filter for plugins without a category', async () => {
    const uncategorizedPlugin = {
      ...inventory.plugins[0],
      id: 'openai-curated-remote/uncategorized',
      name: 'uncategorized',
      displayName: 'Uncategorized plugin',
      category: '',
      versions: [{ ...inventory.plugins[0].versions[0], id: 'openai-curated-remote/uncategorized@1.0.0', category: '' }],
    };
    createApiMock({
      plugins: {
        scan: vi.fn(async () => ({ ...inventory, plugins: [inventory.plugins[0], uncategorizedPlugin] })),
      },
    });

    renderWithProviders(<PluginsPage />);

    expect(await screen.findByRole('heading', { name: 'Uncategorized plugin' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by category' }), '__uncategorized__');

    expect(screen.getByRole('heading', { name: 'Uncategorized plugin' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Codex Security' })).not.toBeInTheDocument();
  });

  it('keeps multiple versions under one plugin and labels protected sources', async () => {
    const secondVersion = {
      ...inventory.plugins[0].versions[0],
      id: 'openai-curated-remote/codex-security@1.3.0',
      version: '1.3.0',
    };
    const protectedPlugin = {
      ...inventory.plugins[0],
      id: 'openai-primary-runtime/documents',
      name: 'documents',
      displayName: 'Documents',
      marketplace: 'openai-primary-runtime',
      status: 'protected' as const,
      versions: [{ ...secondVersion, id: 'openai-primary-runtime/documents@1.0.0', version: '1.0.0', status: 'protected' as const }],
    };
    const api = createApiMock({
      plugins: {
        scan: vi.fn(async () => ({
          ...inventory,
          plugins: [{ ...inventory.plugins[0], versions: [inventory.plugins[0].versions[0], secondVersion] }, protectedPlugin],
        })),
      },
    });

    renderWithProviders(<PluginsPage />);

    expect(await screen.findByText('v1.3.0')).toBeInTheDocument();
    expect(screen.getAllByText('Protected')).not.toHaveLength(0);
    expect(screen.getByText('2 versions')).toBeInTheDocument();
    expect(api.plugins.scan).toHaveBeenCalledTimes(1);
  });

  it('marks a plugin with broken child references as invalid while keeping the reason visible', async () => {
    const invalidVersion = {
      ...inventory.plugins[0].versions[0],
      status: 'invalid' as const,
      components: [{
        id: 'skill:skills',
        kind: 'skill' as const,
        name: 'skills',
        reference: './missing-skills',
        status: 'missing' as const,
        provenance: componentProvenance,
        reason: 'Referenced component does not exist.',
      }],
      componentCounts: { skills: 1, apps: 0, mcpServers: 0 },
      issues: ['skills: Referenced component does not exist.'],
    };
    createApiMock({
      plugins: {
        scan: vi.fn(async () => ({
          ...inventory,
          plugins: [{
            ...inventory.plugins[0],
            status: 'invalid' as const,
            versions: [invalidVersion],
            componentCounts: { skills: 1, apps: 0, mcpServers: 0 },
            issues: invalidVersion.issues,
          }],
        })),
      },
    });

    renderWithProviders(<PluginsPage />);

    expect((await screen.findAllByText('Invalid')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Referenced component does not exist.')).not.toHaveLength(0);
  });

  it('shows invalid plugin manifests with reasons without displaying an empty state', async () => {
    createApiMock({
      plugins: {
        scan: vi.fn(async () => ({
          ...inventory,
          plugins: [],
          invalidEntries: [{
            id: 'openai-curated-remote/broken-plugin@1.0.0',
            marketplace: 'openai-curated-remote',
            name: 'broken-plugin',
            version: '1.0.0',
            bundlePath: 'C:/cache/broken-plugin/1.0.0',
            manifestPath: 'C:/cache/broken-plugin/1.0.0/.codex-plugin/plugin.json',
            status: 'invalid' as const,
            reason: 'Plugin manifest is not valid JSON.',
          }],
        })),
      },
    });

    renderWithProviders(<PluginsPage />);

    expect(await screen.findByRole('heading', { name: 'Invalid plugin manifests' })).toBeInTheDocument();
    expect(screen.getByText('broken-plugin')).toBeInTheDocument();
    expect(screen.getByText('Plugin manifest is not valid JSON.')).toBeInTheDocument();
    expect(screen.queryByText('No Codex Desktop plugins found in the local cache.')).not.toBeInTheDocument();
  });

  it('opens accessible read-only details and loads a manifest on demand', async () => {
    const readManifest = vi.fn(async () => ({
      versionId: 'openai-curated-remote/codex-security@1.2.3',
      version: '1.2.3',
      manifestPath: inventory.plugins[0].versions[0].manifestPath,
      content: '{"name":"codex-security","version":"1.2.3"}',
    }));
    const api = createApiMock({
      plugins: {
        scan: vi.fn(async () => inventory),
        readManifest,
      },
    });

    renderWithProviders(<PluginsPage />);

    const trigger = await screen.findByRole('button', { name: 'View details for Codex Security' });
    await userEvent.click(trigger);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Plugin details: Codex Security' })).toBeInTheDocument();
    expect(screen.getAllByText('Engineering')).not.toHaveLength(0);
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('Uninstall unavailable in v1.')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getAllByText('Plugin provenance: openai-curated-remote/codex-security@1.2.3')).toHaveLength(3);
    expect(screen.getByText('Plugin-provided skills are not duplicated in the regular skills inventory.')).toBeInTheDocument();
    expect(screen.getByText('Read')).toBeInTheDocument();
    expect(screen.getByText('Write')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'View manifest for version 1.2.3' }));

    expect(api.plugins.readManifest).toHaveBeenCalledWith('openai-curated-remote/codex-security@1.2.3');
    const manifest = await screen.findByLabelText('Plugin manifest');
    expect(manifest.tagName).toBe('PRE');
    expect(manifest).toHaveTextContent('{"name":"codex-security","version":"1.2.3"}');
  });

  it('copies a bundle path and reports clipboard failures', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const api = createApiMock({ plugins: { scan: vi.fn(async () => inventory) } });

    renderWithProviders(<PluginsPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'View details for Codex Security' }));
    await userEvent.click(screen.getByRole('button', { name: 'Copy bundle path for version 1.2.3' }));

    expect(writeText).toHaveBeenCalledWith(inventory.plugins[0].versions[0].bundlePath);
    expect(await screen.findByText('Bundle path copied')).toBeInTheDocument();
    expect(api.plugins.readManifest).not.toHaveBeenCalled();

    writeText.mockRejectedValueOnce(new Error('Clipboard unavailable'));
    await userEvent.click(screen.getByRole('button', { name: 'Copy bundle path for version 1.2.3' }));
    expect(await screen.findByText('Could not copy bundle path')).toBeInTheDocument();
    expect(await screen.findByText('Clipboard unavailable')).toBeInTheDocument();
  });

  it('closes with Escape and returns focus to the details trigger', async () => {
    createApiMock({ plugins: { scan: vi.fn(async () => inventory) } });

    renderWithProviders(<PluginsPage />);

    const trigger = await screen.findByRole('button', { name: 'View details for Codex Security' });
    await userEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
