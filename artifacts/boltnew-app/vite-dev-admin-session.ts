/**
 * Vite-dev only. Never included in Netlify production builds (`apply: 'serve'`).
 * Mints a real production admin session from the gitignored credentials file
 * so local /admin can skip the login card and still persist password changes.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

const CRED = path.resolve(import.meta.dirname, '../api-server/.security-credentials.txt');
const API = (process.env.API_PUBLIC_URL || 'https://binpc2.onrender.com').replace(/\/$/, '');
const PHONE = '010-3878-6740';

function readCred(prefix: string): string {
  if (!existsSync(CRED)) return '';
  for (const line of readFileSync(CRED, 'utf8').split(/\r?\n/)) {
    if (line.startsWith(prefix)) return line.split(':').slice(1).join(':').trim();
  }
  return '';
}

export function viteDevAdminSession(): Plugin {
  return {
    name: 'vite-dev-admin-session',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/admin-session', async (_req, res) => {
        try {
          const password = readCred('Admin login (/admin)');
          if (!password) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'no local operator credential' }));
            return;
          }
          const rpc = await fetch(`${API}/api/db/rpc/admin_create_session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_phone: PHONE, p_admin_password: password }),
          });
          const json = await rpc.json().catch(() => ({})) as { data?: unknown; error?: { message?: string } };
          if (rpc.status !== 200 || typeof json.data !== 'string' || !json.data) {
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'operator session mint failed', status: rpc.status }));
            return;
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({ token: json.data, password, phone: PHONE }));
        } catch {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'operator session mint unavailable' }));
        }
      });
    },
  };
}
