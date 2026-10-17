'use strict';
/**
 * 앱 본체 자동 업데이트 — GitHub Releases (electron-builder publish 설정의 저장소).
 * 방법론·프롬프트는 knowledge.js가 따로 동기화하므로, 앱 업데이트는 코드가 바뀔 때만 필요하다.
 *
 * Windows: electron-updater가 내려받고 설치한다.
 * macOS: electron-updater(Squirrel.Mac)는 Apple 개발자 서명이 있어야 설치한다. 지금 앱은 임시 서명(ad-hoc)이라
 *   새 버전 확인만 electron-updater로 하고, 내려받기·교체는 직접 한다 —
 *   zip을 내려받아 sha512를 맞춰 보고, 앱을 끈 뒤 /Applications의 앱을 새 앱으로 바꾸고 다시 연다.
 *   앱이 직접 내려받은 파일에는 격리 속성(quarantine)이 붙지 않아 '손상됨' 경고도 나오지 않는다.
 *   앱 폴더에 쓸 수 없으면(디스크 이미지에서 실행, 앱 이동 격리 등) 내려받기 링크로 안내한다.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync, spawn, spawnSync } = require('child_process');
const { app, net } = require('electron');
const REPO = 'FROM-i/FREATIVE';
const RELEASES = `https://github.com/${REPO}/releases/latest`;
let autoUpdater = null;
let mac = false;          // 직접 교체 방식(macOS 임시 서명)
let win = null;
let staged = null;        // { version, appPath } — 교체 준비가 끝난 새 앱
let busy = null;          // 진행 중인 내려받기 버전

function send(payload) { if (win && !win.isDestroyed()) win.webContents.send('updater:event', payload); }

function init(w) {
  win = w;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (e) { return; }
  mac = process.platform === 'darwin' && isAdhoc();
  // 0.4.1~0.5.0이 Squirrel로 받다 실패하고 남긴 캐시 — 직접 교체 방식에서는 쓰지 않는다
  if (mac) { try { fs.rmSync(path.join(require('os').homedir(), 'Library/Caches/kr.thefrom.freative.ShipIt'), { recursive: true, force: true }); } catch (e) { /* 없으면 그만 */ } }
  autoUpdater.autoDownload = !mac;
  autoUpdater.autoInstallOnAppQuit = !mac;
  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
  autoUpdater.on('update-available', (i) => {
    if (!mac) return send({ state: 'available', version: i.version });
    macDownload(i).catch((e) => send({ state: 'manual', version: i.version, url: RELEASES, message: `자동 내려받기 실패 — ${String(e.message || e).slice(0, 120)}` }));
  });
  autoUpdater.on('update-not-available', (i) => send({ state: 'latest', version: i.version }));
  autoUpdater.on('download-progress', (p) => send({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => send({ state: 'ready', version: i.version }));
  autoUpdater.on('error', (e) => send({ state: 'error', message: String(e && e.message || e).slice(0, 200) }));
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 4000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
}

/**
 * Apple 개발자 서명(Developer ID)이 없으면 직접 교체 방식을 쓴다.
 * 주의: `codesign -dv`는 정보를 stdout이 아니라 stderr로 낸다 — stdout만 보면 늘 '서명 있음'으로 오판한다(0.3.4~0.5.0의 버그).
 */
function isAdhoc() {
  const r = spawnSync('codesign', ['-dv', '--verbose=2', bundlePath()], { encoding: 'utf8' });
  return !hasDeveloperId(`${r.stdout || ''}\n${r.stderr || ''}`);
}
function hasDeveloperId(codesignOutput) { return /Authority=Developer ID Application/.test(String(codesignOutput || '')); }

/** /Applications/THE FROM FREATIVE.app */
function bundlePath() { return path.resolve(process.execPath, '../../..'); }

/** 앱을 제자리에서 바꿀 수 있는가 — 디스크 이미지·앱 이동 격리·쓰기 권한 없음이면 못 바꾼다 */
function replaceable() {
  const p = bundlePath();
  if (!/\.app$/.test(p) || /\/AppTranslocation\//.test(p) || /^\/Volumes\//.test(p)) return false;
  try { fs.accessSync(path.dirname(p), fs.constants.W_OK); fs.accessSync(p, fs.constants.W_OK); return true; } catch (e) { return false; }
}

function newer(a, b) {
  const pa = String(a || '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
}

async function macDownload(info) {
  const version = info.version;
  if (staged && staged.version === version) return send({ state: 'ready', version });
  if (busy === version) return;
  if (!replaceable()) return send({ state: 'manual', version, url: RELEASES, message: '앱을 응용 프로그램 폴더로 옮기면 다음부터 자동으로 업데이트됩니다' });
  const file = (info.files || []).find((f) => /\.zip$/.test(f.url) && f.url.includes(`-${process.arch}.`));
  if (!file) throw new Error(`${process.arch}용 zip이 릴리스에 없습니다`);
  busy = version;
  try {
    const dest = bundlePath();
    const work = path.join(path.dirname(dest), `.freative-update-${version}`);
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });
    const zip = path.join(work, 'app.zip');
    const url = /^https?:/.test(file.url) ? file.url : `https://github.com/${REPO}/releases/download/v${version}/${file.url}`;
    await fetchTo(url, zip, file.size, file.sha512);
    send({ state: 'downloading', percent: 100, message: '압축을 푸는 중' });
    execFileSync('ditto', ['-x', '-k', zip, work]);
    fs.rmSync(zip, { force: true });
    const name = fs.readdirSync(work).find((n) => n.endsWith('.app'));
    if (!name) throw new Error('zip 안에 앱이 없습니다');
    const appPath = path.join(work, name);
    try { execFileSync('xattr', ['-cr', appPath]); } catch (e) { /* 격리 속성이 없으면 그대로 */ }
    execFileSync('codesign', ['--verify', '--deep', appPath]); // 임시 서명이 온전한지
    staged = { version, appPath, work };
    send({ state: 'ready', version });
  } finally { busy = null; }
}

async function fetchTo(url, out, size, sha512) {
  const res = await net.fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`내려받기 ${res.status}`);
  const total = Number(res.headers.get('content-length')) || size || 0;
  const hash = crypto.createHash('sha512');
  const fd = fs.openSync(out, 'w');
  let got = 0, last = -1;
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const buf = Buffer.from(value);
      hash.update(buf); fs.writeSync(fd, buf); got += buf.length;
      const pct = total ? Math.floor((got / total) * 100) : 0;
      if (pct !== last) { last = pct; send({ state: 'downloading', percent: Math.min(99, pct) }); }
    }
  } finally { fs.closeSync(fd); }
  if (sha512 && hash.digest('base64') !== sha512) throw new Error('내려받은 파일이 손상되었습니다(sha512 불일치)');
}

