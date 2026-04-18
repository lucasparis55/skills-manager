import { external as forgeExternal } from '@electron-forge/plugin-vite/dist/config/vite.base.config';
import { getConfig as getForgeMainConfig } from '@electron-forge/plugin-vite/dist/config/vite.main.config';
import path from 'path';
import { defineConfig, mergeConfig } from 'vite';
import type { UserConfig } from 'vite';

const sharedConfig: UserConfig = {
  build: {
    lib: {
      entry: path.resolve(__dirname, 'index.ts'),
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      external: [...forgeExternal, 'electron/main', 'keytar'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../main'),
    },
  },
};

const manualBuildConfig: UserConfig = {
  define: {
    MAIN_WINDOW_VITE_DEV_SERVER_URL: 'undefined',
    MAIN_WINDOW_VITE_NAME: '"main_window"',
  },
  build: {
    outDir: path.resolve(__dirname, '../../.vite/build'),
    emptyOutDir: false,
  },
};

export default defineConfig((env) => {
  if ('forgeConfigSelf' in env) {
    return getForgeMainConfig(env as Parameters<typeof getForgeMainConfig>[0], sharedConfig);
  }

  return mergeConfig(manualBuildConfig, sharedConfig);
});
