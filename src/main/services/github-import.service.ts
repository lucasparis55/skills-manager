import https from 'node:https';
import { getSkillsRoot } from '../utils/paths';
import { SkillService } from './skill.service';
import { SettingsService } from './settings.service';
import type {
  ParsedGitHubRepo,
  GitHubRepoInfo,
  GitHubTreeEntry,
  DetectedSkill,
  SkillStructure,
  ConflictResolution,
  ImportResult,
  ImportProgress,
  ImportFileEntry,
  AnalyzeResult,
  GitHubApiError,
} from '../types/github';

/**
 * GitHub Import Service - Handles importing skills from GitHub repositories
 */
export class GitHubImportService {
  private settingsService: SettingsService;
  private cancelled = false;

  constructor(settingsService: SettingsService) {
    this.settingsService = settingsService;
  }

  private resolveSkillsRoot(): string {
    const configured = this.settingsService.get().centralSkillsRoot;
    if (typeof configured === 'string' && configured.trim().length > 0) {
      return configured;
    }
    return getSkillsRoot();
  }

  private createSkillService(): SkillService {
    return new SkillService(this.resolveSkillsRoot());
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
    const data = await this.makeGitHubRequest<any>(
      `/repos/${parsed.owner}/${parsed.repo}`
    );

    return {
      name: data.name,
      fullName: data.full_name,
      description: data.description || '',
      defaultBranch: data.default_branch || 'main',
      isPrivate: data.private || false,
      htmlUrl: data.html_url,
      starsCount: data.stargazers_count || 0,
    };
  }

  /**
   * Fetch the full file tree of a repository.
   */
  async fetchRepoTree(parsed: ParsedGitHubRepo): Promise<GitHubTreeEntry[]> {
    const branch = parsed.branch;
    const data = await this.makeGitHubRequest<any>(
      `/repos/${parsed.owner}/${parsed.repo}/git/trees/${branch}?recursive=1`
    );

    const entries: GitHubTreeEntry[] = (data.tree || [])
      .filter((e: any) => e.type === 'blob')
      .map((e: any) => ({
        path: e.path,
        type: e.type as 'blob',
        sha: e.sha,
        size: e.size,
      }));

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

    // Find all SKILL.md files
    const skillMdFiles = filteredTree.filter(e =>
      e.path.endsWith('SKILL.md') || e.path.endsWith('/SKILL.md')
    );

    if (skillMdFiles.length === 0) {
      // No SKILL.md found — non-standard structure
      return [this.createSingleSkillFromTree(filteredTree, repoInfo, subpath, false)];
    }

    // Check if SKILL.md is at root level
    const rootSkillMd = skillMdFiles.find(
      e => e.path === 'SKILL.md' || (!e.path.includes('/') && e.path.endsWith('SKILL.md'))
    );

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

    const skills: DetectedSkill[] = [];

    for (const [dirPath, _skillMdEntries] of skillDirs) {
      // Collect all files under this directory
      const prefix = dirPath ? dirPath + '/' : '';
      const dirFiles = tree.filter(
        e => e.path.startsWith(prefix) && e.path !== prefix
      );

      // Extract skill name from directory path
      const name = this.slugifyName(dirPath.includes('/') ? dirPath.split('/').pop()! : dirPath || repoInfo.name);

      // Try to read description from SKILL.md frontmatter (we'll fetch content later)
      const skillMdFile = _skillMdEntries[0];
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

    const tree = await this.fetchRepoTree(effectiveParsed);
    const skills = this.detectSkillStructures(tree, repoInfo, effectiveParsed.subpath);

    return { repoInfo, skills };
  }

  /**
   * Fetch the content of a single file from GitHub.
   */
  async fetchFileContent(parsed: ParsedGitHubRepo, filePath: string): Promise<string> {
    const data = await this.makeGitHubRequest<any>(
      `/repos/${parsed.owner}/${parsed.repo}/contents/${filePath}?ref=${parsed.branch}`
    );

    if (data.type === 'file' && data.content) {
      // GitHub returns base64-encoded content
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }

    throw new Error(`Could not fetch content for ${filePath}`);
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
    this.cancelled = true;
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
    this.cancelled = false;
    const results: ImportResult[] = [];
    const skillService = this.createSkillService();
    const repoInfo = await this.fetchRepoInfo(parsed);
    const effectiveParsed = this.getEffectiveParsed(parsed, repoInfo);
    const total = skills.length;

    for (let i = 0; i < skills.length; i++) {
      if (this.cancelled) {
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

        const importedHasSkillMd = importFiles.some(f => f.path === 'SKILL.md' || f.path.endsWith('/SKILL.md'));
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

  // ──────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────

  /**
   * Make an authenticated request to the GitHub API using Node.js https module.
   */
  private makeGitHubRequest<T>(endpoint: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const token = this.settingsService.get().githubToken;

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
            const redirectUrl = new URL(location);
            this.makeGitHubRequestToHost<T>(redirectUrl.hostname, redirectUrl.pathname + redirectUrl.search, token)
              .then(resolve)
              .catch(reject);
            return;
          }
        }

        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
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
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
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
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 64);
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
