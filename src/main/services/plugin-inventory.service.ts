import fs from 'fs';
import os from 'os';
import path from 'path';
import type {
  PluginComponent,
  PluginComponentCounts,
  PluginComponentKind,
  PluginComponentProvenance,
  PluginComponentStatus,
  PluginInventory,
  PluginInventoryInvalidEntry,
  PluginInventoryPlugin,
  PluginInventoryStatus,
  PluginInventoryVersion,
  PluginManifestPreview,
} from '../types/domain';

export interface PluginInventoryProvider {
  scan(): PluginInventory;
  readManifest(versionId: string): PluginManifestPreview;
}

interface PluginManifest {
  name?: unknown;
  version?: unknown;
  author?: unknown;
  description?: unknown;
  interface?: unknown;
  skills?: unknown;
  apps?: unknown;
  mcpServers?: unknown;
}

interface ScannedPluginVersion {
  marketplace: string;
  name: string;
  displayName: string;
  version: PluginInventoryVersion;
}

interface PluginInspection {
  version?: ScannedPluginVersion;
  invalid?: PluginInventoryInvalidEntry;
}

interface ReferenceCheck {
  status: PluginComponentStatus;
  resolvedPath?: string;
  reason?: string;
}

type ComponentIssue = Omit<ReferenceCheck, 'status'> & {
  status: Exclude<PluginComponentStatus, 'available'>;
};

type PluginComponentDraft = Omit<PluginComponent, 'provenance'>;

export function getDefaultCodexDesktopPluginCacheRoot(): string {
  const homeDirectory = process.env.USERPROFILE || os.homedir();
  return path.join(homeDirectory, '.codex', 'plugins', 'cache');
}

export class CodexDesktopPluginProvider implements PluginInventoryProvider {
  constructor(private readonly cacheRoot = getDefaultCodexDesktopPluginCacheRoot()) {}

  scan(): PluginInventory {
    const inspections = this.readMarketplaces().flatMap((marketplace) => this.readMarketplace(marketplace));
    const versions = inspections.flatMap((inspection) => inspection.version ? [inspection.version] : []);
    const invalidEntries = inspections.flatMap((inspection) => inspection.invalid ? [inspection.invalid] : []);

    return {
      scannedAt: new Date().toISOString(),
      rootPath: this.cacheRoot,
      plugins: groupPluginVersions(versions),
      invalidEntries,
    };
  }

  readManifest(versionId: string): PluginManifestPreview {
    const version = this.scan().plugins
      .flatMap((plugin) => plugin.versions)
      .find((candidate) => candidate.id === versionId);

    if (!version) throw new Error(`Plugin version not found: ${versionId}`);

    let content: string;
    try {
      content = fs.readFileSync(version.manifestPath, 'utf8');
    } catch {
      throw new Error(`Could not read Codex Desktop plugin manifest at ${version.manifestPath}`);
    }

    return {
      versionId,
      version: version.version,
      manifestPath: version.manifestPath,
      content,
    };
  }

  private readMarketplaces(): string[] {
    return this.readDirectories(this.cacheRoot);
  }

  private readMarketplace(marketplace: string): PluginInspection[] {
    const marketplacePath = path.join(this.cacheRoot, marketplace);
    return this.readDirectories(marketplacePath).flatMap((pluginName) =>
      this.readPluginVersions(marketplace, pluginName),
    );
  }

  private readPluginVersions(marketplace: string, pluginName: string): PluginInspection[] {
    const pluginPath = path.join(this.cacheRoot, marketplace, pluginName);
    return this.readDirectories(pluginPath).map((versionDirectory) => {
      const bundlePath = path.join(pluginPath, versionDirectory);
      const manifestPath = path.join(bundlePath, '.codex-plugin', 'plugin.json');
      return this.inspectBundle(marketplace, pluginName, versionDirectory, bundlePath, manifestPath);
    });
  }

