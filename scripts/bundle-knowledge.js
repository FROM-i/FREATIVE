#!/usr/bin/env node
/**
 * 빌드 전: manifest.json의 '@skill/' 파일(스킬 저장소 원본)을 knowledge/skill/ 로 가져와 설치본에 내장한다.
 * 스킬 원본은 스킬 저장소(FROM-i/thefrom_design_Skill)에만 있다 — 이 저장소에 커밋하지 않는다.
 *
 * 가져오는 순서
 *   1) 환경 변수 SKILL_DIR — 스킬 저장소 로컬 클론 경로
 *   2) 옆 폴더 ../thefrom_design_Skill (또는 ../thefrom_design_skill)
 *   3) GitHub raw 내려받기 (SKILL_REPO, SKILL_BRANCH, 비공개면 GITHUB_TOKEN)
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const K = path.join(APP, 'knowledge');
const manifest = JSON.parse(fs.readFileSync(path.join(K, 'manifest.json'), 'utf8'));
const REPO = process.env.SKILL_REPO || 'FROM-i/thefrom_design_Skill';
const BRANCH = process.env.SKILL_BRANCH || 'main';

function localSkillDir() {
  const cands = [process.env.SKILL_DIR, path.resolve(APP, '../thefrom_design_Skill'), path.resolve(APP, '../thefrom_design_skill')].filter(Boolean);
  return cands.find((d) => fs.existsSync(path.join(d, 'plugins', 'thefrom-ux')));
}

async function getText(rel, dir) {
  if (dir) return fs.readFileSync(path.join(dir, rel), 'utf8');
  const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${rel}`;
  let r = await fetch(url);
  // 비공개 저장소면 토큰으로 다시
  if (!r.ok && process.env.GITHUB_TOKEN) r = await fetch(url, { headers: { Authorization: `token ${process.env.GITHUB_TOKEN}` } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

(async () => {
  const dir = localSkillDir();
  console.log(`skill source: ${dir || `https://github.com/${REPO} (${BRANCH})`}`);
  let n = 0;
  for (const [local, src] of Object.entries(manifest.files)) {
    if (!src.startsWith('@skill/')) continue;
    const text = await getText(src.slice(7), dir);
    const dest = path.join(K, local);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, text, 'utf8');
    n++;
  }
  try {
    const pj = JSON.parse(await getText(manifest.skillVersionFrom.slice(7), dir));
    manifest.skillVersion = pj.version;
    fs.writeFileSync(path.join(K, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  } catch { /* noop */ }
  console.log(`bundled ${n} skill files → knowledge/skill (skill v${manifest.skillVersion || '?'})`);
})().catch((e) => { console.error('스킬 원본을 가져오지 못했습니다:', e.message); process.exit(1); });
