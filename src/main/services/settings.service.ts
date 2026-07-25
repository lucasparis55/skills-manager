import fs from 'fs';
import path from 'path';
import { getAppDataDir } from '../utils/paths';
import type { AppSettings, PublicAppSettings } from '../types/domain';
import { SecureTokenService } from './secure-token.service';

const DEFAULT_SETTINGS: AppSettings = {
  centralSkillsRoot: path.join(getAppDataDir(), 'skills'),
  checkForUpdates: true,
  autoScanProjects: true,
  symlinkStrategy: 'auto',
  developerModeEnabled: false,
  theme: 'dark',
  projectScanDepth: 2,
  ideRootOverrides: {},
};

type LegacySettings = Partial<AppSettings> & {
  githubToken?: string;
  hasGithubToken?: boolean;
};

/**
 * Settings Service - Manages application settings
 */
export class SettingsService {
  private settingsPath: string;
  private settings: AppSettings;
  private readonly secureTokenService: SecureTokenService;
  private pendingLegacyGithubToken: string | null = null;
  private migrationPromise: Promise<void> | null = null;

  constructor(secureTokenService: SecureTokenService = new SecureTokenService()) {
    const appDir = getAppDataDir();
    if (!fs.existsSync(appDir)) {
      fs.mkdirSync(appDir, { recursive: true });
    }
    this.settingsPath = path.join(appDir, 'settings.json');
    this.secureTokenService = secureTokenService;
    this.settings = this.load();
  }

  /**
   * Load settings from disk
   */
  private load(): AppSettings {
    try {
      if (!fs.existsSync(this.settingsPath)) {
        return { ...DEFAULT_SETTINGS };
      }

      const data = fs.readFileSync(this.settingsPath, 'utf-8');
      const persisted = JSON.parse(data) as LegacySettings;
      const hadLegacyTokenField = Object.prototype.hasOwnProperty.call(persisted, 'githubToken');
      const { githubToken, hasGithubToken: _ignoredHasGithubToken, ...rest } = persisted;

      if (typeof githubToken === 'string' && githubToken.trim().length > 0) {
        this.pendingLegacyGithubToken = githubToken.trim();
      }

      const merged = { ...DEFAULT_SETTINGS, ...rest };

      // Remove sensitive legacy field immediately from plaintext settings file.
      if (hadLegacyTokenField) {
        this.saveToPath(merged);
      }

      return merged;
    } catch {
      // Use defaults
    }

    return { ...DEFAULT_SETTINGS };
  }

  /**
   * Save settings to disk
   */
  private save(): void {
    this.saveToPath(this.settings);
  }

  private saveToPath(data: AppSettings): void {
    fs.writeFileSync(this.settingsPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  private async ensureLegacyTokenMigrated(): Promise<void> {
    if (!this.pendingLegacyGithubToken) {
      return;
    }

    if (!this.migrationPromise) {
      const tokenToMigrate = this.pendingLegacyGithubToken;
      this.migrationPromise = this.secureTokenService
        .setGithubToken(tokenToMigrate)
        .then(() => {
          this.pendingLegacyGithubToken = null;
          this.migrationPromise = null;
        })
        .catch((err) => {
          this.migrationPromise = null;
          throw err;
        });
    }

    await this.migrationPromise;
  }

  /**
   * Get current settings
   */
  get(): AppSettings {
    return { ...this.settings };
  }

  /**
   * Update settings
   */
  update(updates: Partial<AppSettings>): AppSettings {
    const { githubToken: _legacyToken, hasGithubToken: _publicFlag, ...safeUpdates } =
      (updates as LegacySettings) || {};

    const next: AppSettings = { ...this.settings, ...safeUpdates };

    if (Object.prototype.hasOwnProperty.call(safeUpdates, 'centralSkillsRoot')) {
      const raw = next.centralSkillsRoot;
      if (typeof raw !== 'string' || raw.trim().length === 0) {
        throw new Error('centralSkillsRoot must be a non-empty path');
      }
      const absolute = path.resolve(raw.trim());
      if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) {
        throw new Error(`Central skills root must be an existing directory: ${absolute}`);
      }
      next.centralSkillsRoot = absolute;
    }

    if (Object.prototype.hasOwnProperty.call(safeUpdates, 'projectScanDepth')) {
      const depth = next.projectScanDepth;
      if (!Number.isInteger(depth) || depth < 1 || depth > 5) {
        throw new Error('projectScanDepth must be an integer between 1 and 5');
      }
    }

    this.settings = next;
    this.save();
    return this.get();
  }

  async getPublicSettings(): Promise<PublicAppSettings> {
    return {
      ...this.get(),
      hasGithubToken: await this.hasGithubToken(),
    };
  }

  async getGithubToken(): Promise<string> {
    if (this.pendingLegacyGithubToken) {
      try {
        await this.ensureLegacyTokenMigrated();
      } catch {
        return this.pendingLegacyGithubToken;
      }
      if (this.pendingLegacyGithubToken) {
        return this.pendingLegacyGithubToken;
      }
    }

    return this.secureTokenService.getGithubToken();
  }

  async hasGithubToken(): Promise<boolean> {
    const token = await this.getGithubToken();
    return token.length > 0;
  }

  async setGithubToken(token: string): Promise<void> {
    await this.secureTokenService.setGithubToken(token);
    this.pendingLegacyGithubToken = null;
  }

  async clearGithubToken(): Promise<void> {
    await this.secureTokenService.clearGithubToken();
    this.pendingLegacyGithubToken = null;
  }
}