  private inspectBundle(
    marketplace: string,
    directoryName: string,
    versionDirectory: string,
    bundlePath: string,
    manifestPath: string,
  ): PluginInspection {
    const invalid = (reason: string): PluginInspection => ({
      invalid: {
        id: `${marketplace}/${directoryName}@${versionDirectory}`,
        marketplace,
        name: directoryName,
        version: versionDirectory,
        bundlePath,
        manifestPath,
        status: 'invalid',
        reason,
      },
    });

    if (!fs.existsSync(manifestPath)) {
      return invalid('Plugin manifest is missing.');
    }

    let parsedManifest: unknown;
    try {
      parsedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      return invalid('Plugin manifest is not valid JSON.');
    }

    if (!isRecord(parsedManifest)) {
      return invalid('Plugin manifest must be a JSON object.');
    }

    const manifest = parsedManifest as PluginManifest;
    const name = nonEmptyString(manifest.name);
    const version = nonEmptyString(manifest.version);
    if (!name || !version) {
      return invalid('Plugin manifest must include non-empty name and version fields.');
    }

    const interfaceMetadata = isRecord(manifest.interface) ? manifest.interface : {};
    const displayName = nonEmptyString(interfaceMetadata.displayName) || name;
    const author = normalizeAuthor(manifest.author);
    const description = nonEmptyString(manifest.description)
      || nonEmptyString(interfaceMetadata.shortDescription)
      || '';
    const category = nonEmptyString(interfaceMetadata.category) || '';
    const capabilities = stringArray(interfaceMetadata.capabilities);
    const components = attachComponentProvenance(
      inspectManifestComponents(manifest, bundlePath),
      {
        pluginId: `${marketplace}/${name}`,
        marketplace,
        pluginName: name,
        version,
      },
    );
    const status: PluginInventoryStatus = hasComponentIssues(components)
      ? 'invalid'
      : classifyMarketplace(marketplace);

    return {
      version: {
        marketplace,
        name,
        displayName,
        version: {
          id: `${marketplace}/${name}@${version}`,
          version,
          author,
          description,
          category,
          capabilities,
          bundlePath,
          manifestPath,
          status,
          components,
          componentCounts: countComponents(components),
          issues: componentIssues(components),
        },
      },
    };
  }

  private readDirectories(directory: string): string[] {
    try {
      return fs
        .readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));
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

  readManifest(versionId: string): PluginManifestPreview {
    return this.provider.readManifest(versionId);
  }
}

function groupPluginVersions(versions: ScannedPluginVersion[]): PluginInventoryPlugin[] {
  const groups = new Map<string, PluginInventoryPlugin>();

  for (const scanned of versions) {
    const id = `${scanned.marketplace}/${scanned.name}`;
    const existing = groups.get(id);
    if (existing) {
      existing.versions.push(scanned.version);
      existing.status = mergePluginStatus(existing.status, scanned.version.status);
      existing.author = existing.author || scanned.version.author;
      existing.category = existing.category || scanned.version.category;
      existing.capabilities = uniqueStrings([...existing.capabilities, ...scanned.version.capabilities]);
      existing.componentCounts = addComponentCounts(existing.componentCounts, scanned.version.componentCounts);
      existing.issues = uniqueStrings([...existing.issues, ...scanned.version.issues]);
      continue;
    }

    groups.set(id, {
      id,
      marketplace: scanned.marketplace,
      name: scanned.name,
      displayName: scanned.displayName,
      author: scanned.version.author,
      description: scanned.version.description,
      category: scanned.version.category,
      capabilities: [...scanned.version.capabilities],
      status: scanned.version.status,
      versions: [scanned.version],
      componentCounts: { ...scanned.version.componentCounts },
      management: { uninstall: 'unavailable' },
      issues: [...scanned.version.issues],
    });
  }

  return [...groups.values()].map((plugin) => ({
    ...plugin,
    versions: [...plugin.versions].sort((left, right) => left.version.localeCompare(right.version)),
  }));
}

function inspectManifestComponents(manifest: PluginManifest, bundlePath: string): PluginComponentDraft[] {
  return [
    ...inspectSkills(manifest.skills, bundlePath),
    ...inspectConfigComponents(manifest.apps, bundlePath, 'apps', 'app'),
    ...inspectConfigComponents(manifest.mcpServers, bundlePath, 'mcpServers', 'mcp-server'),
  ];
}

function attachComponentProvenance(
  components: PluginComponentDraft[],
  provenance: PluginComponentProvenance,
): PluginComponent[] {
  return components.map((component) => ({ ...component, provenance }));
}

