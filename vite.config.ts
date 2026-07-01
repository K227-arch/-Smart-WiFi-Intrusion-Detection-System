import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: [
          '**/data/**',
          '**/.vscode/**',
          '**/node_modules/**',
          '**/*.json',          // data files, lock files etc
          '**/models/**',       // ONNX binaries
          '**/.git/**',
        ],
      },
    },
  };
});
