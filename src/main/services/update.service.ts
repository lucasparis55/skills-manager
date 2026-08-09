import { spawn } from 'child_process';
import { app, shell } from 'electron';
import path from 'path';
import packageJson from '../../../package.json';

const GITHUB_API_URL = 'https://api.github.com/repos/lucasparis55/skills-manager/releases/latest';
const RELEASE_BASE_URL = 'https://github.com/lucasparis55/skills-manager/releases/tag';
const RELEASE_DOWNLOAD_BASE_URL = 'https://github.com/lucasparis55/skills-manager/releases/download';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const RELEASE_TAG_PATTERN = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
}

export type UpdateOperationStage = 'downloading' | 'installing';

export interface UpdateOperationProgress {
  stage: UpdateOperationStage;
  percent: number;
}

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  body: string | null;
  published_at: string | null;
}

interface UpdateProcessLike {
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  once(event: 'error', listener: (error: Error) => void): this;
  once(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
}

interface UpdateServiceDependencies {
  fetch: typeof fetch;
  shell: { openExternal: (url: string) => Promise<void> };
  spawnUpdate: (executable: string, args: string[]) => UpdateProcessLike;
  updateExecutable: string;
  launcherExecutable: string;
  relaunch: (options: { execPath: string }) => void;
  quit: () => void;
  isPackaged: boolean;
  platform: NodeJS.Platform;
  currentVersion: string;
  log: Pick<Console, 'error'>;
}

interface AvailableRelease {
  latestVersion: string;
  releaseUrl: string;
  releaseNotes: string | null;
  publishedAt: string | null;
}

function stripVersionPrefix(version: string): string {
  return version.replace(/^v/i, '');
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export function resolveUpdateExecutable(execPath: string): string {
  return path.resolve(path.dirname(execPath), '..', 'Update.exe');
}

export function resolveLauncherExecutable(execPath: string): string {
  return path.resolve(path.dirname(execPath), '..', path.basename(execPath));
}

function parseProgressLine(line: string): number | null {
  const normalized = line.trim();
  if (!/^\d+$/.test(normalized)) return null;

  const value = Number(normalized);
  return Number.isInteger(value) && value >= 0 && value <= 100 ? value : null;
}

function progressStage(percent: number): UpdateOperationStage {
  return percent >= 30 ? 'installing' : 'downloading';
}

function buildUpdateProcessError(stderr: string, exitCode: number | null): Error {
  const message = stderr.trim();
  return new Error(message || `Update process exited with code ${exitCode ?? 'unknown'}`);
}

function parseGitHubRelease(data: unknown): GitHubRelease {
  if (!data || typeof data !== 'object') {
    throw new Error('GitHub release response is invalid');
  }

  const release = data as Record<string, unknown>;
  if (
    typeof release.tag_name !== 'string' ||
    !RELEASE_TAG_PATTERN.test(release.tag_name) ||
    typeof release.html_url !== 'string'
  ) {
    throw new Error('GitHub release metadata is invalid');
  }

  return {
    tag_name: release.tag_name,
    html_url: release.html_url,
    body: typeof release.body === 'string' ? release.body : null,
    published_at: typeof release.published_at === 'string' ? release.published_at : null,
  };
}

export function isVersionGreaterThan(latest: string, current: string): boolean {
  const split = (v: string) => {
    const bare = stripVersionPrefix(v);
    const [core, ...preParts] = bare.split('-');
    const pre = preParts.length ? preParts.join('-') : null;
    const nums = core.split('.').map((p) => {
      const n = Number(p);
      return Number.isFinite(n) ? n : 0;
    });
    return { nums, pre };
  };
  const a = split(latest);
  const b = split(current);
  const len = Math.max(a.nums.length, b.nums.length);
  for (let i = 0; i < len; i++) {
    const x = a.nums[i] || 0;
    const y = b.nums[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  // equal core: no pre > with pre
  if (a.pre === null && b.pre !== null) return true;
  if (a.pre !== null && b.pre === null) return false;
  if (a.pre !== null && b.pre !== null) return a.pre > b.pre;
  return false;
}

export function buildReleaseFeedUrl(version: string): string {
  if (!RELEASE_TAG_PATTERN.test(version)) {
    throw new Error('Release version is invalid');
  }

  return `${RELEASE_DOWNLOAD_BASE_URL}/${encodeURIComponent(version)}`;
}

export class UpdateService {
  private deps: UpdateServiceDependencies;
  private cache: { result: UpdateCheckResult; timestamp: number } | null = null;
  private availableRelease: AvailableRelease | null = null;
  private activeUpdate: Promise<void> | null = null;

  constructor(deps: Partial<UpdateServiceDependencies> = {}) {
    this.deps = {
      fetch: deps.fetch ?? globalThis.fetch.bind(globalThis),
      shell: deps.shell ?? { openExternal: (url: string) => shell.openExternal(url) },
      spawnUpdate: deps.spawnUpdate ?? ((executable, args) => spawn(executable, args, {
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })),
      updateExecutable: deps.updateExecutable ?? resolveUpdateExecutable(process.execPath),
      launcherExecutable: deps.launcherExecutable ?? resolveLauncherExecutable(process.execPath),
      relaunch: deps.relaunch ?? ((options) => app.relaunch(options)),
      quit: deps.quit ?? (() => app.quit()),
      isPackaged: deps.isPackaged ?? false,
      platform: deps.platform ?? process.platform,
      currentVersion: deps.currentVersion ?? packageJson.version,
      log: deps.log ?? console,
    };
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    if (!this.canUpdate()) {
      this.availableRelease = null;
      return this.buildResult(false, null);
    }

    if (this.cache && Date.now() - this.cache.timestamp < CACHE_TTL_MS) {
      return this.cache.result;
    }

    try {
      const response = await this.deps.fetch(GITHUB_API_URL, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': `skills-manager/${this.deps.currentVersion}`,
        },
      });

      if (!response.ok) {
        throw new Error(`GitHub API returned ${response.status}`);
      }

      const release = parseGitHubRelease(await response.json());
      const hasUpdate = isVersionGreaterThan(release.tag_name, this.deps.currentVersion);
      const releaseData = {
        latestVersion: release.tag_name,
        releaseUrl: release.html_url,
        releaseNotes: release.body,
        publishedAt: release.published_at,
      };
      const result = this.buildResult(hasUpdate, releaseData);

      this.availableRelease = hasUpdate ? releaseData : null;
      this.cache = { result, timestamp: Date.now() };
      return result;
    } catch (err) {
      this.availableRelease = null;
      this.deps.log.error('Failed to check for updates:', err);
      return this.buildResult(false, null);
    }
  }

  async downloadAndInstall(
    onProgress: (progress: UpdateOperationProgress) => void = () => {},
  ): Promise<void> {
    if (!this.canUpdate()) {
      throw new Error('App updates are only supported on packaged Windows installations');
    }

    if (this.activeUpdate) {
      return this.activeUpdate;
    }

    if (!this.availableRelease) {
      throw new Error('No update is available');
    }

    const feedUrl = buildReleaseFeedUrl(this.availableRelease.latestVersion);
    const updatePromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      let lastPercent = -1;
      let stdoutBuffer = '';
      let stderr = '';

      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(toError(error));
      };

      const reportProgress = (percent: number) => {
        if (percent <= lastPercent) return;
        lastPercent = percent;
        try {
          onProgress({ stage: progressStage(percent), percent });
        } catch (error) {
          fail(error);
        }
      };

      const handleStdout = (chunk: Buffer | string) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? '';
        lines.forEach((line) => {
          const percent = parseProgressLine(line);
          if (percent !== null) reportProgress(percent);
        });
      };

      const flushStdout = () => {
        const percent = parseProgressLine(stdoutBuffer);
        if (percent !== null) reportProgress(percent);
        stdoutBuffer = '';
      };

      const handleClose = (exitCode: number | null) => {
        if (settled) return;
        flushStdout();
        if (settled) return;

        if (exitCode !== 0) {
          fail(buildUpdateProcessError(stderr, exitCode));
          return;
        }

        try {
          reportProgress(100);
          if (settled) return;
          this.deps.relaunch({ execPath: this.deps.launcherExecutable });
          this.deps.quit();
          this.availableRelease = null;
          settled = true;
          resolve();
        } catch (error) {
          fail(error);
        }
      };

      try {
        reportProgress(0);
        if (settled) return;
        const updateProcess = this.deps.spawnUpdate(this.deps.updateExecutable, ['--update', feedUrl]);
        updateProcess.stdout.on('data', handleStdout);
        updateProcess.stderr.on('data', (chunk: Buffer | string) => {
          stderr += chunk.toString();
        });
        updateProcess.once('error', fail);
        updateProcess.once('close', handleClose);
      } catch (error) {
        fail(error);
      }
    });

    this.activeUpdate = updatePromise;
    try {
      await updatePromise;
    } finally {
      this.activeUpdate = null;
    }
  }

  async openReleasePage(version: string): Promise<void> {
    if (!RELEASE_TAG_PATTERN.test(version)) {
      throw new Error('Release version is invalid');
    }

    const url = `${RELEASE_BASE_URL}/${encodeURIComponent(version)}`;
    await this.deps.shell.openExternal(url);
  }

  private canUpdate(): boolean {
    return this.deps.isPackaged && this.deps.platform === 'win32';
  }

  private buildResult(
    hasUpdate: boolean,
    data: AvailableRelease | null,
  ): UpdateCheckResult {
    return {
      hasUpdate,
      currentVersion: this.deps.currentVersion,
      latestVersion: data?.latestVersion ?? null,
      releaseUrl: data?.releaseUrl ?? null,
      releaseNotes: data?.releaseNotes ?? null,
      publishedAt: data?.publishedAt ?? null,
    };
  }
}
