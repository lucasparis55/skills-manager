import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

var appDataDir = '';

vi.mock('../utils/paths', () => ({
  getAppDataDir: () => appDataDir || path.join(os.tmpdir(), 'settings-service-default'),
}));

describe('SettingsService', () => {
  const createSecureTokenMock = (initialToken = '') => {
    let token = initialToken;
    return {
      getGithubToken: vi.fn(async () => token),
      setGithubToken: vi.fn(async (nextToken: string) => {
        token = nextToken;
      }),
      clearGithubToken: vi.fn(async () => {
        token = '';
      }),
    };
  };

  beforeEach(() => {
    vi.resetModules();
    appDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-service-'));
  });

  afterEach(() => {
    fs.rmSync(appDataDir, { recursive: true, force: true });
  });

  it('loads defaults and creates settings directory when missing', async () => {
    const { SettingsService } = await import('./settings.service');
    const service = new SettingsService(createSecureTokenMock() as any);
    const settings = service.get();

    expect(settings.centralSkillsRoot).toContain('skills');
    expect(settings.symlinkStrategy).toBe('auto');
    expect(settings.theme).toBe('dark');
    expect(settings.autoScanProjects).toBe(true);
  });

  it('merges persisted settings with defaults', async () => {
    const { SettingsService } = await import('./settings.service');
    const secureTokenMock = createSecureTokenMock();
    const persisted = {
      theme: 'light',
      symlinkStrategy: 'junction',
    };
    fs.writeFileSync(path.join(appDataDir, 'settings.json'), JSON.stringify(persisted), 'utf-8');

    const service = new SettingsService(secureTokenMock as any);
    const settings = service.get();

    expect(settings.theme).toBe('light');
    expect(settings.symlinkStrategy).toBe('junction');
    expect(settings.autoScanProjects).toBe(true);
  });

  it('migrates legacy plaintext github token and removes it from settings.json', async () => {
    const { SettingsService } = await import('./settings.service');
    const secureTokenMock = createSecureTokenMock();
    fs.writeFileSync(
      path.join(appDataDir, 'settings.json'),
      JSON.stringify({
        theme: 'light',
        githubToken: 'ghp_legacy_token',
      }),
      'utf-8',
    );

    const service = new SettingsService(secureTokenMock as any);
    expect(Object.prototype.hasOwnProperty.call(service.get(), 'githubToken')).toBe(false);

    const persistedAfterLoad = JSON.parse(
      fs.readFileSync(path.join(appDataDir, 'settings.json'), 'utf-8'),
    );
    expect(persistedAfterLoad.githubToken).toBeUndefined();

    expect(await service.hasGithubToken()).toBe(true);
    expect(await service.getGithubToken()).toBe('ghp_legacy_token');
    expect(secureTokenMock.setGithubToken).toHaveBeenCalledWith('ghp_legacy_token');
  });

  it('falls back to defaults for invalid JSON file', async () => {
    const { SettingsService } = await import('./settings.service');
    const secureTokenMock = createSecureTokenMock();
    fs.writeFileSync(path.join(appDataDir, 'settings.json'), '{bad json', 'utf-8');

    const service = new SettingsService(secureTokenMock as any);
    const settings = service.get();

    expect(settings.theme).toBe('dark');
    expect(settings.centralSkillsRoot).toContain('skills');
  });

  it('persists non-sensitive updates to disk and never writes githubToken', async () => {
    const { SettingsService } = await import('./settings.service');
    const secureTokenMock = createSecureTokenMock();
    const service = new SettingsService(secureTokenMock as any);
    service.update({ autoScanProjects: false } as any);
    service.update({ githubToken: 'ghp_plaintext_should_not_persist' } as any);

    const content = JSON.parse(fs.readFileSync(path.join(appDataDir, 'settings.json'), 'utf-8'));
    expect(content.autoScanProjects).toBe(false);
    expect(content.githubToken).toBeUndefined();
    expect(content.hasGithubToken).toBeUndefined();
  });

  it('exposes renderer-safe settings payload with hasGithubToken', async () => {
    const { SettingsService } = await import('./settings.service');
    const secureTokenMock = createSecureTokenMock('ghp_secure');
    const service = new SettingsService(secureTokenMock as any);

    const publicSettings = await service.getPublicSettings();
    expect(publicSettings.hasGithubToken).toBe(true);
    expect((publicSettings as any).githubToken).toBeUndefined();
  });

  it('sets and clears github token through secure token service', async () => {
    const { SettingsService } = await import('./settings.service');
    const secureTokenMock = createSecureTokenMock();
    const service = new SettingsService(secureTokenMock as any);

    await service.setGithubToken('ghp_secure_token');
    expect(secureTokenMock.setGithubToken).toHaveBeenCalledWith('ghp_secure_token');
    expect(await service.hasGithubToken()).toBe(true);

    await service.clearGithubToken();
    expect(secureTokenMock.clearGithubToken).toHaveBeenCalledTimes(1);
    expect(await service.hasGithubToken()).toBe(false);
  });
});
