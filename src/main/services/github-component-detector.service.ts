import { assignFilesToDeepestSkill, isSkillMdPath } from '../utils/skill-md';
import type {
  DetectedSkill,
  DetectedSkillVariant,
  GitHubRepoInfo,
  GitHubTreeEntry,
} from '../types/github';
import type {
  ImportComponent,
  ImportComponentKind,
  ImportFallbackCommand,
  ImportRiskLevel,
  ImportSourceFile,
  ImportComponentVariant,
} from '../types/import';

export interface GitHubComponentDetectionResult {
  skills: DetectedSkill[];
  components: ImportComponent[];
  warnings: string[];
}

const SKILL_TARGETS = ['claude-code', 'codex-cli', 'codex-desktop', 'opencode', 'kimi-cli', 'cursor'];
// These roots are provider builds of the same logical `skills/<name>` payload.
const PROVIDER_TARGETS: Record<string, string[]> = {
  agents: ['codex-cli', 'codex-desktop', 'kimi-cli', 'opencode'],
  claude: ['claude-code', 'opencode'],
  codex: ['codex-cli', 'codex-desktop'],
  cursor: ['cursor'],
  github: ['github-copilot'],
  gemini: ['gemini-cli'],
  grok: ['grok'],
  kiro: ['kiro'],
  kimi: ['kimi-cli'],
  opencode: ['opencode'],
  pi: ['pi'],
  plugin: ['claude-code', 'grok'],
  qoder: ['qoder'],
  rovodev: ['rovodev'],
  trae: ['trae'],
  'trae-cn': ['trae-cn'],
  vibe: ['vibe'],
};
const EXECUTABLE_EXTENSIONS = new Set(['.sh', '.bash', '.ps1', '.cmd', '.bat', '.js', '.mjs', '.cjs', '.py']);
const EXCLUDED_PARTS = new Set(['.git', 'node_modules', '.DS_Store', 'Thumbs.db', '__pycache__', '.venv', 'dist', 'build']);

interface SkillDirectoryInfo {
  logicalPath: string;
  displayName: string;
  providerId?: string;
  nativeTargets: string[];
  priority: number;
}

