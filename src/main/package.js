'use strict';
/**
 * 프로젝트 파일(.freative) — 중앙 관리 이전에 프로젝트를 PC 사이로 옮기는 단위.
 *
 * 하나의 zip 안에:
 *   freative.json   형식·버전·내보낸 앱/지식 버전·내보낸 사람·시각
 *   project.json    브리프 + 실행 기록 전체(run: 단계 시각 · 조수 호출 · 브레인 판정 · 회차 · 결과)
 *   outputs/…       생성 이미지 · 보고서
 *   attachments/…   첨부 원본 (내보낼 때 뺄 수 있다 — 제안요청서처럼 민감한 첨부)
 *
 * 가져오면 새 프로젝트로 만들고, 실행 기록의 시각으로 과정을 그대로 다시 볼 수 있다(화면의 '과정 다시 보기').
 * API 키·설정·비용 장부는 넣지 않는다.
 */
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const store = require('./services/storage');

const FORMAT = 'freative-project';
const VERSION = 1;
const ALLOWED = /^(outputs|attachments)\/[^\0]+$/;

function walk(dir, base = '') {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const rel = base ? `${base}/${d.name}` : d.name;
    return d.isDirectory() ? walk(path.join(dir, d.name), rel) : [rel];
  });
}

/** 프로젝트를 .freative 버퍼로 — withAttachments=false면 첨부는 이름만 남긴다 */
async function exportPackage(id, { withAttachments = true, by = '', appVersion = '', knowledgeVersion = '' } = {}) {
  const p = store.get(id);
  if (!p) throw new Error('프로젝트를 찾을 수 없습니다');
  const dir = store.projectDir(id);
  const zip = new JSZip();
  const project = JSON.parse(JSON.stringify(p));
  if (!withAttachments) project.attachments = (project.attachments || []).map((a) => ({ name: a.name, size: a.size, excluded: true }));
  if (project.run && ['running'].includes(project.run.status)) project.run.status = 'interrupted';
  const files = walk(path.join(dir, 'outputs'), 'outputs').concat(withAttachments ? walk(path.join(dir, 'attachments'), 'attachments') : []);
  for (const rel of files) zip.file(rel, fs.readFileSync(path.join(dir, rel)));
  zip.file('project.json', JSON.stringify(project, null, 1));
  zip.file('freative.json', JSON.stringify({ format: FORMAT, version: VERSION, projectId: p.id, name: p.name, exportedAt: new Date().toISOString(), exportedBy: by, appVersion, knowledgeVersion, withAttachments, files: files.length }, null, 1));
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

/** .freative 버퍼를 새 프로젝트로 — 원래 id가 들어간 이미지 주소(ct://project/<id>/…)를 새 id로 바꾼다 */
async function importPackage(buffer, user) {
  let zip;
  try { zip = await JSZip.loadAsync(buffer); } catch { throw new Error('FREATIVE 프로젝트 파일이 아닙니다 (zip을 열 수 없음)'); }
  const mf = zip.file('freative.json');
  const pj = zip.file('project.json');
  if (!mf || !pj) throw new Error('FREATIVE 프로젝트 파일이 아닙니다 (freative.json · project.json 없음)');
  const manifest = JSON.parse(await mf.async('string'));
  if (manifest.format !== FORMAT) throw new Error('FREATIVE 프로젝트 파일이 아닙니다');
  if (manifest.version > VERSION) throw new Error(`더 새 버전의 앱에서 만든 파일입니다 (형식 v${manifest.version}) — 앱을 업데이트해 주세요`);
  const oldId = String(manifest.projectId || '');
  const raw = await pj.async('string');
  const fresh = store.createEmpty(user);
  const text = oldId ? raw.split(`ct://project/${oldId}/`).join(`ct://project/${fresh.id}/`) : raw;
  const project = JSON.parse(text);
  const dir = store.projectDir(fresh.id);
  for (const [rel, entry] of Object.entries(zip.files)) {
    if (entry.dir || !ALLOWED.test(rel) || rel.split('/').includes('..')) continue;
    const abs = path.join(dir, rel);
    if (!path.resolve(abs).startsWith(path.resolve(dir) + path.sep)) continue;
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, await entry.async('nodebuffer'));
  }
  if (project.run && ['running', 'paused'].includes(project.run.status) && project.run.status === 'running') project.run.status = 'interrupted';
  return store.update(fresh.id, {
    ...project,
    id: fresh.id,
    createdAt: fresh.createdAt,
    ownerId: user.id, ownerName: user.name, orgId: user.orgId, teamId: fresh.teamId, visibility: 'private',
    imported: { from: oldId, name: manifest.name, exportedAt: manifest.exportedAt, exportedBy: manifest.exportedBy || project.ownerName || '', appVersion: manifest.appVersion, knowledgeVersion: manifest.knowledgeVersion, withAttachments: manifest.withAttachments !== false, at: new Date().toISOString(), by: user.name },
  });
}

module.exports = { exportPackage, importPackage, FORMAT, VERSION };
