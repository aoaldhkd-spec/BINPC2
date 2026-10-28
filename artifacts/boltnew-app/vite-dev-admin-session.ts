/** Local synthetic previews only; never reads an operator credential file. */
import type { Plugin } from 'vite';
export function localDevAdminOrigin(
  env: Record<string, string | undefined>,
): string | null {
  if (env.LOCAL_API !== '1' || !env.API_PUBLIC_URL) return null;
  try {
    const url = new URL(env.API_PUBLIC_URL);
    if (
      url.protocol !== 'http:' ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}
// Explicit isolated fixture identity; never embed the operator's phone.
const PHONE = process.env.DEV_ADMIN_PHONE?.trim() || '01000000000';

export function viteDevAdminSession(): Plugin {
  return {
    name: 'vite-dev-admin-session',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/admin-session', async (req, res) => {
        try {
          const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(
            req.socket.remoteAddress ?? '',
          );
          if (!local || req.headers['sec-fetch-site'] === 'cross-site') {
            res.statusCode = 403;
            res.end();
            return;
          }
          const API = localDevAdminOrigin(process.env);
          const password = process.env.DEV_ADMIN_PASSWORD ?? '';
          if (!API || !password) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: 'explicit isolated local admin binding required',
              }),
            );
            return;
          }
          const rpc = await fetch(`${API}/api/db/rpc/admin_create_session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              p_phone: PHONE,
              p_admin_password: password,
            }),
          });
          const json = (await rpc.json().catch(() => ({}))) as {
            data?: unknown;
            error?: { message?: string };
          };
          if (
            rpc.status !== 200 ||
            typeof json.data !== 'string' ||
            !json.data
          ) {
            res.statusCode = 403;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: 'operator session mint failed',
                status: rpc.status,
              }),
            );
            return;
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({ token: json.data, password, phone: PHONE }));
        } catch {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({ error: 'operator session mint unavailable' }),
          );
        }
      });
    },
  };
}
