import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

// PORT is only needed for the dev/preview server — default to 3000 during
// production `vite build` so the build step doesn't throw.
const port = Number(process.env.PORT ?? '3000');

// BASE_PATH defaults to /app-store/ on Replit — Replit injects the real value at runtime.
// CF_PAGES=1 is auto-injected by Cloudflare Pages — always use '/' there regardless
// of any BASE_PATH env var that may have been set in the CF Pages dashboard.
const basePath = process.env.CF_PAGES ? '/' : (process.env.BASE_PATH ?? '/app-store/');

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  // Expose CF_PAGES flag to runtime code (CF_PAGES=1 is auto-injected by Cloudflare).
  define: {
    __CF_PAGES__: JSON.stringify(!!process.env.CF_PAGES),
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-clerk': ['@clerk/react'],
          'vendor-motion': ['framer-motion'],
          'vendor-query': ['@tanstack/react-query'],
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
