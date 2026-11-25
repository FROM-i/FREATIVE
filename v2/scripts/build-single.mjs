#!/usr/bin/env node
// 한 파일로 묶기 — standalone/the-from-brain.html
// 서버 없이 더블클릭으로 열린다(ES 모듈은 file:// 에서 막히므로 묶어서 넣는다). 메일·메신저로 보내도 된다.
//   node scripts/build-single.mjs [--out=경로] [--font=글꼴 주소]
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const out = path.resolve(root, arg('out', 'standalone/the-from-brain.html'));
const font = arg('font', '../fonts/PretendardVariable.woff2');

const js = (await build({ entryPoints: [path.join(root, 'js/app.js')], bundle: true, format: 'iife', minify: true, target: 'es2022', write: false, legalComments: 'none' })).outputFiles[0].text;
const css = (await readFile(path.join(root, 'css/brain.css'), 'utf8')).replace(/url\('[^']*PretendardVariable\.woff2'\)/, `url('${font}')`);
const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const html = (await readFile(path.join(root, 'index.html'), 'utf8'))
  .replace('<link rel="stylesheet" href="css/brain.css">', () => `<style>\n${css}</style>`)
  .replace('<script type="module" src="js/app.js"></script>', () => `<script>\n${js.replace(/<\/script/gi, '<\\/script')}</script>`)
  .replace('<head>', `<head>\n<!-- THE FROM BRAIN ${version} · 자동 생성(scripts/build-single.mjs) — 직접 고치지 않는다 -->`);
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, html);
console.log(`${path.relative(root, out)}  ${(html.length / 1024).toFixed(0)} KB`);
