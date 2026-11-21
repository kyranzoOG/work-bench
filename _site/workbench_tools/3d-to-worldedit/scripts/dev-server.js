import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

function sendFile(res, filePath, method) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.stat(filePath, (statErr, stats) => {
        if (statErr || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not Found');
            return;
        }

        res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': stats.size,
            'Cache-Control': 'no-cache'
        });

        if (method === 'HEAD') {
            res.end();
            return;
        }

        const stream = fs.createReadStream(filePath);
        stream.on('error', () => {
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            }
            res.end();
        });
        stream.pipe(res);
    });
}

const server = http.createServer((req, res) => {
    const method = req.method || 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Method Not Allowed');
        return;
    }

    let urlPath = '/';
    try {
        const parsed = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        urlPath = decodeURIComponent(parsed.pathname);
    } catch {
        urlPath = '/';
    }

    if (urlPath === '/' || urlPath === '') {
        sendFile(res, path.join(rootDir, 'index.html'), method);
        return;
    }

    const safeRelPath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/, '');
    const resolvedPath = path.resolve(rootDir, safeRelPath);

    if (!resolvedPath.startsWith(rootDir + path.sep) && resolvedPath !== rootDir) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
    }

    fs.stat(resolvedPath, (err, stats) => {
        if (!err && stats.isFile()) {
            sendFile(res, resolvedPath, method);
            return;
        }

        if (!err && stats.isDirectory()) {
            const dirIndex = path.join(resolvedPath, 'index.html');
            if (fs.existsSync(dirIndex)) {
                sendFile(res, dirIndex, method);
                return;
            }
        }

        if (!path.extname(resolvedPath)) {
            sendFile(res, path.join(rootDir, 'index.html'), method);
            return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
    });
});

server.listen(PORT, HOST, () => {
    console.log(`WorldEdit Converter dev server running at http://${HOST}:${PORT}`);
});