function inspectSkills(reference: unknown, bundlePath: string): PluginComponentDraft[] {
  if (reference === undefined) return [];

  const referenceText = displayReference(reference);
  const check = resolveReference(bundlePath, reference);
  if (check.status !== 'available' || !check.resolvedPath) {
    return [componentIssue('skill', 'skills', referenceText, check)];
  }

  let stat: fs.Stats;
  let entries: fs.Dirent[];
  try {
    stat = fs.statSync(check.resolvedPath);
    if (!stat.isDirectory()) {
      return [componentIssue('skill', 'skills', referenceText, {
        status: 'invalid-reference',
        reason: 'Skills reference must point to a directory.',
      })];
    }
    entries = fs.readdirSync(check.resolvedPath, { withFileTypes: true });
  } catch {
    return [componentIssue('skill', 'skills', referenceText, {
      status: 'missing',
      reason: 'Skills directory could not be read.',
    })];
  }

  return entries
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => {
      const componentPath = path.join(check.resolvedPath!, entry.name);
      const componentReference = toBundleReference(bundlePath, componentPath);
      const componentCheck = resolveReference(bundlePath, componentReference);
      if (componentCheck.status !== 'available' || !componentCheck.resolvedPath) {
        return componentIssue('skill', entry.name, componentReference, componentCheck);
      }

      try {
        if (!fs.statSync(componentCheck.resolvedPath).isDirectory()) {
          return componentIssue('skill', entry.name, componentReference, {
            status: 'invalid-reference',
            reason: 'Skill component must point to a directory.',
          });
        }
      } catch {
        return componentIssue('skill', entry.name, componentReference, {
          status: 'missing',
          reason: 'Skill component could not be read.',
        });
      }

      return {
        id: `skill:${entry.name}`,
        kind: 'skill' as const,
        name: entry.name,
        reference: componentReference,
        status: 'available' as const,
        resolvedPath: componentCheck.resolvedPath,
      };
    });
}

function inspectConfigComponents(
  reference: unknown,
  bundlePath: string,
  collectionName: 'apps' | 'mcpServers',
  kind: Extract<PluginComponentKind, 'app' | 'mcp-server'>,
): PluginComponentDraft[] {
  if (reference === undefined) return [];

  const referenceText = displayReference(reference);
  const check = resolveReference(bundlePath, reference);
  if (check.status !== 'available' || !check.resolvedPath) {
    return [componentIssue(kind, collectionName, referenceText, check)];
  }

  let parsed: unknown;
  try {
    if (!fs.statSync(check.resolvedPath).isFile()) {
      return [componentIssue(kind, collectionName, referenceText, {
        status: 'invalid-reference',
        reason: `${collectionName} reference must point to a file.`,
      })];
    }
    parsed = JSON.parse(fs.readFileSync(check.resolvedPath, 'utf8'));
  } catch {
    return [componentIssue(kind, collectionName, referenceText, {
      status: 'invalid-manifest',
      reason: `${collectionName} manifest could not be read as JSON.`,
    })];
  }

  if (!isRecord(parsed) || !isRecord(parsed[collectionName])) {
    return [componentIssue(kind, collectionName, referenceText, {
      status: 'invalid-manifest',
      reason: `${collectionName} manifest must contain a ${collectionName} object.`,
    })];
  }

  return Object.entries(parsed[collectionName]).map(([name, definition]) => {
    const issue = kind === 'mcp-server'
      ? inspectMcpServerReferences(definition, bundlePath)
      : undefined;

    return {
      id: `${kind}:${name}`,
      kind,
      name,
      reference: referenceText,
      status: issue?.status || 'available',
      ...(issue?.resolvedPath ? { resolvedPath: issue.resolvedPath } : {}),
      ...(issue?.reason ? { reason: issue.reason } : {}),
    };
  });
}

function inspectMcpServerReferences(definition: unknown, bundlePath: string): ComponentIssue | undefined {
  if (!isRecord(definition)) {
    return { status: 'invalid-manifest', reason: 'MCP server definition must be an object.' };
  }

  if (typeof definition.cwd === 'string') {
    const cwdCheck = resolveReference(bundlePath, definition.cwd);
    if (cwdCheck.status !== 'available' || !cwdCheck.resolvedPath) return toComponentIssue(cwdCheck);
    try {
      if (!fs.statSync(cwdCheck.resolvedPath).isDirectory()) {
        return { status: 'invalid-reference', reason: 'MCP server cwd must point to a directory.' };
      }
    } catch {
      return { status: 'missing', reason: 'MCP server cwd could not be read.' };
    }
  }

  if (Array.isArray(definition.args)) {
    for (const argument of definition.args) {
      if (typeof argument !== 'string' || !looksLikeBundlePath(argument)) continue;
      const argumentCheck = resolveReference(bundlePath, argument);
      if (argumentCheck.status !== 'available' || !argumentCheck.resolvedPath) {
        return toComponentIssue(argumentCheck);
      }
    }
  }

  return undefined;
}

