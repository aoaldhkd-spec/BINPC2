import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import { logger } from './logger';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function resolveFrontendDist(): string {
  // Bundled output lives in artifacts/api-server/dist/*.mjs
  return path.resolve(moduleDir, '../boltnew-app/dist/public');
}

/** Serve the Vite production build from the same origin as /api (Render single-URL deploy). */
export function mountProductionSpa(app: Express): void {
  if (process.env.NODE_ENV !== 'production') return;

  const publicDir = resolveFrontendDist();
  if (!fs.existsSync(path.join(publicDir, 'index.html'))) {
    logger.warn({ publicDir }, '[static] frontend build not found — API-only mode');
    return;
  }

  app.use(express.static(publicDir, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api\/).*/, (_req, res, next) => {
    if (res.headersSent) {
      next();
      return;
    }
    res.sendFile(path.join(publicDir, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
  logger.info({ publicDir }, '[static] SPA mounted');
}