/** 앱을 끄고 → 기존 앱을 새 앱으로 바꾸고 → 다시 연다 */
function macInstall() {
  const dest = bundlePath();
  const sh = path.join(staged.work, 'install.sh');
  fs.writeFileSync(sh, `#!/bin/bash
PID="$1"; NEW="$2"; DEST="$3"; WORK="$4"
for i in $(seq 1 100); do kill -0 "$PID" 2>/dev/null || break; sleep 0.2; done
rm -rf "$DEST.old"
if mv "$DEST" "$DEST.old" && mv "$NEW" "$DEST"; then
  xattr -cr "$DEST" 2>/dev/null
  rm -rf "$DEST.old" "$WORK"
else
  [ -d "$DEST" ] || mv "$DEST.old" "$DEST"
fi
open "$DEST"
`, { mode: 0o755 });
  const child = spawn('/bin/bash', [sh, String(process.pid), staged.appPath, dest, staged.work], { detached: true, stdio: 'ignore' });
  child.unref();
  setTimeout(() => app.quit(), 200);
}

async function check() {
  if (!autoUpdater) return { state: 'dev', message: '개발 실행에서는 앱 업데이트를 확인하지 않습니다' };
  const r = await autoUpdater.checkForUpdates();
  const latest = r && r.updateInfo && r.updateInfo.version;
  const current = app.getVersion();
  if (latest && newer(latest, current)) {
    return { state: 'available', version: latest, current, message: `새 버전 v${latest}이 있습니다 (지금 v${current}) — 내려받는 중입니다` };
  }
  return { state: 'latest', version: current, message: `최신 버전입니다 (v${current})` };
}

function install() {
  if (mac) { if (staged) macInstall(); return; }
  if (autoUpdater) autoUpdater.quitAndInstall();
}

module.exports = { init, check, install, _test: { newer, hasDeveloperId } };
