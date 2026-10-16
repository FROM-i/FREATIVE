'use strict';
/**
 * 첨부 파일을 모델 입력으로 바꾼다.
 *  - .md .txt .csv .json   → 텍스트 (권장: .md)
 *  - .png .jpg .webp .gif  → 이미지(비전 입력) (권장)
 *  - .pdf                  → 파일 입력(모델이 직접 읽음)
 *  - .pptx                 → 슬라이드 텍스트 + 슬라이드에 들어있는 이미지 일부
 *  - .docx                 → 본문 텍스트
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const TEXT = ['.md', '.markdown', '.txt', '.csv', '.json'];
const IMAGE = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const MAX_TEXT = 40000;
const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function kindOf(file) {
  const e = path.extname(file).toLowerCase();
  if (TEXT.includes(e)) return 'text';
  if (IMAGE[e]) return 'image';
  if (e === '.pdf') return 'pdf';
  if (e === '.pptx') return 'pptx';
  if (e === '.docx') return 'docx';
  return 'unsupported';
}

function decodeXml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

async function pptx(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const slides = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => parseInt(a.match(/(\d+)/)[1], 10) - parseInt(b.match(/(\d+)/)[1], 10));
  const parts = [];
  for (const s of slides) {
    const xml = await zip.file(s).async('string');
    const paras = xml.split(/<\/a:p>/).map((p) => (p.match(/<a:t>([^<]*)<\/a:t>/g) || []).map((t) => decodeXml(t.replace(/<\/?a:t>/g, ''))).join('')).filter(Boolean);
    parts.push(`[슬라이드 ${s.match(/(\d+)/)[1]}]\n${paras.join('\n')}`);
  }
  const media = Object.keys(zip.files).filter((n) => /^ppt\/media\/.+\.(png|jpe?g)$/i.test(n)).slice(0, 4);
  const images = [];
  for (const m of media) {
    const buf = await zip.file(m).async('nodebuffer');
    if (buf.length > 40 * 1024 && buf.length < MAX_IMAGE_BYTES) {
      images.push({ name: `${path.basename(file)}:${path.basename(m)}`, dataUrl: `data:${/png$/i.test(m) ? 'image/png' : 'image/jpeg'};base64,${buf.toString('base64')}` });
    }
  }
  return { text: parts.join('\n\n'), images };
}

async function docx(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const xml = await zip.file('word/document.xml').async('string');
  return xml.split(/<\/w:p>/).map((p) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((t) => decodeXml(t.replace(/<[^>]+>/g, ''))).join('')).filter(Boolean).join('\n');
}

/** 파일 목록 → { texts, images, pdfs, skipped } */
async function prepare(files) {
  const out = { texts: [], images: [], pdfs: [], skipped: [] };
  for (const f of files) {
    const name = path.basename(f);
    try {
      const k = kindOf(f);
      if (k === 'text') {
        let t = fs.readFileSync(f, 'utf8');
        if (t.length > MAX_TEXT) t = t.slice(0, MAX_TEXT) + '\n…(이하 생략)';
        out.texts.push({ name, text: t });
      } else if (k === 'image') {
        const buf = fs.readFileSync(f);
        if (buf.length > MAX_IMAGE_BYTES) { out.skipped.push({ name, reason: '이미지가 15MB를 넘음' }); continue; }
        if (out.images.length >= MAX_IMAGES) { out.skipped.push({ name, reason: `이미지는 ${MAX_IMAGES}장까지` }); continue; }
        out.images.push({ name, dataUrl: `data:${IMAGE[path.extname(f).toLowerCase()]};base64,${buf.toString('base64')}` });
      } else if (k === 'pdf') {
        const buf = fs.readFileSync(f);
        if (buf.length > 30 * 1024 * 1024) { out.skipped.push({ name, reason: 'PDF가 30MB를 넘음' }); continue; }
        out.pdfs.push({ name, dataUrl: `data:application/pdf;base64,${buf.toString('base64')}` });
      } else if (k === 'pptx') {
        const r = await pptx(f);
        out.texts.push({ name, text: r.text.slice(0, MAX_TEXT) });
        for (const im of r.images) if (out.images.length < MAX_IMAGES) out.images.push(im);
      } else if (k === 'docx') {
        out.texts.push({ name, text: (await docx(f)).slice(0, MAX_TEXT) });
      } else {
        out.skipped.push({ name, reason: '지원하지 않는 형식' });
      }
    } catch (e) {
      out.skipped.push({ name, reason: e.message });
    }
  }
  return out;
}

function inspect(paths) {
  return paths.map((p) => {
    let size = 0;
    try { size = fs.statSync(p).size; } catch { /* noop */ }
    const kind = kindOf(p);
    let preview = null;
    if (kind === 'image' && size < 6 * 1024 * 1024) {
      try { preview = `data:${IMAGE[path.extname(p).toLowerCase()]};base64,${fs.readFileSync(p).toString('base64')}`; } catch { /* noop */ }
    }
    return { path: p, name: path.basename(p), size, kind, preview };
  });
}

module.exports = { prepare, inspect, kindOf };