function resolveReference(bundlePath: string, reference: unknown): ReferenceCheck {
  if (typeof reference !== 'string' || reference.trim().length === 0) {
    return { status: 'invalid-reference', reason: 'Reference must be a non-empty relative path.' };
  }

  const trimmedReference = reference.trim();
  if (path.isAbsolute(trimmedReference)) {
    return { status: 'invalid-reference', reason: 'Reference must stay relative to the plugin bundle.' };
  }

  const resolvedPath = path.resolve(bundlePath, trimmedReference);
  if (!isPathInside(bundlePath, resolvedPath)) {
    return { status: 'invalid-reference', reason: 'Reference escapes the plugin bundle.' };
  }

  if (!fs.existsSync(resolvedPath)) {
    return { status: 'missing', reason: 'Referenced component does not exist.' };
  }

  try {
    const realBundlePath = fs.realpathSync(bundlePath);
    const realResolvedPath = fs.realpathSync(resolvedPath);
    if (!isPathInside(realBundlePath, realResolvedPath)) {
      return { status: 'external-symlink', reason: 'Reference resolves through a symlink outside the plugin bundle.' };
    }
  } catch {
    return { status: 'missing', reason: 'Referenced component could not be resolved.' };
  }

  return { status: 'available', resolvedPath };
}

function componentIssue(
  kind: PluginComponentKind,
  name: string,
  reference: string,
  issue: ReferenceCheck,
): PluginComponentDraft {
  return {
    id: `${kind}:${name}`,
    kind,
    name,
    reference,
    status: issue.status === 'available' ? 'invalid-reference' : issue.status,
    ...(issue.resolvedPath ? { resolvedPath: issue.resolvedPath } : {}),
    ...(issue.reason ? { reason: issue.reason } : {}),
  };
}

function toComponentIssue(check: ReferenceCheck): ComponentIssue {
  return {
    status: check.status === 'available' ? 'invalid-reference' : check.status,
    ...(check.resolvedPath ? { resolvedPath: check.resolvedPath } : {}),
    reason: check.reason || 'Reference is invalid.',
  };
}

function classifyMarketplace(marketplace: string): Exclude<PluginInventoryStatus, 'invalid'> {
  if (marketplace === 'openai-bundled' || marketplace.endsWith('-bundled')) return 'bundled';
  if (marketplace === 'openai-primary-runtime' || marketplace.endsWith('-runtime')) return 'protected';
  return 'cache-detected';
}

function countComponents(components: PluginComponentDraft[]): PluginComponentCounts {
  return components.reduce((counts, component) => {
    if (component.kind === 'skill') counts.skills += 1;
    if (component.kind === 'app') counts.apps += 1;
    if (component.kind === 'mcp-server') counts.mcpServers += 1;
    return counts;
  }, emptyComponentCounts());
}

function addComponentCounts(left: PluginComponentCounts, right: PluginComponentCounts): PluginComponentCounts {
  return {
    skills: left.skills + right.skills,
    apps: left.apps + right.apps,
    mcpServers: left.mcpServers + right.mcpServers,
  };
}

function componentIssues(components: PluginComponentDraft[]): string[] {
  return uniqueStrings(
    components
      .filter((component) => component.status !== 'available')
      .map((component) => `${component.name}: ${component.reason || component.status}`),
  );
}

function hasComponentIssues(components: PluginComponentDraft[]): boolean {
  return components.some((component) => component.status !== 'available');
}

function mergePluginStatus(left: PluginInventoryStatus, right: PluginInventoryStatus): PluginInventoryStatus {
  return left === 'invalid' || right === 'invalid' ? 'invalid' : left;
}

function emptyComponentCounts(): PluginComponentCounts {
  return { skills: 0, apps: 0, mcpServers: 0 };
}

function displayReference(reference: unknown): string {
  if (typeof reference === 'string') return reference;
  try {
    return JSON.stringify(reference);
  } catch {
    return String(reference);
  }
}

function toBundleReference(bundlePath: string, targetPath: string): string {
  const relativePath = path.relative(bundlePath, targetPath).split(path.sep).join('/');
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}

function looksLikeBundlePath(value: string): boolean {
  return path.isAbsolute(value) || /^(?:\.\.?[\\/]|[\\/]{1,2})/.test(value);
}

function isPathInside(rootPath: string, targetPath: string): boolean {
  const relativePath = path.relative(path.resolve(rootPath), path.resolve(targetPath));
  return relativePath === ''
    || (relativePath !== '..'
      && !relativePath.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relativePath));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeAuthor(value: unknown): string {
  const text = nonEmptyString(value);
  if (text) return text;
  if (!isRecord(value)) return '';
  return nonEmptyString(value.name) || nonEmptyString(value.displayName) || '';
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.flatMap((entry) => {
    const text = nonEmptyString(entry);
    return text ? [text] : [];
  }));
}

function isMissingPathError(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}
