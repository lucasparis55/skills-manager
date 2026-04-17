import { afterEach, describe, expect, it, vi } from 'vitest';

describe('main bootstrap', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates window in dev mode and loads Vite URL', async () => {
    const registerIPCHandlers = vi.fn();
    const windowInstance = {
      loadURL: vi.fn(),
      loadFile: vi.fn(),
      show: vi.fn(),
      once: vi.fn((event: string, cb: () => void) => {
        if (event === 'ready-to-show') cb();
      }),
      on: vi.fn(),
      webContents: {
        openDevTools: vi.fn(),
        on: vi.fn(),
        session: {
          webRequest: {
            onCompleted: vi.fn(),
            onErrorOccurred: vi.fn(),
          },
        },
      },
    };

    const BrowserWindow = vi.fn(function BrowserWindowMock() {
      return windowInstance as any;
    }) as any;
    (BrowserWindow as any).getAllWindows = vi.fn(() => []);

    const app = {
      whenReady: vi.fn(() => Promise.resolve()),
      on: vi.fn(),
      quit: vi.fn(),
    };

    vi.doMock('electron', () => ({
      app,
      BrowserWindow,
      ipcMain: { handle: vi.fn() },
    }));
    vi.doMock('electron-squirrel-startup', () => false);
    vi.doMock('./ipc/handlers', () => ({ registerIPCHandlers }));

    vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', 'http://localhost:5173');
    vi.stubGlobal('MAIN_WINDOW_VITE_NAME', 'main_window');

    await import('./index');
    await Promise.resolve();

    expect(registerIPCHandlers).toHaveBeenCalledTimes(1);
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    expect(windowInstance.loadURL).toHaveBeenCalledWith('http://localhost:5173');
    expect(windowInstance.webContents.openDevTools).toHaveBeenCalled();
  });

  it('loads renderer file in production mode when html exists', async () => {
    const registerIPCHandlers = vi.fn();
    const windowInstance = {
      loadURL: vi.fn(),
      loadFile: vi.fn(),
      show: vi.fn(),
      once: vi.fn(),
      on: vi.fn(),
      webContents: {
        openDevTools: vi.fn(),
        on: vi.fn(),
        session: {
          webRequest: {
            onCompleted: vi.fn(),
            onErrorOccurred: vi.fn(),
          },
        },
      },
    };

    const BrowserWindow = vi.fn(function BrowserWindowMock() {
      return windowInstance as any;
    }) as any;
    (BrowserWindow as any).getAllWindows = vi.fn(() => []);

    const app = {
      whenReady: vi.fn(() => Promise.resolve()),
      on: vi.fn(),
      quit: vi.fn(),
    };

    vi.doMock('electron', () => ({
      app,
      BrowserWindow,
      ipcMain: { handle: vi.fn() },
    }));
    vi.doMock('electron-squirrel-startup', () => false);
    vi.doMock('./ipc/handlers', () => ({ registerIPCHandlers }));
    vi.doMock('fs', () => ({
      existsSync: vi.fn((candidate: string) => candidate.includes('main_window') && candidate.includes('index.html')),
    }));

    vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', undefined);
    vi.stubGlobal('MAIN_WINDOW_VITE_NAME', 'main_window');

    await import('./index');
    await Promise.resolve();

    expect(windowInstance.loadFile).toHaveBeenCalledTimes(1);
    expect(windowInstance.webContents.openDevTools).toHaveBeenCalled();
  });

  it('falls back to root renderer index.html in production', async () => {
    const registerIPCHandlers = vi.fn();
    const windowInstance = {
      loadURL: vi.fn(),
      loadFile: vi.fn(),
      show: vi.fn(),
      once: vi.fn(),
      on: vi.fn(),
      webContents: {
        openDevTools: vi.fn(),
        on: vi.fn(),
        session: {
          webRequest: {
            onCompleted: vi.fn(),
            onErrorOccurred: vi.fn(),
          },
        },
      },
    };

    const BrowserWindow = vi.fn(function BrowserWindowMock() {
      return windowInstance as any;
    }) as any;
    (BrowserWindow as any).getAllWindows = vi.fn(() => []);

    const app = {
      whenReady: vi.fn(() => Promise.resolve()),
      on: vi.fn(),
      quit: vi.fn(),
    };

    vi.doMock('electron', () => ({
      app,
      BrowserWindow,
      ipcMain: { handle: vi.fn() },
    }));
    vi.doMock('electron-squirrel-startup', () => false);
    vi.doMock('./ipc/handlers', () => ({ registerIPCHandlers }));
    vi.doMock('fs', () => ({
      existsSync: vi.fn((candidate: string) => !candidate.includes('main_window') && candidate.includes('index.html')),
    }));

    vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', undefined);
    vi.stubGlobal('MAIN_WINDOW_VITE_NAME', 'main_window');

    await import('./index');
    await Promise.resolve();

    expect(windowInstance.loadFile).toHaveBeenCalledTimes(1);
  });

  it('quits app on non-darwin when all windows close', async () => {
    const registerIPCHandlers = vi.fn();
    const appHandlers: Record<string, Function> = {};
    const app = {
      whenReady: vi.fn(() => Promise.resolve()),
      on: vi.fn((event: string, handler: Function) => {
        appHandlers[event] = handler;
      }),
      quit: vi.fn(),
    };
    const windowInstance = {
      loadURL: vi.fn(),
      loadFile: vi.fn(),
      show: vi.fn(),
      once: vi.fn(),
      on: vi.fn(),
      webContents: {
        openDevTools: vi.fn(),
        on: vi.fn(),
        session: {
          webRequest: {
            onCompleted: vi.fn(),
            onErrorOccurred: vi.fn(),
          },
        },
      },
    };
    const BrowserWindow = vi.fn(function BrowserWindowMock() {
      return windowInstance as any;
    }) as any;
    (BrowserWindow as any).getAllWindows = vi.fn(() => []);

    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    vi.doMock('electron', () => ({
      app,
      BrowserWindow,
      ipcMain: { handle: vi.fn() },
    }));
    vi.doMock('electron-squirrel-startup', () => false);
    vi.doMock('./ipc/handlers', () => ({ registerIPCHandlers }));
    vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', 'http://localhost:5173');

    await import('./index');
    await Promise.resolve();

    appHandlers['window-all-closed']();
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    expect(app.quit).toHaveBeenCalledTimes(1);
  });

  it('creates a window on activate when no windows are open', async () => {
    const registerIPCHandlers = vi.fn();
    const appHandlers: Record<string, Function> = {};
    const app = {
      whenReady: vi.fn(() => Promise.resolve()),
      on: vi.fn((event: string, handler: Function) => {
        appHandlers[event] = handler;
      }),
      quit: vi.fn(),
    };
    const windowInstance = {
      loadURL: vi.fn(),
      loadFile: vi.fn(),
      show: vi.fn(),
      once: vi.fn(),
      on: vi.fn(),
      webContents: {
        openDevTools: vi.fn(),
        on: vi.fn(),
        session: {
          webRequest: {
            onCompleted: vi.fn(),
            onErrorOccurred: vi.fn(),
          },
        },
      },
    };
    const BrowserWindow = vi.fn(function BrowserWindowMock() {
      return windowInstance as any;
    }) as any;
    (BrowserWindow as any).getAllWindows = vi.fn(() => []);

    vi.doMock('electron', () => ({
      app,
      BrowserWindow,
      ipcMain: { handle: vi.fn() },
    }));
    vi.doMock('electron-squirrel-startup', () => false);
    vi.doMock('./ipc/handlers', () => ({ registerIPCHandlers }));
    vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', 'http://localhost:5173');

    await import('./index');
    await Promise.resolve();
    expect(BrowserWindow).toHaveBeenCalledTimes(1);

    appHandlers.activate();
    expect(BrowserWindow).toHaveBeenCalledTimes(2);
  });
});
