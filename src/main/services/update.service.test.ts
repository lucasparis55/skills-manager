import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateService, isVersionGreaterThan } from './update.service';

describe('isVersionGreaterThan', () => {
  it('returns true when latest is greater', () => {
    expect(isVersionGreaterThan('v1.0.2', '1.0.1')).toBe(true);
    expect(isVersionGreaterThan('1.1.0', '1.0.5')).toBe(true);
    expect(isVersionGreaterThan('2.0.0', '1.9.9')).toBe(true);
  });

  it('returns false when latest is equal', () => {
    expect(isVersionGreaterThan('v1.0.1', '1.0.1')).toBe(false);
    expect(isVersionGreaterThan('1.0.1', 'v1.0.1')).toBe(false);
  });

  it('returns false when latest is lower', () => {
    expect(isVersionGreaterThan('1.0.1', '1.0.2')).toBe(false);
    expect(isVersionGreaterThan('1.0.0', '1.0.1')).toBe(false);
  });

  it('handles different segment lengths', () => {
    expect(isVersionGreaterThan('1.0.1', '1.0.0')).toBe(true);
    expect(isVersionGreaterThan('1.0', '1.0.1')).toBe(false);
    expect(isVersionGreaterThan('1.0.1', '1.0')).toBe(true);
  });

  it('handles prerelease versions per SemVer-lite rules', () => {
    expect(isVersionGreaterThan('1.0.1', '1.0.0')).toBe(true);
    expect(isVersionGreaterThan('1.0.0', '1.0.0')).toBe(false);
    expect(isVersionGreaterThan('1.0.0', '1.0.0-beta')).toBe(true);
    expect(isVersionGreaterThan('1.0.0-beta', '1.0.0')).toBe(false);
    expect(isVersionGreaterThan('2.0.0-beta', '1.9.9')).toBe(true);
  });
});

