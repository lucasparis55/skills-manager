import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  UpdateService,
  isVersionGreaterThan,
  resolveLauncherExecutable,
  resolveUpdateExecutable,
  type UpdateOperationProgress,
} from './update.service';

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

describe('Squirrel executable paths', () => {
  const appExecutable = 'C:\\Users\\Lucas\\AppData\\Local\\Skills Manager\\app-1.0.1\\Skills Manager.exe';

  it('resolves Update.exe and the launcher beside the versioned app directory', () => {
    expect(resolveUpdateExecutable(appExecutable)).toBe(
      'C:\\Users\\Lucas\\AppData\\Local\\Skills Manager\\Update.exe',
    );
    expect(resolveLauncherExecutable(appExecutable)).toBe(
      'C:\\Users\\Lucas\\AppData\\Local\\Skills Manager\\Skills Manager.exe',
    );
  });
});

describe('UpdateService', () => {
  const createMockFetch = (response: { ok: boolean; status: number; json: () => Promise<unknown> }) =>
    vi.fn().mockResolvedValue(response);

  const createMockUpdateProcess = () => {
    const listeners = new Map<string, (...args: any[]) => void>();
    const stdoutListeners: Array<(chunk: Buffer | string) => void> = [];
    const stderrListeners: Array<(chunk: Buffer | string) => void> = [];
    const stdout = {
      on: vi.fn((event: string, listener: (chunk: Buffer | string) => void) => {
        if (event === 'data') stdoutListeners.push(listener);
        return stdout;
      }),
    };
    const stderr = {
      on: vi.fn((event: string, listener: (chunk: Buffer | string) => void) => {
        if (event === 'data') stderrListeners.push(listener);
        return stderr;
      }),
    };
    const updateProcess = {
      stdout,
      stderr,
      once: vi.fn((event: string, listener: (...args: any[]) => void) => {
        listeners.set(event, listener);
        return updateProcess;
      }),
    };

    return {
      updateProcess,
      emitStdout: (chunk: Buffer | string) => stdoutListeners.forEach((listener) => listener(chunk)),
      emitStderr: (chunk: Buffer | string) => stderrListeners.forEach((listener) => listener(chunk)),
      emitError: (error: Error) => listeners.get('error')?.(error),
      emitClose: (code: number | null, signal: NodeJS.Signals | null = null) => listeners.get('close')?.(code, signal),
    };
  };

  const createService = (overrides: Partial<ConstructorParameters<typeof UpdateService>[0]> = {}) =>
    new UpdateService({
      isPackaged: true,
      platform: 'win32',
      currentVersion: '1.0.1',
      fetch: createMockFetch({ ok: true, status: 200, json: async () => ({}) }),
      updateExecutable: 'C:\\Skills Manager\\Update.exe',
      launcherExecutable: 'C:\\Skills Manager\\Skills Manager.exe',
      spawnUpdate: vi.fn(() => createMockUpdateProcess().updateProcess),
      relaunch: vi.fn(),
      quit: vi.fn(),
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

  it('executes Update.exe, forwards real progress, and relaunches the Squirrel launcher', async () => {
    const process = createMockUpdateProcess();
    const spawnUpdate = vi.fn(() => process.updateProcess);
    const relaunch = vi.fn();
    const quit = vi.fn();
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
    const service = createService({ fetch: fetchMock, spawnUpdate, relaunch, quit });
    const progress: UpdateOperationProgress[] = [];

    await service.checkForUpdates();
    const updatePromise = service.downloadAndInstall((nextProgress) => progress.push(nextProgress));

    expect(spawnUpdate).toHaveBeenCalledWith(
      'C:\\Skills Manager\\Update.exe',
      ['--update', 'https://github.com/lucasparis55/skills-manager/releases/download/v1.0.2'],
    );
    expect(progress).toEqual([{ stage: 'downloading', percent: 0 }]);

    process.emitStdout('1\r\n29');
    process.emitStdout('\r\n30\r\n100\r\n');
    process.emitClose(0);
    await updatePromise;

    expect(progress).toEqual([
      { stage: 'downloading', percent: 0 },
      { stage: 'downloading', percent: 1 },
      { stage: 'downloading', percent: 29 },
      { stage: 'installing', percent: 30 },
      { stage: 'installing', percent: 100 },
    ]);
    expect(relaunch).toHaveBeenCalledWith({ execPath: 'C:\\Skills Manager\\Skills Manager.exe' });
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it('keeps the current app running when Update.exe exits with an error', async () => {
    const process = createMockUpdateProcess();
    const spawnUpdate = vi.fn(() => process.updateProcess);
    const relaunch = vi.fn();
    const quit = vi.fn();
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
    const service = createService({ fetch: fetchMock, spawnUpdate, relaunch, quit });

    await service.checkForUpdates();
    const updatePromise = service.downloadAndInstall();
    process.emitStderr('Feed unavailable');
    process.emitClose(1);

    await expect(updatePromise).rejects.toThrow('Feed unavailable');
    expect(relaunch).not.toHaveBeenCalled();
    expect(quit).not.toHaveBeenCalled();
  });

  it('ignores invalid and backwards progress lines', async () => {
    const process = createMockUpdateProcess();
    const spawnUpdate = vi.fn(() => process.updateProcess);
    const relaunch = vi.fn();
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
    const service = createService({ fetch: fetchMock, spawnUpdate, relaunch });
    const progress: UpdateOperationProgress[] = [];

    await service.checkForUpdates();
    const updatePromise = service.downloadAndInstall((nextProgress) => progress.push(nextProgress));
    process.emitStdout('starting\n20\n15\n101\n+30\n0x50\n40\n');
    process.emitClose(0);
    await updatePromise;

    expect(progress).toEqual([
      { stage: 'downloading', percent: 0 },
      { stage: 'downloading', percent: 20 },
      { stage: 'installing', percent: 40 },
      { stage: 'installing', percent: 100 },
    ]);
  });

  it('reports a relaunch failure without leaving the update operation pending', async () => {
    const process = createMockUpdateProcess();
    const spawnUpdate = vi.fn(() => process.updateProcess);
    const relaunch = vi.fn(() => {
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
    const service = createService({ fetch: fetchMock, spawnUpdate, relaunch });

    await service.checkForUpdates();
    const updatePromise = service.downloadAndInstall();
    process.emitClose(0);

    await expect(updatePromise).rejects.toThrow('Restart failed');
    expect(relaunch).toHaveBeenCalledTimes(1);
  });

  it('does not start a second updater operation while one is active', async () => {
    const process = createMockUpdateProcess();
    const spawnUpdate = vi.fn(() => process.updateProcess);
    const relaunch = vi.fn();
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
    const service = createService({ fetch: fetchMock, spawnUpdate, relaunch });

    await service.checkForUpdates();
    const firstUpdate = service.downloadAndInstall();
    const secondUpdate = service.downloadAndInstall();

    expect(spawnUpdate).toHaveBeenCalledTimes(1);

    process.emitClose(0);
    await Promise.all([firstUpdate, secondUpdate]);

    expect(relaunch).toHaveBeenCalledTimes(1);
  });

  it('ignores updates on unsupported platforms', async () => {
    const spawnUpdate = vi.fn();
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
    const service = createService({ fetch: fetchMock, spawnUpdate, platform: 'darwin' });

    const result = await service.checkForUpdates();

    expect(result.hasUpdate).toBe(false);
    await expect(service.downloadAndInstall()).rejects.toThrow(/Windows/);
    expect(spawnUpdate).not.toHaveBeenCalled();
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
