/**
 * AccuDefend - Static File Server
 * Serves the built frontend and proxies /api to the backend
 */

import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { request as httpRequest } from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, 'dist');
const PORT = parseInt(process.env.FRONTEND_PORT || '3000');
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function serveFile(res, filePath) {
  try {
    if (!existsSync(filePath) || !statSync(filePath).isFile()) return false;
    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const content = readFileSync(filePath);
    // HTML files should not be cached (SPA needs fresh index.html)
    // Assets (JS, CSS, images) can be cached long-term
    const cacheControl = ext === '.html'
      ? 'no-cache, no-store, must-revalidate'
      : 'public, max-age=31536000';
    res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': cacheControl });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

function proxyToBackend(req, res) {
  const backendUrl = new URL(BACKEND_URL);
  const options = {
    hostname: backendUrl.hostname,
    port: backendUrl.port,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `${backendUrl.hostname}:${backendUrl.port}` },
  };

  const proxyReq = httpRequest(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Backend unavailable' }));
  });

  req.pipe(proxyReq);
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // Proxy API requests to backend
  if (pathname.startsWith('/api/') || pathname === '/health' || pathname === '/ready') {
    return proxyToBackend(req, res);
  }

  // Try to serve static file
  const filePath = join(DIST_DIR, pathname === '/' ? 'index.html' : pathname);
  if (serveFile(res, filePath)) return;

  // SPA fallback: serve index.html for all non-file routes
  const indexPath = join(DIST_DIR, 'index.html');
  if (serveFile(res, indexPath)) return;

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`\n  AccuDefend Frontend Server`);
  console.log(`  ➜  Local:   http://localhost:${PORT}/`);
  console.log(`  ➜  API proxy: ${BACKEND_URL}`);
  console.log(`  ➜  Serving:  ${DIST_DIR}\n`);
});
