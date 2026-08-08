import https from 'https';
import fs from 'fs';
import path from 'path';
import { isIP } from 'net';
import { resolveSkillsRoot } from '../utils/paths';
import { assignFilesToDeepestSkill, isSkillMdPath } from '../utils/skill-md';
import { SkillService } from './skill.service';
import { SettingsService } from './settings.service';
import { GitHubComponentDetectorService } from './github-component-detector.service';
import { IDEAdapterService } from './ide-adapter.service';
import { ImportAdapterService } from './import-adapter.service';
import { ImportCommandService } from './import-command.service';
import { ImportHookService, type HookInstallation } from './import-hook.service';
import { ImportPlanService } from './import-plan.service';
import { ImportProvenanceService } from './import-provenance.service';
import { ImportStagingService } from './import-staging.service';
import { ImportPathService } from './import-path.service';
import type { Project } from '../types/domain';
import type {
  ParsedGitHubRepo,
  GitHubRepoInfo,
  GitHubTreeEntry,
  GitHubRevision,
  DetectedSkill,
  SkillStructure,
  ConflictResolution,
  ImportResult,
  ImportProgress,
  ImportFileEntry,
  AnalyzeResult,
  GitHubApiError,
} from '../types/github';
import type {
  ImportComponent,
  ImportComponentResult,
  ImportComponentSelection,
  ImportActivationPreview,
  ImportPlan,
  ImportProvenanceRecord,
  ImportSourceFile,
  ImportTarget,
} from '../types/import';

type GitHubTreeWithRevision = GitHubTreeEntry[] & { revision?: GitHubRevision };
const MAX_GITHUB_RESPONSE_BYTES = 16 * 1024 * 1024;

export interface GitHubImportServiceOptions {
  adapterService?: ImportAdapterService;
  commandService?: ImportCommandService;
  planService?: ImportPlanService;
  provenanceService?: ImportProvenanceService;
  stagingService?: ImportStagingService;
}

export interface ImportActivationResult {
  success: boolean;
  activation: ImportActivationPreview;
}

/**
 * GitHub Import Service - Handles importing skills from GitHub repositories
 */
export class GitHubImportService {
  private settingsService: SettingsService;
  private importGeneration = 0;
  private readonly componentDetector = new GitHubComponentDetectorService();
  private readonly adapterService?: ImportAdapterService;
  private readonly commandService: ImportCommandService;
  private readonly planService: ImportPlanService;
  private provenanceService?: ImportProvenanceService;
  private readonly stagingService: ImportStagingService;
  private readonly cachedAnalyses = new Map<string, AnalyzeResult>();
  private readonly fileBufferCache = new Map<string, Buffer>();
  private fileBufferCacheBytes = 0;
  private readonly plans = new Map<string, ImportPlan>();
  private readonly planParsed = new Map<string, ParsedGitHubRepo>();
  private readonly hookInstallations = new Map<string, HookInstallation>();

  constructor(settingsService: SettingsService, options: GitHubImportServiceOptions = {}) {
    this.settingsService = settingsService;
    this.adapterService = options.adapterService;
    this.commandService = options.commandService || new ImportCommandService();
    this.planService = options.planService || new ImportPlanService();
    this.provenanceService = options.provenanceService;
    this.stagingService = options.stagingService || new ImportStagingService();
  }

  private getSkillsRootFromSettings(): string {
    return resolveSkillsRoot(this.settingsService.get().centralSkillsRoot);
  }

  private createSkillService(): SkillService {
    return new SkillService(this.getSkillsRootFromSettings());
  }

  private getEffectiveParsed(parsed: ParsedGitHubRepo, repoInfo: GitHubRepoInfo): ParsedGitHubRepo {
    const effectiveParsed = { ...parsed };
    if (parsed.branch === 'main' && repoInfo.defaultBranch && repoInfo.defaultBranch !== 'main') {
      effectiveParsed.branch = repoInfo.defaultBranch;
    }
    return effectiveParsed;
  }

