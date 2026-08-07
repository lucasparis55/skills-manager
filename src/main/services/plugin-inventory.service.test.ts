import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { CodexDesktopPluginProvider, PluginInventoryService } from './plugin-inventory.service';

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-manager-plugins-'));
  temporaryDirectories.push(directory);
  return directory;
}

function writePluginManifest(root: string): { bundlePath: string; manifestPath: string } {
  return writePluginBundle(root, 'openai-curated-remote', 'codex-security', '1.2.3', {
    name: 'codex-security',
    version: '1.2.3',
    description: 'Security checks for Codex projects',
    interface: { displayName: 'Codex Security' },
  });
}

function writePluginBundle(
  root: string,
  marketplace: string,
  pluginName: string,
  version: string,
  manifest: Record<string, unknown> = {
    name: pluginName,
    version,
    description: `${pluginName} description`,
    interface: { displayName: pluginName },
  },
): { bundlePath: string; manifestPath: string } {
  const bundlePath = path.join(root, marketplace, pluginName, version);
  const manifestPath = path.join(bundlePath, '.codex-plugin', 'plugin.json');
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
  return { bundlePath, manifestPath };
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('PluginInventoryService', () => {
  it('lists valid Codex Desktop plugin bundles from the injected cache root', () => {
    const cacheRoot = createTemporaryDirectory();
    const { bundlePath, manifestPath } = writePluginManifest(cacheRoot);
    const service = new PluginInventoryService(new CodexDesktopPluginProvider(cacheRoot));

    const inventory = service.scan();

    expect(inventory.rootPath).toBe(cacheRoot);
    expect(inventory.scannedAt).toEqual(expect.any(String));
    expect(inventory.plugins).toEqual([
      {
        id: 'openai-curated-remote/codex-security',
        marketplace: 'openai-curated-remote',
        name: 'codex-security',
        displayName: 'Codex Security',
        author: '',
        description: 'Security checks for Codex projects',
        category: '',
        capabilities: [],
        status: 'cache-detected',
        versions: [{
          id: 'openai-curated-remote/codex-security@1.2.3',
          version: '1.2.3',
          author: '',
          description: 'Security checks for Codex projects',
          category: '',
          capabilities: [],
          bundlePath,
          manifestPath,
          status: 'cache-detected',
          components: [],
          componentCounts: { skills: 0, apps: 0, mcpServers: 0 },
          issues: [],
        }],
        componentCounts: { skills: 0, apps: 0, mcpServers: 0 },
        management: { uninstall: 'unavailable' },
        issues: [],
      },
    ]);
    expect(inventory.invalidEntries).toEqual([]);
  });

  it('returns an empty inventory when the default-shaped cache is not present', () => {
    const cacheRoot = path.join(createTemporaryDirectory(), 'missing-cache');
    const service = new PluginInventoryService(new CodexDesktopPluginProvider(cacheRoot));

    expect(service.scan()).toMatchObject({
      rootPath: cacheRoot,
      plugins: [],
      invalidEntries: [],
    });
  });

  it('preserves the manifest interface short description when top-level description is absent', () => {
    const cacheRoot = createTemporaryDirectory();
    writePluginBundle(cacheRoot, 'openai-curated-remote', 'short-description-plugin', '1.0.0', {
      name: 'short-description-plugin',
      version: '1.0.0',
      interface: { shortDescription: 'Description from the plugin interface' },
    });

    expect(new PluginInventoryService(new CodexDesktopPluginProvider(cacheRoot)).scan().plugins[0])
      .toMatchObject({ description: 'Description from the plugin interface' });
  });

  it('exposes plugin category and capabilities and reads a manifest by version id', () => {
    const cacheRoot = createTemporaryDirectory();
    const manifest = {
      name: 'codex-security',
      version: '1.2.3',
      description: 'Security checks for Codex projects',
      interface: {
        displayName: 'Codex Security',
        category: 'Engineering',
        capabilities: ['Read', 'Write'],
      },
    };
    const { manifestPath } = writePluginBundle(
      cacheRoot,
      'openai-curated-remote',
      'codex-security',
      '1.2.3',
      manifest,
    );
    const service = new PluginInventoryService(new CodexDesktopPluginProvider(cacheRoot));

    const inventory = service.scan();
    const preview = service.readManifest('openai-curated-remote/codex-security@1.2.3');

    expect(inventory.plugins[0]).toMatchObject({
      category: 'Engineering',
      capabilities: ['Read', 'Write'],
      versions: [expect.objectContaining({
        category: 'Engineering',
        capabilities: ['Read', 'Write'],
      })],
    });
    expect(preview).toEqual({
      versionId: 'openai-curated-remote/codex-security@1.2.3',
      version: '1.2.3',
      manifestPath,
      content: JSON.stringify(manifest),
    });
  });

  it('exposes author, read-only management metadata, and component provenance', () => {
    const cacheRoot = createTemporaryDirectory();
    const { bundlePath } = writePluginBundle(
      cacheRoot,
      'openai-curated-remote',
      'metadata-plugin',
      '1.0.0',
      {
        name: 'metadata-plugin',
        version: '1.0.0',
        author: { name: 'OpenAI' },
        skills: './skills',
      },
    );
    fs.mkdirSync(path.join(bundlePath, 'skills', 'review'), { recursive: true });

    const plugin = new PluginInventoryService(new CodexDesktopPluginProvider(cacheRoot)).scan().plugins[0];

    expect(plugin).toMatchObject({
      author: 'OpenAI',
      management: { uninstall: 'unavailable' },
      versions: [expect.objectContaining({
        author: 'OpenAI',
        components: [expect.objectContaining({
          name: 'review',
          provenance: {
            pluginId: 'openai-curated-remote/metadata-plugin',
            marketplace: 'openai-curated-remote',
            pluginName: 'metadata-plugin',
            version: '1.0.0',
          },
        })],
      })],
    });
  });

  it('groups versions by marketplace and technical name and classifies their source', () => {
    const cacheRoot = createTemporaryDirectory();
    writePluginBundle(cacheRoot, 'openai-curated-remote', 'shared-plugin', '1.0.0');
    writePluginBundle(cacheRoot, 'openai-curated-remote', 'shared-plugin', '2.0.0');
    writePluginBundle(cacheRoot, 'openai-bundled', 'bundled-plugin', '1.0.0');
    writePluginBundle(cacheRoot, 'openai-primary-runtime', 'runtime-plugin', '1.0.0');

    const inventory = new PluginInventoryService(new CodexDesktopPluginProvider(cacheRoot)).scan();

    expect(inventory.plugins).toHaveLength(3);
    expect(inventory.plugins.find((plugin) => plugin.name === 'shared-plugin')).toMatchObject({
      marketplace: 'openai-curated-remote',
      status: 'cache-detected',
      versions: [
        expect.objectContaining({ version: '1.0.0' }),
        expect.objectContaining({ version: '2.0.0' }),
      ],
    });
    expect(inventory.plugins.find((plugin) => plugin.name === 'bundled-plugin')?.status).toBe('bundled');
    expect(inventory.plugins.find((plugin) => plugin.name === 'runtime-plugin')?.status).toBe('protected');
  });

  it('uses the standard Codex Desktop cache root when no root is injected', () => {
    const homeDirectory = createTemporaryDirectory();
    const previousUserProfile = process.env.USERPROFILE;
    process.env.USERPROFILE = homeDirectory;

    try {
      const cacheRoot = path.join(homeDirectory, '.codex', 'plugins', 'cache');
      const { bundlePath } = writePluginManifest(cacheRoot);

      expect(new PluginInventoryService().scan().plugins[0]).toMatchObject({
        name: 'codex-security',
        versions: [expect.objectContaining({ bundlePath })],
      });
    } finally {
      if (previousUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = previousUserProfile;
    }
  });

  it('keeps an understandable invalid entry when a discovered plugin manifest cannot be read', () => {
    const cacheRoot = createTemporaryDirectory();
    const manifestPath = path.join(
      cacheRoot,
      'openai-curated-remote',
      'broken-plugin',
      '1.0.0',
      '.codex-plugin',
      'plugin.json',
    );
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, '{ invalid json', 'utf8');

    expect(new PluginInventoryService(new CodexDesktopPluginProvider(cacheRoot)).scan())
      .toMatchObject({
        plugins: [],
        invalidEntries: [{
          marketplace: 'openai-curated-remote',
          name: 'broken-plugin',
          version: '1.0.0',
          manifestPath,
          status: 'invalid',
          reason: 'Plugin manifest is not valid JSON.',
        }],
      });
  });

  it('counts skills, apps, and MCP servers from real bundle components', () => {
    const cacheRoot = createTemporaryDirectory();
    const { bundlePath } = writePluginBundle(cacheRoot, 'openai-curated-remote', 'component-plugin', '1.0.0', {
      name: 'component-plugin',
      version: '1.0.0',
      skills: './skills/',
      apps: './.app.json',
      mcpServers: './.mcp.json',
    });
    fs.mkdirSync(path.join(bundlePath, 'skills', 'review'), { recursive: true });
    fs.writeFileSync(path.join(bundlePath, 'skills', 'review', 'SKILL.md'), '# Review', 'utf8');
    fs.writeFileSync(path.join(bundlePath, '.app.json'), JSON.stringify({
      apps: { linear: { id: 'linear' }, github: { id: 'github' } },
    }), 'utf8');
    fs.mkdirSync(path.join(bundlePath, 'mcp'), { recursive: true });
    fs.writeFileSync(path.join(bundlePath, 'mcp', 'server.mjs'), 'export {};', 'utf8');
    fs.writeFileSync(path.join(bundlePath, '.mcp.json'), JSON.stringify({
      mcpServers: {
        'component-server': {
          command: 'node',
          args: ['./mcp/server.mjs', '--stdio'],
          cwd: '.',
        },
      },
    }), 'utf8');

    const version = new PluginInventoryService(new CodexDesktopPluginProvider(cacheRoot))
      .scan().plugins[0].versions[0];

    expect(version.componentCounts).toEqual({ skills: 1, apps: 2, mcpServers: 1 });
    expect(version.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'skill', name: 'review', status: 'available' }),
      expect.objectContaining({ kind: 'app', name: 'linear', status: 'available' }),
      expect.objectContaining({ kind: 'app', name: 'github', status: 'available' }),
      expect.objectContaining({ kind: 'mcp-server', name: 'component-server', status: 'available' }),
    ]));
    expect(version.issues).toEqual([]);
  });

  it('reports missing and escaping component references without treating them as valid', () => {
    const cacheRoot = createTemporaryDirectory();
    const { bundlePath } = writePluginBundle(cacheRoot, 'openai-curated-remote', 'unsafe-plugin', '1.0.0', {
      name: 'unsafe-plugin',
      version: '1.0.0',
      skills: '../outside-skills',
      apps: path.join(cacheRoot, 'external-apps.json'),
      mcpServers: './missing-mcp.json',
    });
    fs.mkdirSync(path.join(bundlePath, '..', 'outside-skills'), { recursive: true });
    fs.writeFileSync(path.join(cacheRoot, 'external-apps.json'), JSON.stringify({ apps: { outside: {} } }), 'utf8');

    const plugin = new PluginInventoryService(new CodexDesktopPluginProvider(cacheRoot))
      .scan().plugins[0];
    const version = plugin.versions[0];

    expect(plugin.status).toBe('invalid');
    expect(version.status).toBe('invalid');
    expect(version.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'skill', status: 'invalid-reference', reason: expect.stringContaining('escapes') }),
      expect.objectContaining({ kind: 'app', status: 'invalid-reference', reason: expect.stringContaining('relative') }),
      expect.objectContaining({ kind: 'mcp-server', status: 'missing', reason: expect.stringContaining('does not exist') }),
    ]));
    expect(version.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('skills:'),
      expect.stringContaining('apps:'),
      expect.stringContaining('mcpServers:'),
    ]));
  });

  it('rejects components that resolve through an external symlink', () => {
    const cacheRoot = createTemporaryDirectory();
    const { bundlePath } = writePluginBundle(cacheRoot, 'openai-curated-remote', 'linked-plugin', '1.0.0', {
      name: 'linked-plugin',
      version: '1.0.0',
      skills: './skills-link',
    });
    const externalSkills = path.join(cacheRoot, 'external-skills');
    fs.mkdirSync(externalSkills, { recursive: true });
    fs.mkdirSync(path.join(externalSkills, 'external-skill'), { recursive: true });
    fs.symlinkSync(
      externalSkills,
      path.join(bundlePath, 'skills-link'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    const version = new PluginInventoryService(new CodexDesktopPluginProvider(cacheRoot))
      .scan().plugins[0].versions[0];

    expect(version.status).toBe('invalid');
    expect(version.components).toEqual([
      expect.objectContaining({
        kind: 'skill',
        name: 'skills',
        status: 'external-symlink',
        reason: expect.stringContaining('symlink'),
      }),
    ]);
  });
});
