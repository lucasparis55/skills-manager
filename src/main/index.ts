import { app, BrowserWindow, ipcMain } from 'electron';
import electronSquirrelStartup from 'electron-squirrel-startup';
import path from 'path';
import { registerIPCHandlers } from './ipc/handlers';

// Declare Forge global variables (injected by @electron-forge/plugin-vite in dev mode)
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string | undefined;

// Handle creating/removing shortcuts on windows when installing/uninstalling.
if (electronSquirrelStartup) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

const createWindow = (): void => {
  // Determine preload path based on environment
  // When built with Vite, both main.js and preload.js are in .vite/build/
  // In dev mode with Forge, they're also in the same output directory
  const preloadPath = path.join(__dirname, 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f172a',
    show: false,
  });

  if (app.isPackaged) {
    mainWindow.setMenu(null);
  }

  // Load the dev server or built HTML
  const isDev = MAIN_WINDOW_VITE_DEV_SERVER_URL !== undefined;
  const shouldOpenDevTools = isDev || !app.isPackaged;
  
  if (isDev) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL!);
    if (shouldOpenDevTools) {
      mainWindow.webContents.openDevTools();
    }
  } else {
    // Production: try multiple possible paths for the renderer
    const fs = require('fs');
    const baseRendererPath = path.join(__dirname, '../renderer');
    
    console.log('Production mode - attempting to load renderer from:', baseRendererPath);
    
    // Try with window name first (Forge style)
    let rendererPath = path.join(baseRendererPath, MAIN_WINDOW_VITE_NAME || 'main_window', 'index.html');
    console.log('Trying renderer path:', rendererPath);
    console.log('Path exists:', fs.existsSync(rendererPath));
    
    // Fall back to direct path if that doesn't exist
    if (!fs.existsSync(rendererPath)) {
      rendererPath = path.join(baseRendererPath, 'index.html');
      console.log('Fallback renderer path:', rendererPath);
      console.log('Path exists:', fs.existsSync(rendererPath));
    }
    
    if (!fs.existsSync(rendererPath)) {
      console.error('CRITICAL: Renderer HTML file not found!');
      console.error('Tried paths:', [
        path.join(baseRendererPath, MAIN_WINDOW_VITE_NAME || 'main_window', 'index.html'),
        path.join(baseRendererPath, 'index.html')
      ]);
      return;
    }
    
    console.log('Loading renderer from:', rendererPath);
    mainWindow.loadFile(rendererPath);
    if (shouldOpenDevTools) {
      mainWindow.webContents.openDevTools();
    }
  }

  // Log any renderer errors
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer ${level}] ${message} (at ${sourceId}:${line})`);
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  // Log when resources fail to load
  mainWindow.webContents.session.webRequest.onCompleted((details) => {
    if (details.statusCode >= 400) {
      console.error('Resource failed to load:', details.url, 'Status:', details.statusCode);
    }
  });

  mainWindow.webContents.session.webRequest.onErrorOccurred((details) => {
    console.error('Resource error:', details.url, 'Error:', details.error);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.whenReady().then(() => {
  // Register all IPC handlers
  registerIPCHandlers();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
