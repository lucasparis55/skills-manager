import { getConfig as getForgeRendererConfig } from '@electron-forge/plugin-vite/dist/config/vite.renderer.config';
import react from '@vitejs/plugin-react';
import packageJson from '../../package.json';
import path from 'path';
import { defineConfig, mergeConfig } from 'vite';
import type { UserConfig } from 'vite';

const sharedConfig: UserConfig = {
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  plugins: [react()],
  root: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, '../../.vite/renderer/main_window'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
};

const manualBuildConfig: UserConfig = {
  base: './',
};

export default defineConfig((env) => {
  if ('forgeConfigSelf' in env) {
    return getForgeRendererConfig(env as Parameters<typeof getForgeRendererConfig>[0], sharedConfig);
  }

  return mergeConfig(manualBuildConfig, sharedConfig);
});
