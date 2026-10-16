'use strict';
/**
 * 지식 레이어 — 방법론(thefrom-ux 스킬)과 FREATIVE 프롬프트·타입 정의.
 *
 * 원본은 GitHub 저장소(FROM-i/thefrom_design_Skill) 하나다.
 *  - knowledge/manifest.json 이 "무엇을 어디서 가져올지"를 적는다.
 *  - 앱은 시작할 때 manifest의 version을 비교해 바뀌었으면 파일을 내려받아 userData/knowledge/current 로 교체한다.
 *  - 네트워크가 안 되거나 저장소가 비공개인데 토큰이 없으면 설치본에 내장된 knowledge/ 로 동작한다.
 * 그래서 방법론·프롬프트 수정은 git push + manifest version 올리기만으로 전 직원에게 반영된다.
 */
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const settings = require('./settings');

const BUNDLED = path.join(__dirname, '../../knowledge');
let userDir = null;
let cache = null;
let lastSync = { ok: null, at: null, message: '' };

function init() {
  userDir = path.join(app.getPath('userData'), 'knowledge');
  fs.mkdirSync(userDir, { recursive: true });
}

function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

function activeDir() {
  const cur = path.join(userDir, 'current');
  const m = readJSON(path.join(cur, 'manifest.json'));
  const b = readJSON(path.join(BUNDLED, 'manifest.json'));
  // 내려받은 것이 내장본보다 오래됐으면(앱이 더 최신으로 업데이트된 경우) 내장본 사용
  if (m && b && compareVersion(m.version, b.version) < 0) return BUNDLED;
  if (m) return cur;
  return BUNDLED;
}

function compareVersion(a = '0', b = '0') {
  const pa = String(a).split(/[.\-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(/[.\-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function rawUrl(repo, branch, p) {
  return `https://raw.githubusercontent.com/${repo}/${branch}/${p.split('/').map(encodeURIComponent).join('/')}`;
}

async function fetchText(url, token) {
  const headers = { 'User-Agent': 'thefrom-freative' };
  if (token) headers.Authorization = `token ${token}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { headers, signal: ctrl.signal });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

/** manifest 경로 → raw URL. '@skill/'로 시작하면 스킬 저장소, 아니면 앱 저장소 */
function resolveUrl(s, p) {
  if (p.startsWith('@skill/')) return rawUrl(s.skillRepo || 'FROM-i/thefrom_design_Skill', s.skillBranch || 'main', p.slice(7));
  return rawUrl(s.repo, s.branch, p);
}

/** GitHub에서 지식 파일을 동기화 */
async function sync({ force = false } = {}) {
  const s = settings.get().knowledge;
  const token = settings.getSecret('githubToken');
  try {
    const manifestText = await fetchText(rawUrl(s.repo, s.branch, s.manifestPath), token);
    const remote = JSON.parse(manifestText);
    const current = readJSON(path.join(activeDir(), 'manifest.json')) || {};
    if (!force && compareVersion(remote.version, current.version) <= 0) {
      lastSync = { ok: true, at: new Date().toISOString(), message: `최신 상태 (v${current.version})`, version: current.version, changed: false };
      cache = null;
      return lastSync;
    }
    const tmp = path.join(userDir, `incoming-${Date.now()}`);
    fs.mkdirSync(tmp, { recursive: true });
    const entries = Object.entries(remote.files || {});
    for (const [local, repoPath] of entries) {
      const text = await fetchText(resolveUrl(s, repoPath), token);
      const dest = path.join(tmp, local);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, text, 'utf8');
    }
    // 폴더 단위 동기화 (팀이 올린 추가 사조·노하우) — GitHub contents API로 목록을 읽는다
    for (const [localDir, repoDir] of Object.entries(remote.dirs || {})) {
      try {
        const list = JSON.parse(await fetchText(`https://api.github.com/repos/${s.repo}/contents/${repoDir}?ref=${encodeURIComponent(s.branch)}`, token));
        for (const f of list.filter((x) => x.type === 'file' && /\.(md|json)$/.test(x.name))) {
          const text = await fetchText(rawUrl(s.repo, s.branch, `${repoDir}/${f.name}`), token);
          const dest = path.join(tmp, localDir, f.name);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, text, 'utf8');
        }
      } catch { /* 폴더가 없으면 건너뛴다 */ }
    }
    // 스킬 버전 표기
    if (remote.skillVersionFrom) {
      try {
        const pj = JSON.parse(await fetchText(resolveUrl(s, remote.skillVersionFrom), token));
        remote.skillVersion = pj.version;
      } catch { /* optional */ }
    }
    fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(remote, null, 2), 'utf8');
    const cur = path.join(userDir, 'current');
    const old = path.join(userDir, `old-${Date.now()}`);
    if (fs.existsSync(cur)) fs.renameSync(cur, old);
    fs.renameSync(tmp, cur);
    if (fs.existsSync(old)) fs.rmSync(old, { recursive: true, force: true });
    cache = null;
    lastSync = { ok: true, at: new Date().toISOString(), message: `업데이트됨 v${current.version || '-'} → v${remote.version}`, version: remote.version, changed: true };
    return lastSync;
  } catch (e) {
    lastSync = { ok: false, at: new Date().toISOString(), message: `동기화 실패 — 내장본 사용 (${e.message})` };
    return lastSync;
  }
}

