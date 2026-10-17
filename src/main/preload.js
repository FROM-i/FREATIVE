'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (ch, ...a) => ipcRenderer.invoke(ch, ...a);
const on = (ch, cb) => {
  const h = (_e, payload) => cb(payload);
  ipcRenderer.on(ch, h);
  return () => ipcRenderer.removeListener(ch, h);
};

contextBridge.exposeInMainWorld('api', {
  app: {
    info: () => invoke('app:info'),
    openPath: (p) => invoke('app:openPath', p),
    openExternal: (u) => invoke('app:openExternal', u),
  },
  auth: {
    current: () => invoke('auth:current'),
  },
  settings: {
    get: () => invoke('settings:get'),
    set: (patch) => invoke('settings:set', patch),
    setSecret: (key, value) => invoke('settings:setSecret', key, value),
    testKey: () => invoke('settings:testKey'),
    listModels: () => invoke('settings:listModels'),
    models: () => invoke('settings:models'),
    modelsMode: (follow) => invoke('settings:modelsMode', follow),
    discoverModels: () => invoke('settings:discoverModels'),
  },
  knowledge: {
    status: () => invoke('knowledge:status'),
    sync: () => invoke('knowledge:sync'),
    types: () => invoke('knowledge:types'),
    isms: () => invoke('knowledge:isms'),
    onEvent: (cb) => on('knowledge:event', cb),
  },
  files: {
    pick: () => invoke('files:pick'),
    inspect: (paths) => invoke('files:inspect', paths),
    pathFor: (file) => { try { return webUtils.getPathForFile(file); } catch { return null; } },
  },
  projects: {
    list: () => invoke('projects:list'),
    get: (id) => invoke('projects:get', id),
    create: (brief, attachments) => invoke('projects:create', brief, attachments),
    remove: (id) => invoke('projects:remove', id),
    exportReport: (id) => invoke('projects:export', id),
    duplicate: (id) => invoke('projects:duplicate', id),
    exportPpt: (id, force) => invoke('projects:exportPpt', id, force),
  },
  run: {
    start: (id) => invoke('run:start', id),
    answerBrief: (id, answers) => invoke('run:answerBrief', id, answers),
    answerRoot: (id, ans) => invoke('run:answerRoot', id, ans),
    answerReview: (id, ans) => invoke('run:answerReview', id, ans),
    gate: (id, decision, note) => invoke('run:gate', id, decision, note),
    cancel: (id) => invoke('run:cancel', id),
    inspire: (id, stage, text) => invoke('run:inspire', id, stage, text),
    regenerateImage: (id, exampleIndex) => invoke('run:regenerateImage', id, exampleIndex),
    onEvent: (cb) => on('run:event', cb),
  },
  library: {
    list: () => invoke('library:list'),
    extract: (kind, paths) => invoke('library:extract', kind, paths),
    save: (kind, items, title) => invoke('library:save', kind, items, title),
    toggle: (id, on) => invoke('library:toggle', id, on),
    remove: (id) => invoke('library:remove', id),
    open: () => invoke('library:open'),
    catalog: () => invoke('library:catalog'),
  },
  usage: { summary: () => invoke('usage:summary') },
  updater: {
    check: () => invoke('updater:check'),
    install: () => invoke('updater:install'),
    onEvent: (cb) => on('updater:event', cb),
  },
});
