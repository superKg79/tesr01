const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

const apiHandlers = {
  '/api/analyze': require('../api/analyze'),
  '/api/extract-resume': require('../api/extract-resume')
};

function parseJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid JSON')); }
    });
  });
}

http.createServer(async (request, response) => {
  let url = request.url.split('?')[0];
  if (apiHandlers[url]) {
    try {
      const body = await parseJson(request);
      const apiResponse = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        setHeader(name, value) { response.setHeader(name, value); return this; },
        send(value) { response.statusCode = this.statusCode; response.end(value); }
      };
      return apiHandlers[url]({ method: request.method, body }, apiResponse);
    } catch {
      response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return response.end(JSON.stringify({ error: '请求格式无效。' }));
    }
  }
  if (url === '/') url = '/index.html';
  const file = path.resolve(root, `.${url}`);
  if (!file.startsWith(root)) return response.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    if (error) return response.writeHead(404).end('Not found');
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    response.end(data);
  });
}).listen(4173, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:4173'));
