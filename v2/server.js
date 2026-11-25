#!/usr/bin/env node
// 로컬 실행 서버 — 의존 패키지 없음.
//   node server.js                 → http://localhost:4173  (목업 · 내 키 방식)
//   OPENAI_API_KEY=sk-… node server.js   → 서버 키 방식(/api/llm)도 켜진다
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { forward } from './api/llm.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, '..');
const port = +(process.env.PORT || 4173);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8' };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/llm') {
      let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 4e6) throw Object.assign(new Error('요청이 너무 크다'), { status: 413 }); }
      const out = await forward({ method: req.method, code: req.headers['x-brain-code'], payload: raw ? JSON.parse(raw) : {} });
      res.writeHead(out.status, { 'Content-Type': 'application/json' }); res.end(out.body); return;
    }
    // 글꼴은 1.x 것을 그대로 쓴다 (/src/renderer/fonts). 그 밖에는 v2/ 안만 연다.
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const base = rel.startsWith('/src/renderer/fonts/') ? repo : root;
    const file = path.resolve(base, `.${rel}`);
    if (!file.startsWith(base + path.sep)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data);
  } catch (e) {
    res.writeHead(e.status || (e.code === 'ENOENT' ? 404 : 500), { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: e.code === 'ENOENT' ? 'not found' : e.message } }));
  }
}).listen(port, () => console.log(`THE FROM BRAIN → http://localhost:${port}${process.env.OPENAI_API_KEY ? '  (서버 키 켜짐)' : ''}`));
