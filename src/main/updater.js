'use strict';
/**
 * 앱 본체 자동 업데이트 — GitHub Releases (electron-builder publish 설정의 저장소).
 * 방법론·프롬프트는 knowledge.js가 따로 동기화하므로, 앱 업데이트는 코드가 바뀔 때만 필요하다.
 * macOS 자동 업데이트는 서명·공증된 앱에서만 동작한다(docs/RELEASE.md).
 */
const path = require('path');
const { execFileSync } = require('child_process');
const RELEASES = 'https://github.com/FROM-i/FREATIVE/releases/latest';
let autoUpdater = null;
let manual = false;
let win = null;

function send(payload) { if (win && !win.isDestroyed()) win.webContents.send('updater:event', payload); }

function init(w) {
  win = w;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) { return; }
  // macOS 자동 설치는 Apple 개발자 서명이 있어야 한다. 임시 서명(ad-hoc) 앱은 새 버전을 알리고 내려받기 링크를 준다
  manual = process.platform === 'darwin' && isAdhoc();
  autoUpdater.autoDownload = !manual;
  autoUpdater.autoInstallOnAppQuit = !manual;
  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
  autoUpdater.on('update-available', (i) => send(manual ? { state: 'manual', version: i.version, url: RELEASES } : { state: 'available', version: i.version }));
  autoUpdater.on('update-not-available', (i) => send({ state: 'latest', version: i.version }));
  autoUpdater.on('download-progress', (p) => send({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => send({ state: 'ready', version: i.version }));
  autoUpdater.on('error', (e) => send({ state: 'error', message: String(e && e.message || e).slice(0, 200) }));
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 4000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
}

function isAdhoc() {
  try {
    const appPath = path.resolve(process.execPath, '../../..');
    const out = execFileSync('codesign', ['-dv', appPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return /Signature=adhoc/.test(out);
  } catch (e) {
    const msg = String((e && (e.stderr || e.message)) || '');
    return /Signature=adhoc|not signed/.test(msg) || !/Authority=Developer ID/.test(msg);
  }
}

async function check() {
  if (!autoUpdater) return { state: 'dev', message: '개발 실행에서는 앱 업데이트를 확인하지 않습니다' };
  const r = await autoUpdater.checkForUpdates();
  return { state: 'checked', version: r && r.updateInfo && r.updateInfo.version };
}

function install() { if (autoUpdater) autoUpdater.quitAndInstall(); }

module.exports = { init, check, install };