/** Detects the installable inventory of a repository without executing anything from it. */
export class GitHubComponentDetectorService {
  detect(
    tree: GitHubTreeEntry[],
    repoInfo: GitHubRepoInfo,
    manifestContents: Record<string, string> = {},
    subpath?: string,
  ): GitHubComponentDetectionResult {
    const filteredTree = tree
      .filter((entry) => entry.type === 'blob')
      .filter((entry) => entry.mode !== '120000')
      .filter((entry) => !this.isExcludedPath(entry.path))
      .filter((entry) => !subpath || entry.path === subpath || entry.path.startsWith(`${subpath}/`));
    const components: ImportComponent[] = [];
    const warnings: string[] = tree.some((entry) => entry.mode === '120000')
      ? ['Symbolic links from the repository tree were excluded and will not be staged.']
      : [];
    const claimed = new Set<string>();
    const add = (component: ImportComponent) => {
      if (!components.some((candidate) => candidate.id === component.id)) {
        components.push(component);
      }
      component.files.forEach((file) => claimed.add(file.path));
    };

    const skills = this.detectSkills(filteredTree, repoInfo, subpath);
    for (const skill of skills) {
      const skillComponent: ImportComponent = {
        id: `skill:${this.logicalSkillPath(skill.sourcePath, repoInfo)}`,
        kind: 'skill',
        name: skill.name,
        displayName: skill.displayName,
        description: skill.description,
        sourcePath: skill.sourcePath,
        files: this.toImportFiles(skill.files),
        dependencies: [],
        risk: 'low',
        hasExecutableFiles: skill.files.some((file) => this.isExecutable(file.path)),
        requiresActivation: false,
        events: [],
        nativeTargets: [...new Set(skill.variants?.flatMap((variant) => variant.nativeTargets) || SKILL_TARGETS)],
        variants: skill.variants?.map((variant) => this.toImportVariant(variant)),
        metadata: { structure: skill.structure, hasSkillMd: skill.hasSkillMd },
      };
      add(skillComponent);
      skill.variants?.flatMap((variant) => variant.files).forEach((file) => claimed.add(file.path));
    }

    const pluginManifestPaths = [
      'plugin.json',
      '.claude-plugin/plugin.json',
      '.claude-plugin/marketplace.json',
      '.codex-plugin/plugin.json',
      '.agents/plugins/marketplace.json',
    ];
    const pluginManifests = pluginManifestPaths.filter((manifestPath) => filteredTree.some((entry) => entry.path === manifestPath));
    if (pluginManifests.length > 0) {
      const manifestPath = pluginManifests[0];
      const parsedManifest = this.parseJson(manifestContents[manifestPath], manifestPath, warnings);
      const fallback = this.createFallback(repoInfo, `No native adapter was selected for ${repoInfo.fullName}.`);
      add({
        id: `bundle:${manifestPath}`,
        kind: 'bundle',
        name: String(parsedManifest?.name || repoInfo.name),
        displayName: this.humanize(String(parsedManifest?.name || repoInfo.name)),
        description: repoInfo.description || 'Repository bundle',
        sourcePath: '',
        files: this.toImportFiles(filteredTree),
        dependencies: [],
        risk: 'medium',
        hasExecutableFiles: filteredTree.some((file) => this.isExecutable(file.path)),
        requiresActivation: false,
        events: [],
        nativeTargets: [...new Set(pluginManifests.flatMap((pathName) => this.manifestTargets(pathName)))],
        fallback,
        metadata: {
          manifestPath,
          manifestPaths: pluginManifests,
          manifest: parsedManifest || null,
          informational: true,
          invalidManifest: !parsedManifest,
        },
      });
    }

    const hookManifestPath = filteredTree.find((entry) => entry.path === 'hooks/hooks.json')?.path;
    const hookManifest = hookManifestPath ? this.parseJson(manifestContents[hookManifestPath], hookManifestPath, warnings) : null;
    if (hookManifestPath) {
      const events = this.readHookEvents(hookManifest);
      const dependencyPaths = this.readHookScriptPaths(hookManifest);
      const dependencies = dependencyPaths.map((filePath) => `script:${filePath}`);
      add({
        id: `hook:${hookManifestPath}`,
        kind: 'hook',
        name: 'repository-hooks',
        displayName: 'Repository hooks',
        description: 'Events declared by the repository hook manifest.',
        sourcePath: 'hooks',
        files: this.toImportFiles(filteredTree.filter((entry) => entry.path === hookManifestPath)),
        dependencies,
        risk: 'high',
        hasExecutableFiles: true,
        requiresActivation: true,
        events,
        nativeTargets: ['claude-code'],
        metadata: {
          manifestPath: hookManifestPath,
          manifest: hookManifest || null,
          scriptPaths: dependencyPaths,
          invalidManifest: !hookManifest,
        },
      });
    }

    for (const entry of filteredTree) {
      const normalized = entry.path.replace(/\\/g, '/');
      if (normalized.startsWith('hooks/') && normalized !== 'hooks/hooks.json') {
        add(this.createFileComponent('script', entry, 'Hooks', 'high', ['claude-code'], true, { destinationRootKind: 'hook' }));
      } else if (normalized.startsWith('scripts/')) {
        add(this.createFileComponent('script', entry, 'Script', 'high', ['claude-code'], true, { destinationRootKind: 'script' }));
      } else if (this.isInDirectory(normalized, 'agents') || normalized.endsWith('.agent.md')) {
        add(this.createFileComponent('agent', entry, 'Agent', 'medium', ['claude-code'], false));
      } else if (this.isCommandPath(normalized)) {
        add(this.createFileComponent('command', entry, 'Command', 'medium', this.commandTargets(normalized), false));
      } else if (this.isInDirectory(normalized, 'references') || this.isInDirectory(normalized, 'docs')) {
        if (this.isDocumentationStep(normalized)) add(this.createDocumentationStep(entry));
        else add(this.createFileComponent('reference', entry, 'Reference', 'low', SKILL_TARGETS, false));
      } else if (this.isInDirectory(normalized, 'assets')) {
        add(this.createFileComponent('asset', entry, 'Asset', 'low', SKILL_TARGETS, false));
      } else if (this.isManifestPath(normalized) && normalized !== hookManifestPath && !pluginManifests.includes(normalized)) {
        add(this.createFileComponent('config', entry, 'Configuration', 'medium', ['claude-code', 'codex-cli', 'codex-desktop'], false));
      } else if (this.isInstallScript(normalized)) {
        add(this.createManualStep(entry, repoInfo));
      }
    }

    const remaining = filteredTree.filter((entry) => !claimed.has(entry.path) && entry.path.toLowerCase() !== 'readme.md');
    if (remaining.length > 0) {
      add({
        id: 'reference:repository-files',
        kind: 'reference',
        name: 'repository-files',
        displayName: 'Other repository files',
        description: 'Files not covered by a recognized component convention.',
        sourcePath: '',
        files: this.toImportFiles(remaining),
        dependencies: [],
        risk: remaining.some((entry) => this.isExecutable(entry.path)) ? 'medium' : 'low',
        hasExecutableFiles: remaining.some((entry) => this.isExecutable(entry.path)),
        requiresActivation: false,
        events: [],
        nativeTargets: SKILL_TARGETS,
        metadata: { recognized: false },
      });
    }

    const readme = filteredTree.find((entry) => entry.path.toLowerCase() === 'readme.md');
    if (readme) {
      add(this.createFileComponent('reference', readme, 'Repository documentation', 'low', SKILL_TARGETS, false));
    }

    const payloadComponentIds = components
      .filter((component) => component.kind !== 'bundle' && component.kind !== 'manual-step')
      .map((component) => component.id);
    const sharedReferenceIds = components
      .filter((component) => component.kind === 'reference' && component.sourcePath.startsWith('references/'))
      .map((component) => component.id);
    for (const skill of components.filter((component) => component.kind === 'skill')) {
      skill.dependencies = [...new Set([...skill.dependencies, ...sharedReferenceIds])];
    }
    for (const bundle of components.filter((component) => component.kind === 'bundle')) {
      bundle.dependencies = [...new Set(payloadComponentIds)];
    }

    return { skills, components, warnings };
  }

