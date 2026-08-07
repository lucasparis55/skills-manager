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
  const bundlePath = path.join(root, 'openai-curated-remote', 'codex-security', '1.2.3');
  const manifestPath = path.join(bundlePath, '.codex-plugin', 'plugin.json');
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      name: 'codex-security',
      version: '1.2.3',
      description: 'Security checks for Codex projects',
      interface: { displayName: 'Codex Security' },
    }),
    'utf8',
  );
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
        id: 'openai-curated-remote/codex-security@1.2.3',
        marketplace: 'openai-curated-remote',
        name: 'codex-security',
        displayName: 'Codex Security',
        version: '1.2.3',
        description: 'Security checks for Codex projects',
        bundlePath,
        manifestPath,
        status: 'cache-detected',
      },
    ]);
  });

  it('returns an empty inventory when the default-shaped cache is not present', () => {
    const cacheRoot = path.join(createTemporaryDirectory(), 'missing-cache');
    const service = new PluginInventoryService(new CodexDesktopPluginProvider(cacheRoot));

    expect(service.scan()).toMatchObject({
      rootPath: cacheRoot,
      plugins: [],
    });
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
        bundlePath,
      });
    } finally {
      if (previousUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = previousUserProfile;
    }
  });

  it('reports an error when a discovered plugin manifest cannot be read', () => {
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

    expect(() => new PluginInventoryService(new CodexDesktopPluginProvider(cacheRoot)).scan())
      .toThrow(`Could not read Codex Desktop plugin manifest at ${manifestPath}`);
  });
});
