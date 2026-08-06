import { autoUpdater, shell } from 'electron';
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

export type UpdateOperationStatus = 'downloading' | 'installing';

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  body: string | null;
  published_at: string | null;
}

interface AutoUpdaterLike {
  setFeedURL(options: { url: string }): void;
  checkForUpdates(): void;
  quitAndInstall(): void;
  on(event: 'error', listener: (error: Error) => void): void;
  on(event: 'update-downloaded', listener: () => void): void;
  on(event: 'update-not-available', listener: () => void): void;
  removeListener(event: 'error', listener: (error: Error) => void): void;
  removeListener(event: 'update-downloaded', listener: () => void): void;
  removeListener(event: 'update-not-available', listener: () => void): void;
}

interface UpdateServiceDependencies {
  fetch: typeof fetch;
  shell: { openExternal: (url: string) => Promise<void> };
  autoUpdater: AutoUpdaterLike;
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
      autoUpdater: deps.autoUpdater ?? autoUpdater,
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

  async downloadAndInstall(onStatus: (status: UpdateOperationStatus) => void = () => {}): Promise<void> {
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

      const cleanup = () => {
        this.deps.autoUpdater.removeListener('error', handleError);
        this.deps.autoUpdater.removeListener('update-downloaded', handleDownloaded);
        this.deps.autoUpdater.removeListener('update-not-available', handleNotAvailable);
      };

      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(toError(error));
      };

      const handleError = (error: Error) => fail(error);
      const handleDownloaded = () => {
        if (settled) return;
        try {
          onStatus('installing');
          this.deps.autoUpdater.quitAndInstall();
          this.availableRelease = null;
          settled = true;
          cleanup();
          resolve();
        } catch (error) {
          fail(error);
        }
      };
      const handleNotAvailable = () => fail(new Error('The update is no longer available'));

      this.deps.autoUpdater.on('error', handleError);
      this.deps.autoUpdater.on('update-downloaded', handleDownloaded);
      this.deps.autoUpdater.on('update-not-available', handleNotAvailable);

      try {
        onStatus('downloading');
        this.deps.autoUpdater.setFeedURL({ url: feedUrl });
        this.deps.autoUpdater.checkForUpdates();
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
