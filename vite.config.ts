import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'src/main/index.ts',
        vite: {
          build: {
            outDir: 'dist/main',
            ssr: true,
            rollupOptions: {
              external: [
                'electron',
                'electron-store',
                '@anthropic-ai/sdk',
                'openai',
                'uuid',
                'fs',
                'path',
                'child_process',
                'util',
                'events',
                'crypto',
                'os',
                'stream',
                'net',
                'tls',
                'http',
                'https',
              ],
            },
          },
        },
      },
      {
        entry: 'src/main/preload.ts',
        onstart(args) {
          args.reload();
        },
        vite: {
          build: {
            outDir: 'dist/main',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    ]),
  ],
  root: '.',
  base: './',
  build: {
    outDir: 'dist/renderer',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  server: {
    port: 5173,
  },
});
