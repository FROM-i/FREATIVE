'use strict';
/** IPC — 렌더러 요청은 모두 여기서 권한(auth.can)을 거친다. */
const { ipcMain, dialog, shell, app } = require('electron');
const settings = require('./settings');
const knowledge = require('./knowledge');
const store = require('./services/storage');
const auth = require('./services/auth');
const attachments = require('./attachments');
const providers = require('./providers');
const orchestrator = require('./orchestrator');
const report = require('./report');
const updater = require('./updater');
const library = require('./library');
const cost = require('./cost');
const reportPpt = require('./report-ppt');
const pkg = require('./package');
const fs = require('fs');
const path = require('path');

function register(win, { isMock }) {
  providers.setMock(isMock);
  orchestrator.markInterrupted();
  const emit = orchestrator.emitterFor(win);

  const guard = async (action, resource) => {
    const user = await auth.current();
    if (!auth.can(user, action, resource)) throw new Error('권한이 없습니다');
    return user;
  };
  const meta = (id) => { const p = store.get(id); if (!p) throw new Error('프로젝트를 찾을 수 없습니다'); return p; };
  const h = (ch, fn) => ipcMain.handle(ch, async (_e, ...args) => fn(...args));

  h('app:info', async () => ({
    version: app.getVersion(), platform: process.platform, mock: isMock, packaged: app.isPackaged,
    stages: orchestrator.STAGES, userData: app.getPath('userData'),
  }));
  h('app:openPath', async (p) => shell.openPath(p));
  h('app:openExternal', async (u) => { if (/^https?:\/\//.test(u)) await shell.openExternal(u); });

  h('auth:current', async () => auth.current());

  h('settings:get', async () => settings.get());
  h('settings:set', async (patch) => { await guard('settings:manage'); return settings.set(patch); });
  h('settings:setSecret', async (k, v) => { await guard('settings:manage'); return settings.setSecret(k, v); });
  h('settings:testKey', async () => {
    try { return await providers.get().test(); } catch (e) { return { ok: false, message: e.message }; }
  });
  h('settings:listModels', async () => {
    try { return { ok: true, models: await providers.get().listModels() }; } catch (e) { return { ok: false, message: e.message }; }
  });

  // 모델 구성 — 추천(지식 저장소) / 직접 지정
  h('settings:presets', async () => require('./presets').list());
  h('settings:applyPreset', async (id) => { await guard('settings:manage'); return require('./presets').apply(id); });
  h('settings:models', async () => { const models = require('./models'); return { following: models.following(), effective: models.effective(), recommended: models.recommended(), pricing: models.pricing() }; });
  h('settings:modelsMode', async (follow) => {
    await guard('settings:manage');
    const models = require('./models');
    if (follow) return settings.set({ openai: { followRecommended: true } });
    return settings.set({ openai: { followRecommended: false, ...models.snapshotToCustom() } });
  });
  h('settings:discoverModels', async () => {
    try { const ids = await providers.get().listModels(); return { ok: true, ...require('./models').classify(ids), total: ids.length }; } catch (e) { return { ok: false, message: e.message }; }
  });

  h('knowledge:status', async () => knowledge.status());
  h('knowledge:sync', async () => { const r = await knowledge.sync({ force: false }); return { ...r, status: knowledge.status() }; });
  h('knowledge:types', async () => { const k = knowledge.load(); return k.types; });
  h('knowledge:isms', async () => knowledge.load().isms.map(({ body, ...rest }) => rest));

  h('files:pick', async () => {
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '권장 — 마크다운·이미지', extensions: ['md', 'markdown', 'png', 'jpg', 'jpeg', 'webp'] },
        { name: '모든 지원 형식', extensions: ['md', 'markdown', 'txt', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'pdf', 'pptx', 'docx', 'csv', 'json'] },
      ],
    });
    return r.canceled ? [] : attachments.inspect(r.filePaths);
  });
  h('files:inspect', async (paths) => attachments.inspect(paths || []));

  h('projects:list', async () => {
    const user = await guard('project:read');
    return store.list().filter((p) => auth.can(user, 'project:read', p));
  });
  h('projects:get', async (id) => { const p = meta(id); await guard('project:read', p); return p; });
  h('projects:create', async (brief, files) => {
    const user = await guard('project:create');
    if (brief && brief.worker) settings.set({ lastWorker: brief.worker });
    return store.create(user, brief, files || []);
  });
  h('projects:exportPpt', async (id, force) => {
    const p = meta(id); await guard('project:read', p);
    await orchestrator.reportCore(id, emit, { force: !!force });
    const r = await reportPpt.exportPpt(id);
    shell.showItemInFolder(r.file);
    return r;
  });
  h('projects:remove', async (id) => { const p = meta(id); await guard('project:delete', p); orchestrator.cancel(id); return store.remove(id); });
  h('projects:duplicate', async (id) => { const p = meta(id); const user = await guard('project:create', p); return store.duplicate(user, id); });
  h('projects:export', async (id) => {
    const p = meta(id); await guard('project:read', p);
    const r = report.exportProject(id);
    shell.showItemInFolder(r.reportPath);
    return r;
  });

  // 프로젝트 파일(.freative) — 어느 PC에서든 결과와 과정을 그대로 열어 본다
  h('projects:exportPackage', async (id) => {
    const p = meta(id); const user = await guard('project:read', p);
    const n = (p.attachments || []).filter((a) => a.rel).length;
    let withAttachments = false;
    if (n) {
      const c = await dialog.showMessageBox(win, { type: 'question', buttons: ['첨부 포함', '첨부 빼고', '취소'], defaultId: 0, cancelId: 2, message: `첨부 ${n}개를 함께 넣을까요?`, detail: '제안요청서처럼 밖으로 나가면 안 되는 첨부라면 빼고 내보내세요. 빼도 결과와 과정은 그대로 볼 수 있고, 첨부는 이름만 남습니다.' });
      if (c.response === 2) return { canceled: true };
      withAttachments = c.response === 0;
    }
    const safe = String(p.name || 'project').replace(/[\\/:*?"<>|]/g, ' ').trim().slice(0, 60) || 'project';
    const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), `${safe}.freative`), filters: [{ name: 'FREATIVE 프로젝트', extensions: ['freative'] }] });
    if (r.canceled || !r.filePath) return { canceled: true };
    const buf = await pkg.exportPackage(id, { withAttachments, by: (p.brief && p.brief.worker) || user.name || '', appVersion: app.getVersion(), knowledgeVersion: knowledge.status().version });
    fs.writeFileSync(r.filePath, buf);
    shell.showItemInFolder(r.filePath);
    return { file: r.filePath, bytes: buf.length, withAttachments };
  });
  h('projects:importPackage', async (paths) => {
    const user = await guard('project:create');
    let files = (paths || []).filter((f) => /\.freative$/i.test(f));
    if (!files.length) {
      const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'FREATIVE 프로젝트', extensions: ['freative'] }] });
      if (r.canceled) return { canceled: true, projects: [] };
      files = r.filePaths;
    }
    const projects = [], errors = [];
    for (const f of files) {
      try { const p = await pkg.importPackage(fs.readFileSync(f), user); projects.push({ id: p.id, name: p.name }); }
      catch (e) { errors.push({ file: path.basename(f), error: e.message }); }
    }
    return { projects, errors };
  });

  h('run:start', async (id) => { const p = meta(id); await guard('run:execute', p); return orchestrator.start(id, emit); });
  h('run:answerBrief', async (id, answers) => { const p = meta(id); await guard('run:execute', p); return orchestrator.answerBrief(id, answers, emit); });
  h('run:answerRoot', async (id, ans) => { const p = meta(id); await guard('run:execute', p); return orchestrator.answerRoot(id, ans, emit); });
  h('run:answerReview', async (id, ans) => { const p = meta(id); await guard('run:execute', p); return orchestrator.answerReview(id, ans, emit); });
  h('run:gate', async (id, decision, note) => { const p = meta(id); await guard('run:execute', p); return orchestrator.gate(id, decision, note, emit); });
  h('run:cancel', async (id) => orchestrator.cancel(id));
  h('run:inspire', async (id, stage, text) => { const p = meta(id); await guard('run:execute', p); return orchestrator.inspire(id, stage, text, emit); });

  h('library:list', async () => library.list());
  h('library:extract', async (kind, paths) => { await guard('settings:manage'); return library.extract(kind, paths || []); });
  h('library:save', async (kind, items, title) => { await guard('settings:manage'); return library.save(kind, items, title); });
  h('library:toggle', async (id, on) => { await guard('settings:manage'); return library.toggle(id, on); });
  h('library:remove', async (id) => { await guard('settings:manage'); return library.remove(id); });
  h('library:open', async () => shell.openPath(library.dir()));
  h('library:catalog', async () => { const k = knowledge.load(); return { isms: k.isms.map(({ body, ...r }) => r), knowhow: k.knowhow, brain: k.brain }; });
  h('usage:summary', async () => cost.summary());
  h('run:regenerateImage', async (id, idx) => { const p = meta(id); await guard('run:execute', p); return orchestrator.regenerateImage(id, idx, emit); });

  h('updater:check', async () => updater.check());
  h('updater:install', async () => updater.install());
}

module.exports = { register };
