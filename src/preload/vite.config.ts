import { external as forgeExternal } from '@electron-forge/plugin-vite/dist/config/vite.base.config';
import { getConfig as getForgePreloadConfig } from '@electron-forge/plugin-vite/dist/config/vite.preload.config';
import path from 'path';
import { defineConfig, mergeConfig } from 'vite';
import type { UserConfig } from 'vite';

const sharedConfig: UserConfig = {
  build: {
    rollupOptions: {
      external: [...forgeExternal, 'electron/renderer'],
      input: path.resolve(__dirname, 'index.ts'),
      output: {
        format: 'cjs',
        inlineDynamicImports: true,
        entryFileNames: 'preload.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
};

const manualBuildConfig: UserConfig = {
  build: {
    outDir: path.resolve(__dirname, '../../.vite/build'),
    emptyOutDir: false,
  },
};

export default defineConfig((env) => {
  if ('forgeConfigSelf' in env) {
    return getForgePreloadConfig(env as Parameters<typeof getForgePreloadConfig>[0], sharedConfig);
  }

  return mergeConfig(manualBuildConfig, sharedConfig);
});
