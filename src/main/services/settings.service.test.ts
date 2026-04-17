import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

var appDataDir = '';

vi.mock('../utils/paths', () => ({
  getAppDataDir: () => appDataDir || path.join(os.tmpdir(), 'settings-service-default'),
}));

describe('SettingsService', () => {
  beforeEach(() => {
    vi.resetModules();
    appDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-service-'));
  });

  afterEach(() => {
    fs.rmSync(appDataDir, { recursive: true, force: true });
  });

  it('loads defaults and creates settings directory when missing', async () => {
    const { SettingsService } = await import('./settings.service');
    const service = new SettingsService();
    const settings = service.get();

    expect(settings.centralSkillsRoot).toContain('skills');
    expect(settings.symlinkStrategy).toBe('auto');
    expect(settings.theme).toBe('dark');
    expect(settings.autoScanProjects).toBe(true);
  });

  it('merges persisted settings with defaults', async () => {
    const { SettingsService } = await import('./settings.service');
    const persisted = {
      theme: 'light',
      symlinkStrategy: 'junction',
      githubToken: 'token',
    };
    fs.writeFileSync(path.join(appDataDir, 'settings.json'), JSON.stringify(persisted), 'utf-8');

    const service = new SettingsService();
    const settings = service.get();

    expect(settings.theme).toBe('light');
    expect(settings.symlinkStrategy).toBe('junction');
    expect(settings.githubToken).toBe('token');
    expect(settings.autoScanProjects).toBe(true);
  });

  it('falls back to defaults for invalid JSON file', async () => {
    const { SettingsService } = await import('./settings.service');
    fs.writeFileSync(path.join(appDataDir, 'settings.json'), '{bad json', 'utf-8');

    const service = new SettingsService();
    const settings = service.get();

    expect(settings.theme).toBe('dark');
    expect(settings.centralSkillsRoot).toContain('skills');
  });

  it('persists updates to disk', async () => {
    const { SettingsService } = await import('./settings.service');
    const service = new SettingsService();
    service.update({ autoScanProjects: false, githubToken: 'ghp_test' });

    const content = JSON.parse(fs.readFileSync(path.join(appDataDir, 'settings.json'), 'utf-8'));
    expect(content.autoScanProjects).toBe(false);
    expect(content.githubToken).toBe('ghp_test');
  });
});
