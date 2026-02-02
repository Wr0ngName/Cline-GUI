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
        // Runtime provided by Electron
        'electron',
        // Native modules - MUST be external
        'node-pty',
        '@anthropic-ai/claude-code', // has native ripgrep.node
      ],
    },
  },
});
