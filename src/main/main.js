'use strict';
/**
 * THE FROM FREATIVE — Electron main process
 *
 * 구성
 *  - settings      : API 키(암호화)·모델·지식 저장소 설정
 *  - knowledge     : 방법론(스킬)·프롬프트를 GitHub에서 동기화 (앱 재설치 없이 업데이트)
 *  - store         : 프로젝트·실행 기록 저장 (지금은 로컬, 이후 중앙 저장소로 교체 가능)
 *  - auth          : 사용자·조직·팀·권한 (지금은 로컬 단일 사용자, 이후 중앙 로그인으로 교체)
 *  - orchestrator  : 메인 모델(화가)이 서브 모델(조수)들을 지휘하는 Creative Travel 실행기
 *  - updater       : 앱 본체 자동 업데이트 (GitHub Releases)
 */
const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const isMock = process.argv.includes('--mock') || process.env.CT_MOCK === '1';
const isDev = process.argv.includes('--dev');

// 프로젝트 파일(생성 이미지 등)을 렌더러에서 안전하게 보여주기 위한 전용 스킴
protocol.registerSchemesAsPrivileged([
  { scheme: 'ct', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

if (process.env.CT_USER_DATA) app.setPath('userData', process.env.CT_USER_DATA);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#F4F2EC',
    title: 'THE FROM FREATIVE',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  // 외부 링크는 기본 브라우저로
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
  return mainWindow;
}

const singleLock = app.requestSingleInstanceLock();
if (!singleLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });

  app.whenReady().then(async () => {
    const settings = require('./settings');
    const knowledge = require('./knowledge');
    const store = require('./services/storage');
    const ipc = require('./ipc');

    settings.init();
    store.init();
    knowledge.init();

    // ct://project/<id>/<path> → 프로젝트 폴더 파일
    protocol.handle('ct', (request) => {
      const u = new URL(request.url);
      const parts = decodeURIComponent(u.pathname).split('/').filter(Boolean);
      if (u.hostname === 'project' && parts.length >= 2) {
        const file = store.resolveProjectFile(parts[0], parts.slice(1).join('/'));
        if (file) return net.fetch(pathToFileURL(file).toString());
      }
      return new Response('not found', { status: 404 });
    });

    const win = createWindow();
    ipc.register(win, { isMock });

    // 지식(방법론·프롬프트) 자동 동기화 — 실패해도 내장본으로 동작
    if (settings.get().knowledge.autoSync && !isMock) {
      knowledge.sync().then((r) => win.webContents.send('knowledge:event', r)).catch(() => {});
    }
    // 앱 본체 업데이트 확인 (패키징된 앱에서만)
    if (app.isPackaged && !isMock) require('./updater').init(win);

    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