  private detectSkills(tree: GitHubTreeEntry[], repoInfo: GitHubRepoInfo, subpath?: string): DetectedSkill[] {
    const skillMdFiles = tree.filter((entry) => isSkillMdPath(entry.path));
    if (skillMdFiles.length === 0) {
      return tree.length === 0 ? [] : [this.createSingleSkill(tree, repoInfo, subpath, false)];
    }

    const rootSkill = skillMdFiles.find((entry) => entry.path === 'SKILL.md');
    if (skillMdFiles.length === 1 && rootSkill) {
      return [this.createSingleSkill(tree, repoInfo, subpath, true)];
    }

    const skillDirs = new Map<string, GitHubTreeEntry[]>();
    for (const skillMd of skillMdFiles) {
      const normalizedPath = skillMd.path.replace(/\\/g, '/');
      const directory = normalizedPath.includes('/') ? normalizedPath.slice(0, normalizedPath.lastIndexOf('/')) : '';
      skillDirs.set(directory, [...(skillDirs.get(directory) || []), skillMd]);
    }

    const assigned = assignFilesToDeepestSkill([...skillDirs.keys()], tree);
    const candidates = [...skillDirs.keys()].map((directory) => {
      const info = this.getSkillDirectoryInfo(directory, repoInfo);
      const files = assigned.get(directory) || [];
      return { directory, info, files };
    });
    const grouped = new Map<string, typeof candidates>();
    for (const candidate of candidates) {
      const group = grouped.get(candidate.info.logicalPath) || [];
      group.push(candidate);
      grouped.set(candidate.info.logicalPath, group);
    }

    return [...grouped.entries()].map(([logicalPath, variants]) => {
      const orderedVariants = [...variants].sort((left, right) =>
        left.info.priority - right.info.priority || left.directory.localeCompare(right.directory),
      );
      const primary = orderedVariants[0];
      const baseName = logicalPath.split('/').pop() || repoInfo.name;
      const detectedVariants: DetectedSkillVariant[] = orderedVariants.map((variant) => ({
        sourcePath: variant.directory,
        displayName: variant.info.displayName,
        providerId: variant.info.providerId,
        nativeTargets: variant.info.nativeTargets,
        files: variant.files,
      }));
      return {
        name: this.slugify(baseName),
        displayName: this.humanize(baseName),
        description: repoInfo.description || '',
        sourcePath: primary.directory,
        hasSkillMd: true,
        fileCount: primary.files.length,
        files: primary.files,
        structure: 'folder-per-skill' as const,
        repoInfo,
        variants: detectedVariants,
      };
    });
  }