/* ---------- 파싱 ---------- */

/** "## `ISM-BAUHAUS` · 바우하우스 (Bauhaus)" 단위로 사조 카드를 쪼갠다 */
function parseIsms(md) {
  const out = [];
  const re = /^## `(ISM-[A-Z0-9-]+)` · (.+)$/gm;
  const marks = [];
  let m;
  while ((m = re.exec(md))) marks.push({ id: m[1], title: m[2].trim(), start: m.index });
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].start : md.indexOf('\n## A-99', marks[i].start) > 0 ? md.indexOf('\n## A-99', marks[i].start) : md.length;
    const body = md.slice(marks[i].start, end).trim();
    const eraLine = (body.split('\n').find((l, k) => k > 0 && l.startsWith('**')) || '').replace(/\*\*/g, '');
    const era = eraLine.split(' · ')[0].replace(/^조형 전통:\s*/, '').split(' → ')[0].replace(/\s*\(.*$/, '').trim();
    const summary = (body.match(/\*\*요약\*\*\s*(.+)/) || [])[1] || '';
    const name = marks[i].title.replace(/\s*\(.+\)\s*$/, '').replace(/\s*—.*$/, '').trim();
    out.push({ id: marks[i].id, title: marks[i].title, name, era: era.trim(), summary: summary.trim(), body });
  }
  return out;
}

