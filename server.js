// server.js
// Static dev server with safe SPA fallback:
// - If a file exists -> serve it
// - If file missing:
//    - For navigation (HTML) -> serve index.html
//    - For assets (.js/.css/.png/...) -> 404 (prevents "Unexpected token '<'")

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const ROOT = path.join(process.cwd(), 'web');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

function send(res, status, contentType, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType);
  res.end(body);
}

function send404(res) {
  send(res, 404, 'text/plain; charset=utf-8', 'Not found');
}

function isHtmlNavigation(req) {
  const accept = (req.headers.accept || '').toLowerCase();
  return accept.includes('text/html');
}

function safeJoin(root, urlPath) {
  const normalized = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  return path.join(root, normalized);
}

const server = http.createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

    // Block any request into /dist to avoid serving large packaged files
    if (urlPath.startsWith('/dist/') || urlPath === '/dist' || urlPath.includes('/dist/')) {
      return send404(res);
    }

    // Resolve file path
    let filePath = safeJoin(ROOT, urlPath);

    // If requesting a directory -> try index.html inside it
    if (urlPath.endsWith('/')) filePath = path.join(filePath, 'index.html');

    fs.stat(filePath, (err, stat) => {
      if (!err && stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }

      fs.stat(filePath, (err2, stat2) => {
        if (err2 || !stat2.isFile()) {
          // Missing file:
          // - If this looks like a browser navigation, serve index.html (SPA)
          // - Otherwise, return 404 so JS/CSS requests don't get HTML.
          if (isHtmlNavigation(req) && !path.extname(urlPath)) {
            const idx = path.join(ROOT, 'index.html');
            return fs.readFile(idx, (e, data) => {
              if (e) return send404(res);
              send(res, 200, mime['.html'], data);
            });
          }

          // Also serve index.html for routes like /settings (no extension) in SPA-style
          if (isHtmlNavigation(req) && path.extname(urlPath) === '') {
            const idx = path.join(ROOT, 'index.html');
            return fs.readFile(idx, (e, data) => {
              if (e) return send404(res);
              send(res, 200, mime['.html'], data);
            });
          }

          return send404(res);
        }

        const ext = path.extname(filePath).toLowerCase();
        res.statusCode = 200;
        res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
        fs.createReadStream(filePath).pipe(res);
      });
    });
  } catch (e) {
    console.error('Dev server error', e);
    send404(res);
  }
});

server.listen(PORT, () => {
  console.log(`Dev server running at http://localhost:${PORT}/`);
});