describe('UpdateService', () => {
  const createMockFetch = (response: { ok: boolean; status: number; json: () => Promise<unknown> }) =>
    vi.fn().mockResolvedValue(response);

  const createMockAutoUpdater = () => {
    const listeners = new Map<string, (...args: any[]) => void>();
    const autoUpdater = {
      setFeedURL: vi.fn(),
      checkForUpdates: vi.fn(),
      quitAndInstall: vi.fn(),
      on: vi.fn((event: string, listener: (...args: any[]) => void) => {
        listeners.set(event, listener);
        return autoUpdater;
      }),
      removeListener: vi.fn((event: string, listener: (...args: any[]) => void) => {
        if (listeners.get(event) === listener) {
          listeners.delete(event);
        }
        return autoUpdater;
      }),
      emit: (event: string, ...args: any[]) => {
        listeners.get(event)?.(...args);
      },
    };

    return autoUpdater;
  };

  const createService = (overrides: Partial<ConstructorParameters<typeof UpdateService>[0]> = {}) =>
    new UpdateService({
      isPackaged: true,
      platform: 'win32',
      currentVersion: '1.0.1',
      fetch: createMockFetch({ ok: true, status: 200, json: async () => ({}) }),
      autoUpdater: createMockAutoUpdater(),
      shell: { openExternal: vi.fn().mockResolvedValue(undefined) },
      log: { error: vi.fn() },
      ...overrides,
    });

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it('returns no update in dev mode', async () => {
    const service = createService({ isPackaged: false });
    const result = await service.checkForUpdates();

    expect(result.hasUpdate).toBe(false);
    expect(result.currentVersion).toBe('1.0.1');
  });

  it('detects update when latest is greater', async () => {
    const fetchMock = createMockFetch({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: 'v1.0.2',
        html_url: 'https://github.com/lucasparis55/skills-manager/releases/tag/v1.0.2',
        body: 'Release notes',
        published_at: '2025-01-01T00:00:00Z',
      }),
    });

    const service = createService({ fetch: fetchMock });
    const result = await service.checkForUpdates();

    expect(result.hasUpdate).toBe(true);
    expect(result.latestVersion).toBe('v1.0.2');
    expect(result.releaseUrl).toBe('https://github.com/lucasparis55/skills-manager/releases/tag/v1.0.2');
    expect(result.releaseNotes).toBe('Release notes');
    expect(result.publishedAt).toBe('2025-01-01T00:00:00Z');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/lucasparis55/skills-manager/releases/latest',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/vnd.github.v3+json',
        }),
      }),
    );
  });

  it('returns no update when versions are equal', async () => {
    const fetchMock = createMockFetch({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: 'v1.0.1',
        html_url: 'https://github.com/lucasparis55/skills-manager/releases/tag/v1.0.1',
        body: null,
        published_at: null,
      }),
    });

    const service = createService({ fetch: fetchMock });
    const result = await service.checkForUpdates();

    expect(result.hasUpdate).toBe(false);
    expect(result.latestVersion).toBe('v1.0.1');
  });

  it('returns no update when API fails', async () => {
    const logError = vi.fn();
    const fetchMock = createMockFetch({ ok: false, status: 403, json: async () => ({}) });
    const service = createService({ fetch: fetchMock, log: { error: logError } });

    const result = await service.checkForUpdates();

    expect(result.hasUpdate).toBe(false);
    expect(result.latestVersion).toBeNull();
    expect(logError).toHaveBeenCalled();
  });

  it('returns no update when fetch throws', async () => {
    const logError = vi.fn();
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
    const service = createService({ fetch: fetchMock, log: { error: logError } });

    const result = await service.checkForUpdates();

    expect(result.hasUpdate).toBe(false);
    expect(logError).toHaveBeenCalled();
  });

  it('caches result for 30 minutes', async () => {
    const fetchMock = createMockFetch({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: 'v1.0.2',
        html_url: 'https://example.com',
        body: null,
        published_at: null,
      }),
    });

    const service = createService({ fetch: fetchMock });

    await service.checkForUpdates();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await service.checkForUpdates();
    expect(fetchMock).toHaveBeenCalledTimes(1); // cached

    vi.advanceTimersByTime(31 * 60 * 1000); // 31 minutes

    await service.checkForUpdates();
    expect(fetchMock).toHaveBeenCalledTimes(2); // cache expired
  });

  it('opens release page with correct URL', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const service = createService({ shell: { openExternal } });

    await service.openReleasePage('v1.0.2');
    expect(openExternal).toHaveBeenCalledWith(
      'https://github.com/lucasparis55/skills-manager/releases/tag/v1.0.2',
    );
  });

  it('downloads from the versioned GitHub feed and restarts after the update is downloaded', async () => {
    const autoUpdater = createMockAutoUpdater();
    const fetchMock = createMockFetch({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: 'v1.0.2',
        html_url: 'https://github.com/lucasparis55/skills-manager/releases/tag/v1.0.2',
        body: 'Release notes',
        published_at: '2025-01-01T00:00:00Z',
      }),
    });
    const service = createService({ fetch: fetchMock, autoUpdater });
    const statuses: string[] = [];

    await service.checkForUpdates();
    const updatePromise = service.downloadAndInstall((status) => statuses.push(status));

    expect(autoUpdater.setFeedURL).toHaveBeenCalledWith({
      url: 'https://github.com/lucasparis55/skills-manager/releases/download/v1.0.2',
    });
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);

    autoUpdater.emit('update-downloaded');
    await updatePromise;

    expect(statuses).toEqual(['downloading', 'installing']);
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('keeps the current app running when the updater reports an error', async () => {
    const autoUpdater = createMockAutoUpdater();
    const fetchMock = createMockFetch({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: 'v1.0.2',
        html_url: 'https://github.com/lucasparis55/skills-manager/releases/tag/v1.0.2',
        body: null,
        published_at: null,
      }),
    });
    const service = createService({ fetch: fetchMock, autoUpdater });

    await service.checkForUpdates();
    const updatePromise = service.downloadAndInstall();
    autoUpdater.emit('error', new Error('Feed unavailable'));

    await expect(updatePromise).rejects.toThrow('Feed unavailable');
    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });

  it('reports a restart failure without leaving the update operation pending', async () => {
    const autoUpdater = createMockAutoUpdater();
    autoUpdater.quitAndInstall.mockImplementation(() => {
      throw new Error('Restart failed');
    });
    const fetchMock = createMockFetch({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: 'v1.0.2',
        html_url: 'https://github.com/lucasparis55/skills-manager/releases/tag/v1.0.2',
        body: null,
        published_at: null,
      }),
    });
    const service = createService({ fetch: fetchMock, autoUpdater });

    await service.checkForUpdates();
    const updatePromise = service.downloadAndInstall();
    autoUpdater.emit('update-downloaded');

    await expect(updatePromise).rejects.toThrow('Restart failed');
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('does not start a second updater operation while one is active', async () => {
    const autoUpdater = createMockAutoUpdater();
    const fetchMock = createMockFetch({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: 'v1.0.2',
        html_url: 'https://github.com/lucasparis55/skills-manager/releases/tag/v1.0.2',
        body: null,
        published_at: null,
      }),
    });
    const service = createService({ fetch: fetchMock, autoUpdater });

    await service.checkForUpdates();
    const firstUpdate = service.downloadAndInstall();
    const secondUpdate = service.downloadAndInstall();

    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);

    autoUpdater.emit('update-downloaded');
    await Promise.all([firstUpdate, secondUpdate]);

    expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  it('ignores updates on unsupported platforms', async () => {
    const autoUpdater = createMockAutoUpdater();
    const fetchMock = createMockFetch({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: 'v1.0.2',
        html_url: 'https://github.com/lucasparis55/skills-manager/releases/tag/v1.0.2',
        body: null,
        published_at: null,
      }),
    });
    const service = createService({ fetch: fetchMock, autoUpdater, platform: 'darwin' });

    const result = await service.checkForUpdates();

    expect(result.hasUpdate).toBe(false);
    await expect(service.downloadAndInstall()).rejects.toThrow(/Windows/);
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('rejects a release tag that cannot be used to build a feed URL', async () => {
    const logError = vi.fn();
    const fetchMock = createMockFetch({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: 'latest/../../setup.exe',
        html_url: 'https://github.com/lucasparis55/skills-manager/releases/tag/latest',
        body: null,
        published_at: null,
      }),
    });
    const service = createService({ fetch: fetchMock, log: { error: logError } });

    const result = await service.checkForUpdates();

    expect(result.hasUpdate).toBe(false);
    expect(logError).toHaveBeenCalled();
  });
});