  private createSingleSkill(tree: GitHubTreeEntry[], repoInfo: GitHubRepoInfo, subpath: string | undefined, hasSkillMd: boolean): DetectedSkill {
    const baseName = subpath ? subpath.split('/').pop()! : repoInfo.name;
    return {
      name: this.slugify(baseName),
      displayName: this.humanize(baseName),
      description: repoInfo.description || '',
      sourcePath: subpath || '',
      hasSkillMd,
      fileCount: tree.length,
      files: tree,
      structure: hasSkillMd ? 'single-skill' : 'non-standard',
      repoInfo,
    };
  }

  private getSkillDirectoryInfo(directory: string, repoInfo: GitHubRepoInfo): SkillDirectoryInfo {
    const normalized = directory.replace(/\\/g, '/');
    const providerMatch = normalized.match(/^(?:\.([^/]+)|plugin)\/skills\/(.+)$/);
    if (providerMatch) {
      const provider = providerMatch[1] || 'plugin';
      const providerTargets = PROVIDER_TARGETS[provider];
      if (!providerTargets) {
        return {
          logicalPath: normalized,
          displayName: 'Repository skill',
          nativeTargets: SKILL_TARGETS,
          priority: 3,
        };
      }
      return {
        logicalPath: providerMatch[2],
        displayName: this.humanize(provider),
        providerId: provider,
        nativeTargets: providerTargets,
        priority: provider === 'agents' ? 1 : 2,
      };
    }

    const standardMatch = normalized.match(/^skills\/(.+)$/);
    if (standardMatch) {
      return {
        logicalPath: standardMatch[1],
        displayName: 'Repository skills',
        nativeTargets: SKILL_TARGETS,
        priority: 0,
      };
    }

    return {
      logicalPath: normalized || repoInfo.name,
      displayName: 'Repository skill',
      nativeTargets: SKILL_TARGETS,
      priority: 3,
    };
  }

  private logicalSkillPath(sourcePath: string, repoInfo: GitHubRepoInfo): string {
    return this.getSkillDirectoryInfo(sourcePath, repoInfo).logicalPath;
  }

  private toImportVariant(variant: DetectedSkillVariant): ImportComponentVariant {
    return {
      sourcePath: variant.sourcePath,
      displayName: variant.displayName,
      providerId: variant.providerId,
      nativeTargets: variant.nativeTargets,
      files: this.toImportFiles(variant.files),
    };
  }

  private createFileComponent(
    kind: Exclude<ImportComponentKind, 'bundle' | 'skill' | 'hook' | 'manual-step'>,
    entry: GitHubTreeEntry,
    label: string,
    risk: ImportRiskLevel,
    nativeTargets: string[],
    executable: boolean,
    metadata: Record<string, unknown> = {},
  ): ImportComponent {
    const name = entry.path.split('/').pop() || entry.path;
    return {
      id: `${kind}:${entry.path}`,
      kind,
      name,
      displayName: `${label}: ${name}`,
      description: `Detected at ${entry.path}.`,
      sourcePath: entry.path,
      files: this.toImportFiles([entry]),
      dependencies: [],
      risk,
      hasExecutableFiles: executable || this.isExecutable(entry.path),
      requiresActivation: false,
      events: [],
      nativeTargets,
      metadata,
    };
  }

  private createManualStep(entry: GitHubTreeEntry, repoInfo: GitHubRepoInfo): ImportComponent {
    return {
      id: `manual:${entry.path}`,
      kind: 'manual-step',
      name: entry.path,
      displayName: `Review installer: ${entry.path}`,
      description: 'This installer is executable and requires a separate explicit authorization.',
      sourcePath: entry.path,
      files: this.toImportFiles([entry]),
      dependencies: [],
      risk: 'high',
      hasExecutableFiles: true,
      requiresActivation: true,
      events: [],
      nativeTargets: [],
      fallback: this.createFallback(repoInfo, 'Use the repository installer only after reviewing its contents.'),
      metadata: { manualReviewRequired: true },
    };
  }

