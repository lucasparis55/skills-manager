import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  define: {
    // Define Forge globals as undefined for production builds
    MAIN_WINDOW_VITE_DEV_SERVER_URL: 'undefined',
    MAIN_WINDOW_VITE_NAME: '"main_window"',
  },
  build: {
    outDir: path.resolve(__dirname, '../../.vite/build'),
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, '../main/index.ts'),
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      external: [
        'electron',
        'fs',
        'path',
        'os',
        'child_process',
        'https',
        'node:https',
        'crypto',
        'node:crypto',
        'keytar',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../main'),
    },
  },
});
