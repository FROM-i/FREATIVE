'use strict';
/**
 * macOS 임시(ad-hoc) 서명 — Apple 개발자 인증서가 없을 때.
 * electron-builder가 패키징하며 Electron 본체를 고치면 원래 서명이 깨진다. Apple Silicon은 서명이 깨진 앱을
 * "손상되었기 때문에 열 수 없습니다"로 막는다. 임시 서명을 다시 해 두면 "확인되지 않은 개발자" 경고로 바뀌고,
 * 시스템 설정 › 개인정보 보호 및 보안 › "그래도 열기"로 열 수 있다.
 * 정식 인증서(CSC_LINK)가 있으면 electron-builder가 정식 서명·공증을 하므로 여기서는 아무것도 하지 않는다.
 */
const path = require('path');
const { execFileSync } = require('child_process');

exports.default = async function adhocSign(ctx) {
  if (ctx.electronPlatformName !== 'darwin') return;
  if (process.env.CSC_LINK || process.env.MAC_SIGNED === '1') return;
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  console.log(`  • ad-hoc signing  ${app}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' });
  console.log(`::notice::macOS 임시 서명 확인 완료 — ${path.basename(app)} (${ctx.arch === 3 ? 'arm64' : ctx.arch === 1 ? 'x64' : ctx.arch})`);
};
