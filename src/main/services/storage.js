'use strict';
/**
 * 저장소 — ProjectStore 인터페이스
 *
 * 지금: LocalProjectStore — userData/workspace/projects/<id>/
 *   project.json   메타 + 브리프 + 실행 상태(run)
 *   attachments/   첨부 원본 사본
 *   outputs/       생성 이미지·보고서
 *
 * 이후: CentralProjectStore — 같은 메서드를 중앙 DB/스토리지(예: Supabase Postgres + Storage)로 구현.
 * 프로젝트 메타에는 처음부터 ownerId·orgId·teamId·visibility를 넣어 두어 이관 시 변환이 필요 없다.
 *
 * interface ProjectStore {
 *   list(user): Project[]   get(id): Project   create(user, brief, files): Project
 *   update(id, patch): Project   saveRun(id, run)   remove(id)
 *   writeOutput(id, name, buffer): relPath   resolveProjectFile(id, rel): absPath|null
 * }
 */
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let root = null;

function init() {
  root = path.join(app.getPath('userData'), 'workspace', 'projects');
  fs.mkdirSync(root, { recursive: true });
}

const dirOf = (id) => path.join(root, id.replace(/[^a-zA-Z0-9_-]/g, ''));
const metaFile = (id) => path.join(dirOf(id), 'project.json');

function newId() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `${stamp}-${crypto.randomBytes(3).toString('hex')}`;
}

function read(id) {
  try { return JSON.parse(fs.readFileSync(metaFile(id), 'utf8')); } catch { return null; }
}

function write(p) {
  p.updatedAt = new Date().toISOString();
  fs.mkdirSync(dirOf(p.id), { recursive: true });
  const tmp = metaFile(p.id) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(p, null, 2), 'utf8');
  fs.renameSync(tmp, metaFile(p.id));
  return p;
}

function list() {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .map((id) => read(id))
    .filter(Boolean)
    .map((p) => ({
      id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt,
      ownerId: p.ownerId, orgId: p.orgId, teamId: p.teamId, visibility: p.visibility,
      deliverable: p.brief && p.brief.deliverables, status: p.run ? p.run.status : 'draft',
      worker: (p.brief && p.brief.worker) || p.ownerName, cost: p.run && p.run.usage ? p.run.usage.cost || 0 : 0,
      concept: p.run && p.run.results && p.run.results.concept ? p.run.results.concept.theme : '',
      cover: p.run && p.run.results && p.run.results.creative && p.run.results.creative.examples
        ? (p.run.results.creative.examples.find((e) => e.image) || {}).image || null : null,
    }))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

function create(user, brief, attachments = []) {
  const id = newId();
  const dir = dirOf(id);
  fs.mkdirSync(path.join(dir, 'attachments'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'outputs'), { recursive: true });
  const files = [];
  for (const src of attachments) {
    try {
      const base = path.basename(src);
      let name = base; let i = 1;
      while (fs.existsSync(path.join(dir, 'attachments', name))) { const e = path.extname(base); name = `${path.basename(base, e)}-${i++}${e}`; }
      fs.copyFileSync(src, path.join(dir, 'attachments', name));
      files.push({ name, rel: `attachments/${name}`, size: fs.statSync(src).size });
    } catch (e) { files.push({ name: path.basename(src), error: e.message }); }
  }
  const p = {
    id,
    schema: 1,
    name: brief.projectName || '이름 없는 미션',
    createdAt: new Date().toISOString(),
    ownerId: user.id,
    ownerName: user.name,
    orgId: user.orgId,
    teamId: (user.teamIds && user.teamIds[0]) || null,
    visibility: 'private',
    brief,
    attachments: files,
    run: null,
  };
  return write(p);
}

function update(id, patch) {
  const p = read(id);
  if (!p) throw new Error('project not found');
  return write({ ...p, ...patch });
}

function saveRun(id, run) {
  const p = read(id);
  if (!p) return null;
  p.run = run;
  return write(p);
}

function remove(id) {
  const dir = dirOf(id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

function duplicate(user, id) {
  const p = read(id);
  if (!p) throw new Error('project not found');
  const srcs = (p.attachments || []).filter((a) => a.rel).map((a) => path.join(dirOf(id), a.rel));
  return create(user, { ...p.brief, projectName: `${p.name} (사본)` }, srcs);
}

function writeOutput(id, name, buffer) {
  const rel = `outputs/${name}`;
  const abs = path.join(dirOf(id), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buffer);
  return rel;
}

function resolveProjectFile(id, rel) {
  const dir = dirOf(id);
  const abs = path.resolve(dir, rel);
  if (!abs.startsWith(path.resolve(dir) + path.sep)) return null;
  return fs.existsSync(abs) ? abs : null;
}

function projectDir(id) { return dirOf(id); }

module.exports = { init, list, get: read, create, update, saveRun, remove, duplicate, writeOutput, resolveProjectFile, projectDir };
