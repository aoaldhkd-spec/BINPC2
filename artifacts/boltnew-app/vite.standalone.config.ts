import path from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
// Independent entry: no production proxy, no env files, no application bootstrap.
export default defineConfig({
  root: path.resolve(import.meta.dirname, 'standalone-preview'),
  envFile: false,
  plugins: [react(), tailwindcss(), {
    name: 'export-offline-html',
    generateBundle(_options, bundle) {
      const js = Object.values(bundle).filter(x => x.type === 'chunk').map(x => x.code).join('\n');
      const css = Object.values(bundle).filter(x => x.type === 'asset' && x.fileName.endsWith('.css')).map(x => String(x.source)).join('\n');
      const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'";
      const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><title>BINPC2 V6 가상 체험판</title><style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body><div id="root"></div><script>${js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`;
      const out = path.resolve(import.meta.dirname, '../../.local/preview');
      mkdirSync(out, { recursive: true });
      writeFileSync(path.join(out, 'BINPC2-V6-demo.html'), html);
    }
  }],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') }, dedupe: ['react', 'react-dom'] },
  define: { 'import.meta.env.API_URL': '""', 'import.meta.env.VITE_SSE_ORIGIN': '""', 'import.meta.env.API_PUBLIC_URL': '""' },
  build: { outDir: '../../../.local/preview/build', emptyOutDir: true, rollupOptions: { output: { inlineDynamicImports: true } } }
});
