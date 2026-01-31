import { defineConfig } from 'vite';
import path from 'node:path';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
  build: {
    rollupOptions: {
      external: [
        'electron',
        'electron-log',
        'electron-store',
        'electron-updater',
        '@anthropic-ai/claude-code',
        '@anthropic-ai/sdk',
      ],
    },
  },
});
