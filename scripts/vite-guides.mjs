// Dev and preview helper: serve the static guide pages (public/guides/<name>/index.html) instead of the planner.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export default function guidePages() {
  const serve = (req, res, next) => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== '/guides' && !path.startsWith('/guides/')) return next();
    const dir = join(process.cwd(), 'public', path.replace(/\/+$/, ''));
    const file = join(dir, 'index.html');
    if (existsSync(dir) && statSync(dir).isDirectory() && existsSync(file)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(readFileSync(file));
      return;
    }
    next();
  };
  return {
    name: 'guide-pages',
    configureServer(server) { server.middlewares.use(serve); },
    configurePreviewServer(server) { server.middlewares.use(serve); },
  };
}