/** 마크다운에서 제목으로 절을 잘라낸다. 같은 깊이 이상의 다음 제목 전까지. */
function section(md, heading) {
  if (!md) return '';
  const lines = md.split('\n');
  const idx = lines.findIndex((l) => /^#{1,6} /.test(l) && l.replace(/^#+\s*/, '').startsWith(heading.replace(/^#+\s*/, '')));
  if (idx < 0) return '';
  const depth = lines[idx].match(/^#+/)[0].length;
  let end = lines.length;
  for (let i = idx + 1; i < lines.length; i++) {
    const h = lines[i].match(/^(#+) /);
    if (h && h[1].length <= depth) { end = i; break; }
  }
  return lines.slice(idx, end).join('\n').trim();
}

/** 노하우북 표 행 `| \`ID\` | 이름 | 설명 … |` → { id, name, desc } */
function parseKnowhow(md, source) {
  const out = [];
  for (const line of String(md || '').split('\n')) {
    const m = line.match(/^\|\s*`([A-Z]+-[A-Z0-9-]+)`\s*\|([^|]*)\|(.*)$/);
    if (!m || m[1].startsWith('ISM-')) continue;
    const cells = m[3].split('|').map((c) => c.replace(/`/g, '').trim()).filter(Boolean);
    out.push({ id: m[1], prefix: m[1].split('-')[0], name: m[2].replace(/`/g, '').trim(), desc: cells.join(' · ').slice(0, 220), source });
  }
  return out;
}

function libraryDir(kind) { return path.join(app.getPath('userData'), 'library', kind); }

function readLib(dirAbs, prefix) {
  const out = {};
  if (!fs.existsSync(dirAbs)) return out;
  for (const f of fs.readdirSync(dirAbs)) if (/\.md$/.test(f)) out[`${prefix}/${f}`] = fs.readFileSync(path.join(dirAbs, f), 'utf8');
  return out;
}

function load() {
  if (cache) return cache;
  const dir = activeDir();
  const manifest = readJSON(path.join(dir, 'manifest.json')) || {};
  const files = {};
  const walk = (d, rel = '') => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${f.name}` : f.name;
      if (f.isDirectory()) walk(path.join(d, f.name), r);
      else if (/\.(md|json|txt)$/.test(f.name)) files[r] = fs.readFileSync(path.join(d, f.name), 'utf8');
    }
  };
  walk(dir);
  const types = JSON.parse(files['types.json'] || '{"types":[]}');
  const disabled = new Set(((settings.get().library || {}).disabled) || []);
  const isms = parseIsms(files['skill/references/catalog-ism.md'] || '').map((i) => ({ ...i, source: '스킬' }));
  const knowhow = [
    ...parseKnowhow(files['skill/references/catalog-form.md'], '노하우북'),
    ...parseKnowhow(files['skill/references/catalog-pattern.md'], '스킬 패턴'),
  ];
  // 추가 사조·노하우: 팀 공유본(저장소 knowledge/custom/) + 이 PC 라이브러리
  const custom = {
    ...Object.fromEntries(Object.entries(files).filter(([k]) => k.startsWith('custom/'))),
    ...readLib(libraryDir('isms'), 'local/isms'),
    ...readLib(libraryDir('knowhow'), 'local/knowhow'),
  };
  const library = [];
  for (const [k, text] of Object.entries(custom)) {
    const src = k.startsWith('local/') ? '내 PC' : '팀';
    if (/\/isms\//.test(k)) for (const i of parseIsms(text)) { library.push({ kind: 'ism', id: i.id, name: i.name, source: src, file: k }); if (!disabled.has(i.id) && !isms.find((x) => x.id === i.id)) isms.push({ ...i, source: src, custom: true }); }
    if (/\/knowhow\//.test(k)) for (const r of parseKnowhow(text, src)) { library.push({ kind: 'knowhow', id: r.id, name: r.name, source: src, file: k, desc: r.desc }); if (!disabled.has(r.id)) knowhow.push({ ...r, custom: true }); }
  }
  const brain = JSON.parse(files['brain.json'] || '{"lenses":[],"stages":{},"knowhowGroups":{}}');
  cache = { dir, manifest, files, types, isms, knowhow, library, brain, disabled: [...disabled], source: dir === BUNDLED ? 'bundled' : 'synced' };
  return cache;
}

function doc(name) { return load().files[name] || ''; }

function status() {
  const k = load();
  return {
    version: k.manifest.version,
    skillVersion: k.manifest.skillVersion,
    methodVersion: k.manifest.methodVersion,
    source: k.source,
    lastSync,
    repo: settings.get().knowledge.repo,
    counts: { isms: k.isms.length, knowhow: k.knowhow.length, custom: k.library.length, types: k.types.types.length, files: Object.keys(k.files).length },
  };
}

function invalidate() { cache = null; }

module.exports = { init, sync, load, doc, section, status, parseIsms, parseKnowhow, compareVersion, invalidate, libraryDir };