  private createDocumentationStep(entry: GitHubTreeEntry): ImportComponent {
    return {
      id: `manual:${entry.path}`,
      kind: 'manual-step',
      name: entry.path,
      displayName: `Review setup guide: ${entry.path}`,
      description: 'Documentation contains tool-specific installation steps that require manual review.',
      sourcePath: entry.path,
      files: this.toImportFiles([entry]),
      dependencies: [],
      risk: 'low',
      hasExecutableFiles: false,
      requiresActivation: false,
      events: [],
      nativeTargets: [],
      metadata: { manualReviewRequired: true, documentation: true },
    };
  }

  private createFallback(repoInfo: GitHubRepoInfo, reason: string): ImportFallbackCommand {
    return {
      executable: 'npx',
      args: ['skills', 'add', repoInfo.fullName],
      reason,
      requiresExplicitAuthorization: true,
      timeoutMs: 120_000,
    };
  }

  private toImportFiles(entries: GitHubTreeEntry[]): ImportSourceFile[] {
    return entries.map(({ path, sha, size }) => ({ path, sha, size, type: 'blob' }));
  }

  private parseJson(raw: string | undefined, filePath: string, warnings: string[]): Record<string, unknown> | null {
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      warnings.push(`Could not parse ${filePath}; it will require manual review.`);
      return null;
    }
  }

  private readHookEvents(manifest: Record<string, unknown> | null): string[] {
    const hooks = manifest?.hooks;
    return hooks && typeof hooks === 'object' && !Array.isArray(hooks) ? Object.keys(hooks) : [];
  }

  private readHookScriptPaths(manifest: Record<string, unknown> | null): string[] {
    const paths = new Set<string>();
    const hooks = manifest?.hooks;
    if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) return [];
    const visit = (value: unknown) => {
      if (typeof value === 'string') {
        const match = value.match(/(?:CLAUDE_PLUGIN_ROOT}\/|\.\/)([^\s"']+)/);
        if (match) paths.add(match[1].replace(/\\/g, '/'));
      } else if (Array.isArray(value)) {
        value.forEach(visit);
      } else if (value && typeof value === 'object') {
        Object.values(value).forEach(visit);
      }
    };
    visit(hooks);
    return [...paths];
  }

  private manifestTargets(pathName: string): string[] {
    if (pathName.startsWith('.claude-plugin')) return ['claude-code'];
    if (pathName.startsWith('.codex-plugin')) return ['codex-cli', 'codex-desktop'];
    return ['claude-code'];
  }

  private isCommandPath(filePath: string): boolean {
    return ['commands/', '.claude/commands/', '.gemini/commands/', '.opencode/commands/']
      .some((directory) => filePath.startsWith(directory));
  }

  private commandTargets(filePath: string): string[] {
    if (filePath.startsWith('.gemini/commands/')) return ['gemini-cli'];
    if (filePath.startsWith('.opencode/commands/')) return ['opencode'];
    return ['claude-code'];
  }

  private isManifestPath(filePath: string): boolean {
    return filePath.endsWith('.json') || filePath.endsWith('.yaml') || filePath.endsWith('.yml');
  }

  private isInstallScript(filePath: string): boolean {
    return /(^|\/)(install|setup|bootstrap)(\.[A-Za-z0-9]+)?$/i.test(filePath);
  }

  private isDocumentationStep(filePath: string): boolean {
    return /(^|\/)([^/]*(setup|install|get-started)[^/]*)\.md$/i.test(filePath);
  }

  private isInDirectory(filePath: string, directory: string): boolean {
    return filePath.startsWith(`${directory}/`);
  }

  private isExecutable(filePath: string): boolean {
    const lower = filePath.toLowerCase();
    return [...EXECUTABLE_EXTENSIONS].some((extension) => lower.endsWith(extension));
  }

  private isExcludedPath(filePath: string): boolean {
    return filePath.split('/').some((part) => EXCLUDED_PARTS.has(part));
  }

  private slugify(value: string): string {
    const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
    return slug || 'skill';
  }

  private humanize(value: string): string {
    return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()).trim();
  }
}
