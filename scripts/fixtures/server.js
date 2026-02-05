import http from 'node:http';

function parseCookies(header = '') {
  return header.split(';').reduce((acc, part) => {
    const [key, ...rest] = part.trim().split('=');
    if (!key) return acc;
    acc[key] = rest.join('=');
    return acc;
  }, {});
}

function htmlPage(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; }
  </style>
</head>
<body>
  ${body}
</body>
</html>`;
}

export function createFixtureServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const path = url.pathname;
    const cookies = parseCookies(req.headers.cookie || '');
    const hasAuth = req.headers['x-a11y-auth'] === '1' || cookies.a11y_auth === '1';

    if (path === '/good') {
      const body = `
        <main>
          <h1>Accessible Sample</h1>
          <p>This page is intentionally simple and accessible.</p>
          <img src="/static/logo.png" alt="Sample logo" />
          <label for="email">Email</label>
          <input id="email" name="email" type="email" />
          <button type="button">Continue</button>
        </main>
      `;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(htmlPage('Good Page', body));
      return;
    }

    if (path === '/bad') {
      const body = `
        <h1>Problematic Sample</h1>
        <img src="/static/logo.png" />
        <p style="color: #bcbcbc; background: #ffffff;">Low contrast text</p>
        <input id="name" placeholder="Name" />
        <button type="button"></button>
      `;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(htmlPage('Bad Page', body));
      return;
    }

    if (path === '/spa') {
      const body = `
        <h1>SPA Sample</h1>
        <a href="/spa/route-1">Route 1</a>
        <script>
          setTimeout(() => {
            history.pushState({}, '', '/spa/route-1');
          }, 50);
          setTimeout(() => {
            history.pushState({}, '', '/spa/route-2');
          }, 100);
        </script>
      `;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(htmlPage('SPA Page', body));
      return;
    }

    if (path === '/auth') {
      if (!hasAuth) {
        req.socket.destroy();
        return;
      }
      const body = `
        <h1>Authorized</h1>
        <p>Authenticated content is visible.</p>
      `;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(htmlPage('Auth Page', body));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end(htmlPage('Not Found', '<h1>404</h1>'));
  });
}

export function startFixtureServer(port = 4173) {
  const server = createFixtureServer();

  return new Promise((resolve) => {
    server.listen(port, () => {
      resolve({ server, port });
    });
  });
}

export default createFixtureServer;
