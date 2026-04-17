import fs from 'fs';
import path from 'path';
import { getAppDataDir } from '../utils/paths';
import type { AppSettings } from '../types/domain';

const DEFAULT_SETTINGS: AppSettings = {
  centralSkillsRoot: path.join(getAppDataDir(), 'skills'),
  checkForUpdates: true,
  autoScanProjects: true,
  symlinkStrategy: 'auto',
  developerModeEnabled: false,
  theme: 'dark',
  ideRootOverrides: {},
  githubToken: '',
};

/**
 * Settings Service - Manages application settings
 */
export class SettingsService {
  private settingsPath: string;
  private settings: AppSettings;

  constructor() {
    const appDir = getAppDataDir();
    if (!fs.existsSync(appDir)) {
      fs.mkdirSync(appDir, { recursive: true });
    }
    this.settingsPath = path.join(appDir, 'settings.json');
    this.settings = this.load();
  }

  /**
   * Load settings from disk
   */
  private load(): AppSettings {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf-8');
        return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
      }
    } catch {
      // Use defaults
    }

    return { ...DEFAULT_SETTINGS };
  }

  /**
   * Save settings to disk
   */
  private save(): void {
    fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8');
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
    this.settings = { ...this.settings, ...updates };
    this.save();
    return this.get();
  }
}
