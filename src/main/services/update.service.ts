import { shell } from 'electron';
import packageJson from '../../../package.json';

const GITHUB_API_URL = 'https://api.github.com/repos/lucasparis55/skills-manager/releases/latest';
const RELEASE_BASE_URL = 'https://github.com/lucasparis55/skills-manager/releases/tag';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string | null;
  releaseUrl: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
}

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  body: string | null;
  published_at: string | null;
}

interface UpdateServiceDependencies {
  fetch: typeof fetch;
  shell: { openExternal: (url: string) => Promise<void> };
  isPackaged: boolean;
  currentVersion: string;
  log: Pick<Console, 'error'>;
}

function stripVersionPrefix(version: string): string {
  return version.replace(/^v/i, '');
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

export class UpdateService {
  private deps: UpdateServiceDependencies;
  private cache: { result: UpdateCheckResult; timestamp: number } | null = null;

  constructor(deps: Partial<UpdateServiceDependencies> = {}) {
    this.deps = {
      fetch: deps.fetch ?? globalThis.fetch.bind(globalThis),
      shell: deps.shell ?? { openExternal: (url: string) => shell.openExternal(url) },
      isPackaged: deps.isPackaged ?? true,
      currentVersion: deps.currentVersion ?? packageJson.version,
      log: deps.log ?? console,
    };
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    if (!this.deps.isPackaged) {
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

      const data = (await response.json()) as GitHubRelease;
      const latestVersion = data.tag_name;
      const hasUpdate = isVersionGreaterThan(latestVersion, this.deps.currentVersion);

      const result = this.buildResult(hasUpdate, {
        latestVersion,
        releaseUrl: data.html_url,
        releaseNotes: data.body,
        publishedAt: data.published_at,
      });

      this.cache = { result, timestamp: Date.now() };
      return result;
    } catch (err) {
      this.deps.log.error('Failed to check for updates:', err);
      return this.buildResult(false, null);
    }
  }

  async openReleasePage(version: string): Promise<void> {
    const url = `${RELEASE_BASE_URL}/${version}`;
    await this.deps.shell.openExternal(url);
  }

  private buildResult(
    hasUpdate: boolean,
    data: {
      latestVersion: string;
      releaseUrl: string;
      releaseNotes: string | null;
      publishedAt: string | null;
    } | null,
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
