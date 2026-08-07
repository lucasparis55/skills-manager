import fs from 'fs';
import os from 'os';
import path from 'path';
import type { PluginInventory, PluginInventoryEntry } from '../types/domain';

export interface PluginInventoryProvider {
  scan(): PluginInventory;
}

interface PluginManifest {
  name?: unknown;
  version?: unknown;
  description?: unknown;
  interface?: unknown;
}

export function getDefaultCodexDesktopPluginCacheRoot(): string {
  const homeDirectory = process.env.USERPROFILE || os.homedir();
  return path.join(homeDirectory, '.codex', 'plugins', 'cache');
}

export class CodexDesktopPluginProvider implements PluginInventoryProvider {
  constructor(private readonly cacheRoot = getDefaultCodexDesktopPluginCacheRoot()) {}

  scan(): PluginInventory {
    const plugins = this.readMarketplaces().flatMap((marketplace) => this.readMarketplace(marketplace));

    return {
      scannedAt: new Date().toISOString(),
      rootPath: this.cacheRoot,
      plugins,
    };
  }

  private readMarketplaces(): string[] {
    return this.readDirectories(this.cacheRoot);
  }

  private readMarketplace(marketplace: string): PluginInventoryEntry[] {
    const marketplacePath = path.join(this.cacheRoot, marketplace);
    return this.readDirectories(marketplacePath).flatMap((pluginName) =>
      this.readPluginVersions(marketplace, pluginName),
    );
  }

  private readPluginVersions(marketplace: string, pluginName: string): PluginInventoryEntry[] {
    const pluginPath = path.join(this.cacheRoot, marketplace, pluginName);
    return this.readDirectories(pluginPath).flatMap((versionDirectory) => {
      const bundlePath = path.join(pluginPath, versionDirectory);
      const manifestPath = path.join(bundlePath, '.codex-plugin', 'plugin.json');
      return this.readPluginManifestEntry(marketplace, bundlePath, manifestPath);
    });
  }

  private readPluginManifestEntry(
    marketplace: string,
    bundlePath: string,
    manifestPath: string,
  ): PluginInventoryEntry[] {
    if (!fs.existsSync(manifestPath)) return [];

    let parsedManifest: unknown;
    try {
      parsedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      throw new Error(`Could not read Codex Desktop plugin manifest at ${manifestPath}`);
    }

    if (!isRecord(parsedManifest)) return [];
    const manifest = parsedManifest as PluginManifest;
    const name = nonEmptyString(manifest.name);
    const version = nonEmptyString(manifest.version);
    if (!name || !version) return [];

    const interfaceMetadata = isRecord(manifest.interface) ? manifest.interface : {};
    const displayName = nonEmptyString(interfaceMetadata.displayName) || name;
    const description = nonEmptyString(manifest.description)
      || nonEmptyString(interfaceMetadata.shortDescription)
      || '';

    return [{
      id: `${marketplace}/${name}@${version}`,
      marketplace,
      name,
      displayName,
      version,
      description,
      bundlePath,
      manifestPath,
      status: 'cache-detected',
    }];
  }

  private readDirectories(directory: string): string[] {
    try {
      return fs
        .readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch (error) {
      if (isMissingPathError(error)) return [];
      throw new Error(`Could not read Codex Desktop plugin cache at ${directory}`);
    }
  }
}

export class PluginInventoryService {
  constructor(
    private readonly provider: PluginInventoryProvider = new CodexDesktopPluginProvider(),
  ) {}

  scan(): PluginInventory {
    return this.provider.scan();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isMissingPathError(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}