  private assertValidFinalName(name: string): void {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(name) || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
      throw new Error(`Invalid final skill name "${name}"`);
    }
  }

  /**
   * Parse and validate a GitHub URL, extracting owner, repo, branch, and optional subpath.
   */
  parseGitHubUrl(url: string): ParsedGitHubRepo {
    const trimmed = url.trim();

    // Shorthand: owner/repo
    const shorthandMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
    if (shorthandMatch) {
      return { owner: shorthandMatch[1], repo: shorthandMatch[2], branch: 'main' };
    }

    // Full URL: https://github.com/owner/repo[/tree/branch/path]
    const urlMatch = trimmed.match(
      /^https?:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\/(tree|blob)\/([^/]+?)(?:\/(.*))?)?\/?$/
    );
    if (urlMatch) {
      const owner = urlMatch[1];
      const repo = urlMatch[2];
      const branch = urlMatch[4] || 'main';
      const subpath = urlMatch[5] || undefined;
      if (!/^[^\0/\\]+$/.test(branch) || branch === '.' || branch === '..' || branch.includes('..')) {
        throw new Error('Invalid GitHub ref.');
      }
      if (subpath) ImportPathService.normalizeRepositoryPath(subpath);
      return { owner, repo, branch, subpath };
    }

    throw new Error(
      'Invalid GitHub URL. Use format: https://github.com/owner/repo or owner/repo'
    );
  }

  /**
   * Fetch repository metadata from GitHub API.
   */
  async fetchRepoInfo(parsed: ParsedGitHubRepo): Promise<GitHubRepoInfo> {
    const data = await this.makeGitHubRequest<Record<string, unknown>>(
      `/repos/${parsed.owner}/${parsed.repo}`
    );

    if (typeof data.name !== 'string' || typeof data.full_name !== 'string' || typeof data.html_url !== 'string') {
      throw new Error('GitHub returned invalid repository metadata.');
    }

    return {
      name: data.name,
      fullName: data.full_name,
      description: typeof data.description === 'string' ? data.description : '',
      defaultBranch: typeof data.default_branch === 'string' ? data.default_branch : 'main',
      isPrivate: data.private === true,
      htmlUrl: data.html_url,
      starsCount: typeof data.stargazers_count === 'number' ? data.stargazers_count : 0,
    };
  }

  /**
   * Fetch the full file tree of a repository.
   */
  async fetchRepoTree(parsed: ParsedGitHubRepo): Promise<GitHubTreeEntry[]> {
    const branch = parsed.branch;
    const commitData = await this.makeGitHubRequest<Record<string, unknown>>(
      `/repos/${parsed.owner}/${parsed.repo}/commits/${encodeURIComponent(branch)}`,
    );
    const commit = commitData.commit && typeof commitData.commit === 'object'
      ? commitData.commit as Record<string, unknown>
      : undefined;
    const commitTree = commit?.tree && typeof commit.tree === 'object'
      ? commit.tree as Record<string, unknown>
      : undefined;
    const commitSha = typeof commitData.sha === 'string' ? commitData.sha : undefined;
    const treeSha = typeof commitTree?.sha === 'string' ? commitTree.sha : undefined;
    if (!commitSha || !treeSha) {
      throw new Error(`GitHub did not resolve revision "${branch}" to a commit tree.`);
    }
    const treeRef = treeSha || branch;
    const data = await this.makeGitHubRequest<Record<string, unknown>>(
      `/repos/${parsed.owner}/${parsed.repo}/git/trees/${encodeURIComponent(treeRef)}?recursive=1`,
    );

    if (data.truncated === true) {
      throw new Error('GitHub returned a truncated repository tree. Choose a narrower subpath or import from a smaller repository.');
    }
    if (!Array.isArray(data.tree)) {
      throw new Error('GitHub returned an invalid repository tree.');
    }
    if (data.tree.length > 100_000) {
      throw new Error('Repository tree is too large to analyze safely. Choose a narrower subpath.');
    }

    const entries = data.tree
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
      .filter((entry) => entry.type === 'blob')
      .map((entry) => {
        if (typeof entry.path !== 'string' || typeof entry.sha !== 'string') {
          throw new Error('GitHub returned a tree entry without a valid path or blob SHA.');
        }
        return {
          path: ImportPathService.normalizeRepositoryPath(entry.path),
          type: 'blob' as const,
          sha: entry.sha,
          size: typeof entry.size === 'number' ? entry.size : undefined,
          mode: typeof entry.mode === 'string' ? entry.mode : undefined,
        };
      }) as GitHubTreeWithRevision;

    entries.revision = {
      ref: branch,
      commitSha,
      treeSha: treeSha || (typeof data?.sha === 'string' ? data.sha : undefined),
      resolvedAt: new Date().toISOString(),
    };

    return entries;
  }

  /**
   * Detect skill structures within a GitHub repository tree.
   */
  detectSkillStructures(
    tree: GitHubTreeEntry[],
    repoInfo: GitHubRepoInfo,
    subpath?: string,
  ): DetectedSkill[] {
    // Filter tree to subpath if specified
    let filteredTree = tree;
    if (subpath) {
      filteredTree = tree.filter(e => e.path.startsWith(subpath + '/') || e.path === subpath);
    }

    // Filter out unwanted paths
    filteredTree = filteredTree.filter(e => !this.isExcludedPath(e.path));

    // Find all SKILL.md files (literal basename only)
    const skillMdFiles = filteredTree.filter(e => isSkillMdPath(e.path));

    if (skillMdFiles.length === 0) {
      // No SKILL.md found — non-standard structure
      return [this.createSingleSkillFromTree(filteredTree, repoInfo, subpath, false)];
    }

    // Check if SKILL.md is at root level
    const rootSkillMd = skillMdFiles.find(e => {
      const normalized = e.path.replace(/\\/g, '/');
      return normalized === 'SKILL.md';
    });

    // If only root SKILL.md and no other SKILL.md files — single skill repo
    if (skillMdFiles.length === 1 && rootSkillMd) {
      return [this.createSingleSkillFromTree(filteredTree, repoInfo, subpath, true)];
    }

    // Multiple SKILL.md files — folder-per-skill structure
    const skills = this.detectFolderPerSkill(skillMdFiles, filteredTree, repoInfo, subpath);

    // If only one skill was detected from folder-per-skill, still return it
    return skills;
  }

  /**
   * Detect folder-per-skill structure from SKILL.md file locations.
   */
  private detectFolderPerSkill(
    skillMdFiles: GitHubTreeEntry[],
    tree: GitHubTreeEntry[],
    repoInfo: GitHubRepoInfo,
    subpath?: string,
  ): DetectedSkill[] {
    // Group by the parent directory of each SKILL.md
    const skillDirs = new Map<string, GitHubTreeEntry[]>();

    for (const skillMd of skillMdFiles) {
      const parentPath = skillMd.path.includes('/')
        ? skillMd.path.substring(0, skillMd.path.lastIndexOf('/'))
        : '';

      if (!skillDirs.has(parentPath)) {
        skillDirs.set(parentPath, []);
      }
      skillDirs.get(parentPath)!.push(skillMd);
    }

    const assigned = assignFilesToDeepestSkill([...skillDirs.keys()], tree);
    const skills: DetectedSkill[] = [];

    for (const [dirPath] of skillDirs) {
      const dirFiles = assigned.get(dirPath) || [];

      // Extract skill name from directory path
      const name = this.slugifyName(dirPath.includes('/') ? dirPath.split('/').pop()! : dirPath || repoInfo.name);

      const displayName = this.humanizeName(
        dirPath.includes('/') ? dirPath.split('/').pop()! : dirPath || repoInfo.name
      );

      skills.push({
        name,
        displayName,
        description: repoInfo.description || '',
        sourcePath: dirPath,
        hasSkillMd: true,
        fileCount: dirFiles.length,
        files: dirFiles,
        structure: 'folder-per-skill' as SkillStructure,
        repoInfo,
      });
    }

    return skills;
  }

  /**
   * Create a single DetectedSkill from the entire tree (for single-skill or non-standard repos).
   */
  private createSingleSkillFromTree(
    tree: GitHubTreeEntry[],
    repoInfo: GitHubRepoInfo,
    subpath?: string,
    hasSkillMd: boolean = false,
  ): DetectedSkill {
    const name = this.slugifyName(
      subpath
        ? subpath.split('/').pop()!
        : repoInfo.name
    );

    return {
      name,
      displayName: this.humanizeName(
        subpath
          ? subpath.split('/').pop()!
          : repoInfo.name
      ),
      description: repoInfo.description || '',
      sourcePath: subpath || '',
      hasSkillMd,
      fileCount: tree.length,
      files: tree,
      structure: hasSkillMd ? 'single-skill' : 'non-standard',
      repoInfo,
    };
  }

  /**
   * Analyze a GitHub repository — fetch info and detect skills.
   */
  async analyze(parsed: ParsedGitHubRepo): Promise<AnalyzeResult> {
    const repoInfo = await this.fetchRepoInfo(parsed);
    const effectiveParsed = this.getEffectiveParsed(parsed, repoInfo);

    const tree = await this.fetchRepoTree(effectiveParsed) as GitHubTreeWithRevision;
    const skills = this.detectSkillStructures(tree, repoInfo, effectiveParsed.subpath);
    const manifestContents: Record<string, string> = {};
    const manifestWarnings: string[] = [];
    const manifestPaths = tree
      .filter((entry) => entry.path === 'plugin.json'
        || entry.path === '.claude-plugin/plugin.json'
        || entry.path === '.claude-plugin/marketplace.json'
        || entry.path === '.codex-plugin/plugin.json'
        || entry.path === '.agents/plugins/marketplace.json'
        || entry.path === 'hooks/hooks.json')
      .map((entry) => entry.path);

    for (const manifestPath of manifestPaths) {
      try {
        manifestContents[manifestPath] = await this.fetchFileContent(effectiveParsed, manifestPath, tree.revision);
      } catch {
        manifestWarnings.push(`Could not fetch ${manifestPath}; it will require manual review.`);
      }
    }

    const detected = this.componentDetector.detect(tree, repoInfo, manifestContents, effectiveParsed.subpath);
    const revision = tree.revision || {
      ref: effectiveParsed.branch,
      resolvedAt: new Date().toISOString(),
    };

    const result: AnalyzeResult = {
      repoInfo,
      skills,
      components: detected.components,
      targets: this.getImportTargets(),
      revision,
      warnings: [...new Set([...manifestWarnings, ...detected.warnings])],
    };
    this.cachedAnalyses.set(this.analysisKey(parsed), result);
    return result;
  }

  getImportTargets(projects: Project[] = []): ImportTarget[] {
    const settings = this.settingsService.get() as any;
    const adapter = this.adapterService || new ImportAdapterService({
      ideService: new IDEAdapterService(),
      centralSkillsRoot: this.getSkillsRootFromSettings(),
    });
    return adapter.listTargets(projects, settings.ideRootOverrides || {});
  }

  async createImportPlan(
    parsed: ParsedGitHubRepo,
    selections: ImportComponentSelection[],
    projects: Project[] = [],
  ): Promise<ImportPlan> {
    const analysis = this.cachedAnalyses.get(this.analysisKey(parsed)) || await this.analyze(parsed);
    const targets = this.getImportTargets(projects);
    const plan = this.planService.create({
      sourceUrl: analysis.repoInfo.htmlUrl,
      sourceRef: analysis.revision.ref,
      commitSha: analysis.revision.commitSha,
      treeSha: analysis.revision.treeSha,
      components: analysis.components,
      targets,
      selections,
    });
    this.plans.set(plan.id, plan);
    this.planParsed.set(plan.id, { ...parsed });
    return plan;
  }

  getImportPlan(planId: string): ImportPlan | undefined {
    return this.plans.get(planId);
  }

  async previewComponent(
    parsed: ParsedGitHubRepo,
    componentId: string,
    filePath?: string,
  ): Promise<{ componentId: string; files: Array<{ path: string; content: string; truncated: boolean }>; revision: GitHubRevision }> {
    const analysis = this.cachedAnalyses.get(this.analysisKey(parsed)) || await this.analyze(parsed);
    const component = analysis.components.find((candidate) => candidate.id === componentId);
    if (!component) throw new Error(`Component "${componentId}" not found in the analyzed repository.`);
    const files = filePath ? component.files.filter((file) => file.path === filePath) : component.files.slice(0, 8);
    const previews = [];
    for (const file of files) {
      if ((file.size || 0) > 256 * 1024) {
        previews.push({ path: file.path, content: 'File is too large to preview.', truncated: true });
        continue;
      }
      try {
        const content = (await this.fetchFileBuffer(parsed, file, analysis.revision)).toString('utf8');
        previews.push({ path: file.path, content: content.slice(0, 64 * 1024), truncated: content.length > 64 * 1024 });
      } catch {
        previews.push({ path: file.path, content: 'File could not be downloaded for preview.', truncated: false });
      }
    }
    return { componentId, files: previews, revision: analysis.revision };
  }

  async importComponents(
    planId: string,
    onProgress?: (progress: ImportProgress) => void,
  ): Promise<ImportComponentResult[]> {
    const plan = this.plans.get(planId);
    const parsed = this.planParsed.get(planId);
    if (!plan || !parsed) throw new Error('Import plan was not found or has expired. Analyze the repository again.');
    if (plan.expiresAt && Date.parse(plan.expiresAt) <= Date.now()) {
      throw new Error('Import plan has expired. Analyze the repository again before installing.');
    }
    const cachedAnalysis = this.cachedAnalyses.get(this.analysisKey(parsed));
    if (cachedAnalysis && plan.commitSha && cachedAnalysis.revision.commitSha && plan.commitSha !== cachedAnalysis.revision.commitSha) {
      throw new Error('The analyzed repository revision changed. Create a new import plan before installing.');
    }

    const token = ++this.importGeneration;
    const results: ImportComponentResult[] = [];
    const orderedItems = this.orderPlanItems(plan.items);
    const total = orderedItems.length;
    const revision: GitHubRevision = {
      ref: plan.sourceRef,
      commitSha: plan.commitSha,
      treeSha: plan.treeSha,
      resolvedAt: new Date().toISOString(),
    };

    for (let index = 0; index < orderedItems.length; index += 1) {
      const item = orderedItems[index];
      const component = item.component;
      const progress = (phase: ImportProgress['phase'], percentComplete: number) => onProgress?.({
        current: index + 1,
        total,
        currentSkillName: component.displayName,
        currentComponentId: component.id,
        currentTargetId: item.target.id,
        phase,
        percentComplete,
      });

      if (this.importGeneration !== token) {
        results.push({
          componentId: component.id,
          componentName: component.displayName,
          kind: component.kind,
          targetId: item.target.id,
          status: 'failed',
          error: 'Import cancelled.',
        });
        continue;
      }

      if (item.selection.conflictStrategy === 'skip') {
        results.push({
          componentId: component.id,
          componentName: component.displayName,
          kind: component.kind,
          targetId: item.target.id,
          status: 'skipped',
          message: 'Skipped by the user because of a destination conflict.',
        });
        continue;
      }

      if (item.status !== 'ready') {
        results.push({
          componentId: component.id,
          componentName: component.displayName,
          kind: component.kind,
          targetId: item.target.id,
          status: item.status === 'needs-approval' ? 'needs-approval' : 'blocked',
          message: item.warnings.join(' ') || 'The item is not ready for installation.',
        });
        continue;
      }

      progress('fetching', Math.round((index / Math.max(total, 1)) * 100));
      let staged;
      let rollbackInstalled: (() => void) | undefined;
      try {
        staged = await this.stagingService.stage(component, (file) => this.fetchFileBuffer(parsed, file, revision), plan.id);
        progress('staging', Math.round(((index + 0.5) / Math.max(total, 1)) * 100));
        const adapter = this.adapterService || new ImportAdapterService({
          ideService: new IDEAdapterService(),
          centralSkillsRoot: this.getSkillsRootFromSettings(),
        });

        if (!item.target.supportedKinds.includes(component.kind)) {
          results.push({
            componentId: component.id,
            componentName: component.displayName,
            kind: component.kind,
            targetId: item.target.id,
            status: 'needs-approval',
            message: 'Native installation is unavailable. Review and run the authorized fallback command separately.',
          });
          continue;
        }

        let hookManifestContent: string | undefined;
        if (component.kind === 'hook' && typeof component.metadata.manifestPath === 'string') {
          hookManifestContent = await this.fetchFileContent(parsed, component.metadata.manifestPath, revision);
        }

        progress('installing', Math.round(((index + 0.75) / Math.max(total, 1)) * 100));
        const installed = await adapter.install({
          item,
          staged,
          hookManifestContent,
          sourceMetadata: {
            sourceRepo: plan.sourceUrl,
            sourceRef: plan.sourceRef,
            commitSha: plan.commitSha,
            treeSha: plan.treeSha,
          },
        });
        rollbackInstalled = installed.rollback;
        const record = this.createProvenanceRecord(plan, item, installed.destinationPath, staged, false, 'github-api', installed.backupPath);
        const persisted = this.getProvenanceService().upsert(record);
        const result: ImportComponentResult = {
          componentId: component.id,
          componentName: component.displayName,
          kind: component.kind,
          targetId: item.target.id,
          status: 'installed',
          destinationPath: installed.destinationPath,
          provenanceId: persisted.id,
        };

        if (installed.hookInstallation) {
          const hookKey = this.hookKey(plan.id, component.id, item.target.id);
          this.hookInstallations.set(hookKey, installed.hookInstallation);
          result.activation = installed.hookInstallation.preview;
          result.message = 'Installed disabled. A second confirmation is required for activation.';
        }
        results.push(result);
      } catch (error: any) {
        try {
          rollbackInstalled?.();
        } catch {
          // Preserve the original installation error; the destination remains in the result for recovery.
        }
        results.push({
          componentId: component.id,
          componentName: component.displayName,
          kind: component.kind,
          targetId: item.target.id,
          status: 'failed',
          error: error?.message || 'Component installation failed.',
        });
      } finally {
        if (staged) this.stagingService.cleanup(staged);
        progress('writing', Math.round(((index + 1) / Math.max(total, 1)) * 100));
      }
    }

    return results;
  }

  activateHook(input: {
    planId: string;
    componentId: string;
    targetId: string;
    approval: { contentSha256: string; events: string[] };
  }): ImportActivationResult {
    const installation = this.hookInstallations.get(this.hookKey(input.planId, input.componentId, input.targetId));
    if (!installation) throw new Error('Hook is not installed or its review session has expired.');
    const adapter = this.adapterService || new ImportAdapterService({
      ideService: new IDEAdapterService(),
      centralSkillsRoot: this.getSkillsRootFromSettings(),
    });
    adapter.getHookService().activate(installation, input.approval);
    const existing = this.getProvenanceService().find(input.componentId, input.targetId);
    if (existing) {
      this.getProvenanceService().upsert({
        ...existing,
        status: 'active',
        target: { ...existing.target, activated: true },
      });
    }
    return { success: true, activation: installation.preview };
  }

  deactivateHook(input: { planId: string; componentId: string; targetId: string }): { success: boolean } {
    const installation = this.hookInstallations.get(this.hookKey(input.planId, input.componentId, input.targetId));
    if (!installation) return { success: false };
    const adapter = this.adapterService || new ImportAdapterService({
      ideService: new IDEAdapterService(),
      centralSkillsRoot: this.getSkillsRootFromSettings(),
    });
    adapter.getHookService().deactivate(installation);
    const existing = this.getProvenanceService().find(input.componentId, input.targetId);
    if (existing) {
      this.getProvenanceService().upsert({
        ...existing,
        status: 'installed',
        target: { ...existing.target, activated: false },
      });
    }
    return { success: true };
  }

  async runFallback(input: { planId: string; componentId: string; targetId: string }): Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number | null }> {
    const plan = this.plans.get(input.planId);
    if (!plan) throw new Error('Import plan was not found or has expired. Analyze the repository again.');
    if (plan.expiresAt && Date.parse(plan.expiresAt) <= Date.now()) {
      throw new Error('Import plan has expired. Analyze the repository again before running a fallback.');
    }
    const item = plan?.items.find((candidate) => candidate.component.id === input.componentId && candidate.target.id === input.targetId);
    if (!item?.component.fallback || !item.selection.fallbackAuthorized) {
      throw new Error('The fallback command was not explicitly authorized for this component and target.');
    }
    if (item.status === 'blocked' || item.status === 'conflict') {
      throw new Error('Resolve the blocked or conflicting destination before running a fallback.');
    }
    const result = await this.commandService.run({
      ...item.component.fallback,
      authorized: true,
      cwd: item.target.projectPath,
    });
    const success = result.exitCode === 0;
    const provenance = this.getProvenanceService();
    const existing = provenance.find(item.component.id, item.target.id);
    const now = new Date().toISOString();
    provenance.upsert(existing ? {
      ...existing,
      status: success ? 'installed' : 'failed',
      method: 'authorized-command',
      lastOutput: { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode },
      lastError: success ? undefined : result.stderr || 'Fallback command failed.',
    } : {
      id: `${plan!.id}:${item.component.id}:${item.target.id}`,
      componentId: item.component.id,
      componentKind: item.component.kind,
      componentName: item.component.name,
      source: {
        type: 'github',
        url: plan!.sourceUrl,
        owner: parsed!.owner,
        repo: parsed!.repo,
        ref: plan!.sourceRef,
        commitSha: plan!.commitSha,
        treeSha: plan!.treeSha,
        sourcePath: item.component.sourcePath,
        acquisition: 'authorized-command',
      },
      target: {
        targetId: item.target.id,
        adapterId: item.target.adapterId,
        scope: item.target.scope,
        ideId: item.target.ideId,
        projectId: item.target.projectId,
        destinationPath: item.destinationPath,
        activated: false,
      },
      installedAt: now,
      updatedAt: now,
      status: success ? 'installed' : 'failed',
      fileHashes: {},
      method: 'authorized-command',
      lastOutput: { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode },
      lastError: success ? undefined : result.stderr || 'Fallback command failed.',
    });
    return { success, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
  }

  /**
   * Fetch the content of a single file from GitHub.
   */
  async fetchFileContent(parsed: ParsedGitHubRepo, filePath: string, revision?: GitHubRevision): Promise<string> {
    const safePath = ImportPathService.normalizeRepositoryPath(filePath);
    const encodedPath = safePath.split('/').map(encodeURIComponent).join('/');
    const data = await this.makeGitHubRequest<Record<string, unknown>>(
      `/repos/${parsed.owner}/${parsed.repo}/contents/${encodedPath}?ref=${encodeURIComponent(revision?.commitSha || parsed.branch)}`,
    );

    if (data.type === 'file' && typeof data.content === 'string') {
      // GitHub returns base64-encoded content
      return Buffer.from(data.content.replace(/\s/g, ''), 'base64').toString('utf-8');
    }

    throw new Error(`Could not fetch content for ${safePath}`);
  }

  async fetchFileBuffer(parsed: ParsedGitHubRepo, file: ImportSourceFile, revision?: GitHubRevision): Promise<Buffer> {
    const cacheKey = `${parsed.owner}/${parsed.repo}@${revision?.commitSha || parsed.branch}:${file.sha || file.path}`;
    const cached = this.fileBufferCache.get(cacheKey);
    if (cached) return Buffer.from(cached);

    if (file.sha) {
      const data = await this.makeGitHubRequest<Record<string, unknown>>(
        `/repos/${parsed.owner}/${parsed.repo}/git/blobs/${encodeURIComponent(file.sha)}`,
      );
      if (data.encoding === 'base64' && typeof data.content === 'string') {
        const buffer = Buffer.from(data.content.replace(/\s/g, ''), 'base64');
        this.cacheFileBuffer(cacheKey, buffer);
        return Buffer.from(buffer);
      }
    }
    const buffer = Buffer.from(await this.fetchFileContent(parsed, file.path, revision), 'utf8');
    this.cacheFileBuffer(cacheKey, buffer);
    return Buffer.from(buffer);
  }

  private cacheFileBuffer(key: string, buffer: Buffer): void {
    if (buffer.byteLength > 10 * 1024 * 1024) return;
    const previous = this.fileBufferCache.get(key);
    if (previous) this.fileBufferCacheBytes -= previous.byteLength;
    if (this.fileBufferCache.size >= 1_000 || this.fileBufferCacheBytes + buffer.byteLength > 50 * 1024 * 1024) {
      this.fileBufferCache.clear();
      this.fileBufferCacheBytes = 0;
    }
    this.fileBufferCache.set(key, Buffer.from(buffer));
    this.fileBufferCacheBytes += buffer.byteLength;
  }

  /**
   * Check which skill names already exist locally.
   */
  checkConflicts(skillNames: string[]): Record<string, boolean> {
    const skillService = this.createSkillService();
    const conflicts: Record<string, boolean> = {};

    for (const name of skillNames) {
      conflicts[name] = skillService.exists(name);
    }

    return conflicts;
  }

  /**
   * Cancel an in-progress import.
   */
  cancelImport(): void {
    this.importGeneration += 1;
  }

  /**
   * Import multiple skills from GitHub with progress reporting.
   */
  async importSkills(
    parsed: ParsedGitHubRepo,
    skills: DetectedSkill[],
    resolutions: Record<string, ConflictResolution>,
    onProgress?: (progress: ImportProgress) => void,
  ): Promise<ImportResult[]> {
    const token = ++this.importGeneration;
    const results: ImportResult[] = [];
    const skillService = this.createSkillService();
    const repoInfo = await this.fetchRepoInfo(parsed);
    const effectiveParsed = this.getEffectiveParsed(parsed, repoInfo);
    const total = skills.length;

    for (let i = 0; i < skills.length; i++) {
      if (this.importGeneration !== token) {
        results.push({
          skillName: skills[i].name,
          status: 'skipped',
          error: 'Import cancelled',
        });
        continue;
      }

      const skill = skills[i];
      const resolution = resolutions[skill.name];

      if (resolution?.strategy === 'skip') {
        results.push({ skillName: skill.name, status: 'skipped', skipReason: 'User chose to skip this skill due to a naming conflict.' });
        continue;
      }

      onProgress?.({
        current: i + 1,
        total,
        currentSkillName: skill.name,
        phase: 'fetching',
        percentComplete: Math.round(((i) / total) * 100),
      });

      try {
        // Fetch all file contents
        const importFiles: ImportFileEntry[] = [];
        const failedFileFetches: string[] = [];

        for (const file of skill.files) {
          if (this.isBinaryFile(file.path)) {
            continue; // Skip binary files
          }

          if ((file.size || 0) > 1024 * 1024) {
            continue; // Skip files > 1MB
          }

          try {
            const content = await this.fetchFileContent(effectiveParsed, file.path);
            // Make path relative to the skill's source directory
            const relativePath = skill.sourcePath
              ? file.path.substring(skill.sourcePath.length + 1)
              : file.path;
            if (relativePath) {
              importFiles.push({ path: relativePath, content });
            }
          } catch {
            failedFileFetches.push(file.path);
          }
        }

        if (importFiles.length === 0) {
          throw new Error(
            `No importable text files were downloaded for "${skill.name}". Failed fetches: ${failedFileFetches.length}.`
          );
        }

        const importedHasSkillMd = importFiles.some(f => isSkillMdPath(f.path));
        if (skill.hasSkillMd && !importedHasSkillMd) {
          throw new Error(`Required SKILL.md could not be downloaded for "${skill.name}"`);
        }

        onProgress?.({
          current: i + 1,
          total,
          currentSkillName: skill.name,
          phase: 'writing',
          percentComplete: Math.round(((i + 0.5) / total) * 100),
        });

        // Determine the final skill name
        let finalName = skill.name;
        if (resolution?.strategy === 'rename') {
          finalName = this.slugifyName(resolution.newName || '');
        }
        this.assertValidFinalName(finalName);

        const exists = skillService.exists(finalName);
        const wantsOverwrite = resolution?.strategy === 'overwrite';
        if (exists && !wantsOverwrite) {
          throw new Error(`Skill "${finalName}" already exists. Choose overwrite or a different rename.`);
        }

        // Write skill via SkillService
        const metadata: Record<string, unknown> = {
          sourceRepo: skill.repoInfo.htmlUrl,
          importedAt: new Date().toISOString(),
          displayName: skill.displayName,
          description: skill.description,
        };

        skillService.importFromBuffer(finalName, importFiles, metadata, { overwrite: wantsOverwrite });

        results.push({
          skillName: finalName,
          status: resolution?.strategy === 'rename' ? 'renamed' : 'imported',
          originalName: resolution?.strategy === 'rename' ? skill.name : undefined,
        });
      } catch (err: any) {
        results.push({
          skillName: skill.name,
          status: 'error',
          error: err.message || 'Unknown error during import',
        });
      }

      onProgress?.({
        current: i + 1,
        total,
        currentSkillName: skill.name,
        phase: 'writing',
        percentComplete: Math.round(((i + 1) / total) * 100),
      });
    }

    return results;
  }

  private createProvenanceRecord(
    plan: ImportPlan,
    item: ImportPlan['items'][number],
    destinationPath: string,
    staged: { files: Array<{ path: string }>; rootPath: string },
    activated: boolean,
    acquisition: 'github-api' | 'authorized-command',
    backupPath?: string,
  ): ImportProvenanceRecord {
    const parsed = this.planParsed.get(plan.id)!;
    const fileHashes = Object.fromEntries(staged.files.map((file) => [
      file.path,
      ImportProvenanceService.hash(fs.readFileSync(path.resolve(staged.rootPath, ...file.path.split('/')))),
    ]));
    const now = new Date().toISOString();
    return {
      id: `${plan.id}:${item.component.id}:${item.target.id}`,
      componentId: item.component.id,
      componentKind: item.component.kind,
      componentName: item.component.name,
      source: {
        type: 'github',
        url: plan.sourceUrl,
        owner: parsed.owner,
        repo: parsed.repo,
        ref: plan.sourceRef,
        commitSha: plan.commitSha,
        treeSha: plan.treeSha,
        sourcePath: item.component.sourcePath,
        acquisition,
      },
      target: {
        targetId: item.target.id,
        adapterId: item.target.adapterId,
        scope: item.target.scope,
        ideId: item.target.ideId,
        projectId: item.target.projectId,
        destinationPath,
        activated,
      },
      installedAt: now,
      updatedAt: now,
      status: activated ? 'active' : 'installed',
      fileHashes,
      method: acquisition === 'github-api' ? 'native' : 'authorized-command',
      backupPath,
    };
  }

  private getProvenanceService(): ImportProvenanceService {
    if (!this.provenanceService) this.provenanceService = new ImportProvenanceService();
    return this.provenanceService;
  }

  private orderPlanItems(items: ImportPlan['items']): ImportPlan['items'] {
    const byComponent = new Map(items.map((item) => [item.component.id, item]));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const ordered: ImportPlan['items'] = [];
    const visit = (item: ImportPlan['items'][number]) => {
      if (visited.has(item.component.id)) return;
      if (visiting.has(item.component.id)) throw new Error(`Circular import dependency at ${item.component.id}.`);
      visiting.add(item.component.id);
      for (const dependency of item.component.dependencies) {
        const dependencyItem = byComponent.get(dependency);
        if (dependencyItem) visit(dependencyItem);
      }
      visiting.delete(item.component.id);
      visited.add(item.component.id);
      ordered.push(item);
    };
    items.forEach(visit);
    return ordered;
  }

  private hookKey(planId: string, componentId: string, targetId: string): string {
    return `${planId}:${componentId}:${targetId}`;
  }

  private analysisKey(parsed: ParsedGitHubRepo): string {
    return `${parsed.owner}/${parsed.repo}@${parsed.branch}:${parsed.subpath || ''}`;
  }

  // ──────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────

  private assertSafeRedirect(url: URL): void {
    if (url.protocol !== 'https:' || !url.hostname || this.isPrivateHost(url.hostname)) {
      throw new Error('GitHub returned an unsafe redirect destination.');
    }
  }

  private isGitHubHost(hostname: string): boolean {
    const normalized = hostname.toLowerCase().replace(/\.$/, '');
    return normalized === 'api.github.com' || normalized === 'github.com' || normalized.endsWith('.github.com');
  }

  private isPrivateHost(hostname: string): boolean {
    const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (normalized === 'localhost' || normalized.endsWith('.localhost') || normalized === '::1') return true;
    const kind = isIP(normalized);
    if (kind === 4) {
      const octets = normalized.split('.').map(Number);
      return octets[0] === 10
        || octets[0] === 127
        || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
        || (octets[0] === 192 && octets[1] === 168)
        || (octets[0] === 169 && octets[1] === 254);
    }
    if (kind === 6) return normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
    return false;
  }

  /**
   * Make an authenticated request to the GitHub API using Node.js https module.
   */
  private async makeGitHubRequest<T>(endpoint: string): Promise<T> {
    const token = await this.resolveGithubToken();
    return new Promise((resolve, reject) => {
      const options: https.RequestOptions = {
        hostname: 'api.github.com',
        path: endpoint,
        method: 'GET',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Skills-Manager-App/1.0',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        timeout: 15000,
      };

      const req = https.request(options, (res) => {
        // Handle redirects
        if (res.statusCode === 301 || res.statusCode === 302) {
          const location = res.headers.location;
          if (location) {
            try {
              const redirectUrl = new URL(location);
              this.assertSafeRedirect(redirectUrl);
              const redirectToken = this.isGitHubHost(redirectUrl.hostname) ? token : undefined;
              this.makeGitHubRequestToHost<T>(redirectUrl.hostname, redirectUrl.pathname + redirectUrl.search, redirectToken)
                .then(resolve)
                .catch(reject);
            } catch (error) {
              reject(error);
            }
            return;
          }
        }

        let data = '';
        let responseBytes = 0;
        let responseTooLarge = false;
        res.on('data', (chunk) => {
          responseBytes += Buffer.byteLength(String(chunk));
          if (responseBytes > MAX_GITHUB_RESPONSE_BYTES) {
            responseTooLarge = true;
            req.destroy();
            reject(new Error('GitHub response exceeded the safe size limit.'));
            return;
          }
          data += chunk;
        });
        res.on('end', () => {
          if (responseTooLarge) return;
          if (res.statusCode === 403) {
            const remaining = parseInt(res.headers['x-ratelimit-remaining'] as string || '1', 10);
            const reset = parseInt(res.headers['x-ratelimit-reset'] as string || '0', 10);

            if (remaining === 0) {
              const error: GitHubApiError = {
                status: 403,
                message: 'GitHub API rate limit reached. Add a GitHub token in Settings for higher limits, or wait before trying again.',
                isRateLimit: true,
                rateLimitReset: reset,
                rateLimitRemaining: remaining,
              };
              reject(error);
              return;
            }
          }

          if (res.statusCode === 404) {
            reject({
              status: 404,
              message: 'Repository not found. Check the URL and ensure it is public, or add a GitHub token for private repos.',
              isRateLimit: false,
            } as GitHubApiError);
            return;
          }

          if (res.statusCode && res.statusCode >= 400) {
            let message = `GitHub API error (${res.statusCode})`;
            try {
              const parsed = JSON.parse(data);
              message = parsed.message || message;
            } catch {
              // Use default message
            }
            reject({
              status: res.statusCode,
              message,
              isRateLimit: false,
            } as GitHubApiError);
            return;
          }

          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Invalid JSON response from GitHub API'));
          }
        });
      });

      req.on('error', (err) => {
        reject({
          status: 0,
          message: `Cannot connect to GitHub: ${err.message}`,
          isRateLimit: false,
        } as GitHubApiError);
      });

      req.on('timeout', () => {
        req.destroy();
        reject({
          status: 0,
          message: 'Connection to GitHub timed out. Check your internet connection.',
          isRateLimit: false,
        } as GitHubApiError);
      });

      req.end();
    });
  }

  private async resolveGithubToken(): Promise<string> {
    if (typeof (this.settingsService as any).getGithubToken === 'function') {
      return (await (this.settingsService as any).getGithubToken()) || '';
    }

    // Backward-compat path for tests and older settings service stubs.
    const settings = this.settingsService.get();
    return (settings as any).githubToken || '';
  }

  /**
   * Make a GitHub API request to a specific host (for redirects).
   */
  private makeGitHubRequestToHost<T>(hostname: string, path: string, token?: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const options: https.RequestOptions = {
        hostname,
        path,
        method: 'GET',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Skills-Manager-App/1.0',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        timeout: 15000,
      };

      const req = https.request(options, (res) => {
        let data = '';
        let responseBytes = 0;
        let responseTooLarge = false;
        res.on('data', (chunk) => {
          responseBytes += Buffer.byteLength(String(chunk));
          if (responseBytes > MAX_GITHUB_RESPONSE_BYTES) {
            responseTooLarge = true;
            req.destroy();
            reject(new Error('GitHub response exceeded the safe size limit.'));
            return;
          }
          data += chunk;
        });
        res.on('end', () => {
          if (responseTooLarge) return;
          if (res.statusCode === 403) {
            const remaining = parseInt(res.headers['x-ratelimit-remaining'] as string || '1', 10);
            const reset = parseInt(res.headers['x-ratelimit-reset'] as string || '0', 10);

            if (remaining === 0) {
              const error: GitHubApiError = {
                status: 403,
                message: 'GitHub API rate limit reached. Add a GitHub token in Settings for higher limits, or wait before trying again.',
                isRateLimit: true,
                rateLimitReset: reset,
                rateLimitRemaining: remaining,
              };
              reject(error);
              return;
            }
          }

          if (res.statusCode === 404) {
            reject({
              status: 404,
              message: 'Repository not found. Check the URL and ensure it is public, or add a GitHub token for private repos.',
              isRateLimit: false,
            } as GitHubApiError);
            return;
          }

          if (res.statusCode && res.statusCode >= 400) {
            let message = `GitHub API error (${res.statusCode})`;
            try {
              const parsed = JSON.parse(data);
              message = parsed.message || message;
            } catch {
              // Use default message
            }
            reject({
              status: res.statusCode,
              message,
              isRateLimit: false,
            } as GitHubApiError);
            return;
          }

          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Invalid JSON response from GitHub API'));
          }
        });
      });

      req.on('error', (err) => {
        reject({
          status: 0,
          message: `Cannot connect to GitHub: ${err.message}`,
          isRateLimit: false,
        } as GitHubApiError);
      });

      req.on('timeout', () => {
        req.destroy();
        reject({
          status: 0,
          message: 'Connection to GitHub timed out.',
          isRateLimit: false,
        } as GitHubApiError);
      });

      req.end();
    });
  }

  /**
   * Check if a path should be excluded from import.
   */
  private isExcludedPath(filePath: string): boolean {
    const parts = filePath.split('/');
    return parts.some(part =>
      part === '.git' ||
      part === 'node_modules' ||
      part === '.DS_Store' ||
      part === 'Thumbs.db' ||
      part === '__pycache__' ||
      part === '.venv' ||
      part === 'dist' ||
      part === 'build'
    );
  }

  /**
   * Check if a file is likely binary based on extension.
   */
  private isBinaryFile(filePath: string): boolean {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const binaryExtensions = [
      'png', 'jpg', 'jpeg', 'gif', 'ico', 'svg', 'webp', 'bmp', 'tiff',
      'zip', 'tar', 'gz', 'bz2', '7z', 'rar',
      'woff', 'woff2', 'ttf', 'eot', 'otf',
      'mp3', 'mp4', 'avi', 'mov', 'wmv', 'flv',
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
      'exe', 'dll', 'so', 'dylib',
      'pyc', 'class', 'o', 'obj',
    ];
    return binaryExtensions.includes(ext);
  }

  /**
   * Convert a name to a valid slug for skill naming.
   */
  private slugifyName(name: string): string {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 64);
    return slug.length > 0 ? slug : 'skill';
  }

  /**
   * Convert a slug-like name to a human-readable display name.
   */
  private humanizeName(name: string): string {
    return name
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim();
  }
}
