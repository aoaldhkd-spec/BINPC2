import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { viteDevAdminSession } from './vite-dev-admin-session';

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 3000;
if (rawPort && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// BASE_PATH defaults to '/' when not set (safe for production builds).
const basePath = process.env.BASE_PATH ?? '/';

// Local UI preview: proxy /api to Render unless LOCAL_API=1 or API_PROXY_TARGET is set.
const apiProxyTarget =
  process.env.API_PROXY_TARGET
  ?? (process.env.LOCAL_API === '1' ? 'http://localhost:8080' : 'https://binpc2.onrender.com');

const apiProxy = {
  '/api': {
    target: apiProxyTarget,
    changeOrigin: true,
    timeout: 0,
    proxyTimeout: 0,
    configure(proxy: { on: (event: string, handler: (...args: unknown[]) => void) => void }) {
      proxy.on('proxyRes', (proxyRes: { headers: Record<string, string | string[] | undefined> }) => {
        if (String(proxyRes.headers['content-type'] ?? '').includes('text/event-stream')) {
          proxyRes.headers['cache-control'] = 'no-cache, no-transform';
          proxyRes.headers['x-accel-buffering'] = 'no';
        }
      });
    },
  },
} as const;

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    viteDevAdminSession(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Keep QR libs out of first-load vendor; loaded with QrScanner / ContactDisplay.
            if (/[\\/](?:jsqr|qrcode)(?:[\\/]|$)/.test(id)) return 'qr';
            return 'vendor';
          }
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
    proxy: apiProxy,
    // 핵심 진입 파일을 서버 기동 시 변환해 첫 페이지 콜드스타트를 줄입니다.
    warmup: {
      clientFiles: [
        './src/main.tsx',
        './src/App.tsx',
        './src/lib/localdb.ts',
      ],
    },
  },
  preview: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: apiProxy,
  },
});
