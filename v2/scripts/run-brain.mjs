#!/usr/bin/env node
// 화면 없이 브레인을 돌린다 — 프로젝트 파일(json)을 받아 Claude API로 분석하고 결과와 보고서를 쓴다.
// MCP 서버나 사내 자동화가 부를 자리다. 엔진은 화면과 같은 것을 쓴다.
//
//   node scripts/run-brain.mjs 프로젝트.json --check          파일만 검사한다 (API를 부르지 않는다)
//   ANTHROPIC_API_KEY=sk-ant-… node scripts/run-brain.mjs 프로젝트.json [--out 폴더] [--auto-issues]
//
// 이슈가 비어 있으면 멈추고 근본 이슈 후보를 보여 준다. 근본 이슈는 사람이 고른다.
// --auto-issues 를 주면 목적과 성공 기준을 다 덮는 후보를 스스로 골라 진행한다.
import fs from 'node:fs'; import path from 'node:path';
import { newProject, validateProject } from '../js/graph/model.js';
import { think, proposeIssues } from '../js/engine/think.js';
import { reportMarkdown } from '../js/engine/report.js';
import { createAnthropic } from '../js/providers/anthropic.js';
import { validFacts } from '../knowledge/facts.js';

const args = process.argv.slice(2); const file = args.find((a) => !a.startsWith('--'));
const flag = (name) => args.includes(`--${name}`); const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
if (!file) { console.error('사용: node scripts/run-brain.mjs 프로젝트.json [--check] [--out 폴더] [--auto-issues]'); process.exit(2); }
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const project = newProject(raw.project || raw);   // 실행 기록({ project, log })도 받는다

const report = () => {
  const v = validateProject(project); const f = validFacts(project);
  console.log(`프로젝트: ${project.title}`); console.log(`분류: ${(project.categories || []).join(', ') || '없음'} · 이슈 ${project.issues.length}건 · 팩트 ${f.facts.length}건(출처 조건에 걸려 받지 않은 것 ${f.rejected}건)`);
  for (const p of v.problems) console.log(`  빠진 것 — ${p.where}: ${p.what}`);
  return v;
};
const v = report();
if (flag('check')) process.exit(v.problems.length ? 1 : 0);

const key = process.env.ANTHROPIC_API_KEY;
if (!key) { console.error('ANTHROPIC_API_KEY가 없다. --check 로 파일만 검사할 수 있다.'); process.exit(2); }
const provider = createAnthropic({ models: { lead: process.env.BRAIN_LEAD_MODEL || undefined, support: process.env.BRAIN_SUPPORT_MODEL || undefined } }, { getKey: () => key });

if (!project.issues.some((i) => i.root && i.title)) {
  const proposed = await proposeIssues(project, provider);
  console.log('\n근본 이슈 후보'); for (const c of proposed.filter((x) => x.root)) console.log(`  - ${c.title}${c.misses ? `  [못 덮는 것: ${c.misses}]` : ''}`);
  if (!flag('auto-issues')) { console.log('\n근본 이슈를 프로젝트 파일의 issues에 넣고 다시 실행한다. 자동으로 고르려면 --auto-issues'); process.exit(3); }
  const root = proposed.find((x) => x.root && !x.misses) || proposed.find((x) => x.root);
  project.issues = [{ id: 'I1', root: true, title: root.title, detail: root.detail, test: root.test, tags: [] }, ...proposed.filter((x) => !x.root).slice(0, 2).map((x, n) => ({ id: `I${n + 2}`, root: false, title: x.title, detail: x.detail, test: '', tags: [] }))];
  console.log(`\n고른 근본 이슈: ${root.title}`);
}

project.run = await think(project, provider, { onEvent: (e) => { if (e.type === 'stage') console.log(`  단계: ${e.stage}`); } });
const out = opt('out') || path.dirname(file); fs.mkdirSync(out, { recursive: true });
const base = path.join(out, path.basename(file, '.json'));
fs.writeFileSync(`${base}.result.json`, JSON.stringify(project, null, 1));
fs.writeFileSync(`${base}.report.md`, reportMarkdown(project));
console.log(`\n끝 — 호출 ${project.run.calls}회. 인사이트 ${project.run.insights.length}건`);
for (const n of project.run.insights) console.log(`  ${n.id} [${n.from?.verdict || '-'}] ${n.title}`);
console.log(`결과: ${base}.result.json (화면의 "프로젝트 가져오기"로 연다)\n보고서: ${base}.report.md`);
