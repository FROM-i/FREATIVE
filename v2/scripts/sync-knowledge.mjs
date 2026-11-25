#!/usr/bin/env node
/**
 * 스킬 저장소의 원문에서 노드의 지식을 만든다.
 *   catalog-ism.md → knowledge/isms.js   사조 카드 원문 전체(card)와 원리·가져올 것·두고 올 것
 *   core.md        → knowledge/core.js   아이덴티티·터널·에어플레인 규칙의 원문 절
 * 노드는 요약이 아니라 원문을 읽고 생각한다. 방법론의 원본은 스킬 저장소 하나다 — 이 스크립트는 읽기만 한다.
 *   node scripts/sync-knowledge.mjs [스킬 저장소 경로]
 * 경로를 주지 않으면 옆 폴더(../../thefrom_design_Skill)에서 찾고, 없으면 GitHub raw에서 받는다.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'plugins/thefrom-ux/skills/thefrom-ux/references';
const REL = `${BASE}/catalog-ism.md`;
const repo = process.argv[2] || path.resolve(here, '../../../thefrom_design_Skill');

async function load(rel = REL) {
  const local = path.join(repo, rel);
  if (existsSync(local)) return { text: await readFile(local, 'utf8'), from: local };
  const raw = `https://raw.githubusercontent.com/FROM-i/thefrom_design_Skill/main/${rel}`;
  const r = await fetch(raw);
  if (!r.ok) throw new Error(`원문을 받지 못했습니다: ${r.status} ${raw}`);
  return { text: await r.text(), from: raw };
}

const clean = (s) => s.replace(/\*\*/g, '').replace(/\s*\(→[^)]*\)/g, '').replace(/`/g, '').trim();
const bullets = (block) => block.split('\n').filter((l) => /^- /.test(l)).map((l) => clean(l.slice(2)));

function section(card, label) {
  const m = card.match(new RegExp(`\\*\\*${label}\\*\\*[^\\n]*\\n([\\s\\S]*?)(?=\\n\\*\\*[^*\\n]+\\*\\*|\\n###|$)`));
  return m ? m[1] : '';
}

const { text, from } = await load();
const cards = text.split(/\n(?=## `ISM-)/).filter((c) => c.startsWith('## `ISM-'));
const isms = cards.map((card) => {
  const head = card.match(/^## `(ISM-[A-Z]+)` · ([^\n]+)/);
  const name = head[2].replace(/\s*\([^)]*\)\s*/g, '').replace(/—.*$/, '').replace(/\/.*$/, '').trim();
  const summary = (card.match(/\*\*요약\*\*\s*([^\n]+)/) || [])[1] || '';
  return {
    id: head[1], family: 'airplane', name,
    card: card.replace(/\n---\s*$/, '').trim(),   // 카드 원문 전체 — 노드는 이것을 읽고 생각한다
    summary: clean(summary),
    principles: bullets(section(card, '원리')),
    take: bullets(section(card, '가져올 것')),
    leave: bullets(section(card, '두고 올 것')),
  };
});

// A-99 교차 참조 — 같은 쟁점에 반대 답을 내는 사조 쌍
const a99 = text.split(/\n## A-99\./)[1] || '';
const oppositions = [...a99.matchAll(/^\| ([^|]+) \| `(ISM-[A-Z]+)` ([^|]+) \| `(ISM-[A-Z]+)` ([^|]+) \|$/gm)]
  .map((m) => ({ issue: m[1].trim(), a: m[2], aSays: clean(m[3]), b: m[4], bSays: clean(m[5]) }));

const bad = isms.filter((i) => !i.principles.length || !i.take.length || !i.leave.length);
if (bad.length) throw new Error(`칸이 빈 사조: ${bad.map((b) => b.id).join(', ')}`);

const out = `// 자동 생성 — 직접 고치지 않는다. 원본: FROM-i/thefrom_design_Skill · ${REL}
// 다시 만들기: node scripts/sync-knowledge.mjs
export const ISMS = ${JSON.stringify(isms, null, 2)};

export const OPPOSITIONS = ${JSON.stringify(oppositions, null, 2)};
`;
await writeFile(path.resolve(here, '../knowledge/isms.js'), out);
console.log(`사조 ${isms.length}건 · 대립 쌍 ${oppositions.length}건 ← ${from}`);

// ---------- core.md → 노드가 읽는 원문 절 ----------
const core = (await load(`${BASE}/core.md`)).text;
/** 제목으로 시작하는 절 하나 — 같은 수준 이상의 다음 제목 앞까지. until을 주면 그 줄 앞에서 끊는다. */
function part(heading, until) {
  const lines = core.split('\n');
  const start = lines.findIndex((l) => l.startsWith(heading));
  if (start < 0) throw new Error(`core.md에 없는 절: ${heading}`);
  const level = heading.match(/^#+/)[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+) /);
    if ((until && lines[i].startsWith(until)) || (m && m[1].length <= level)) { end = i; break; }
  }
  return lines.slice(start, end).join('\n').replace(/\n---\s*$/, '').trim();
}
const CORE = {
  'ID-FROM': part('## 1. 이름', '### 1.1'),
  'ID-JAMAIS': [part('### 6.2 자메뷰'), part('### 6.3 통렬함의 판정', '판정은 두 단으로')].join('\n\n'),
  'ID-INERTIA': part('### 6.1 G3과 G4는 서로 당긴다'),
  'ID-ONEU': [part('### 2.2 설계 단위로서의 1U', '### 2.2.1'), part('### 2.2.4 1U는 보이지 않는 뼈대다'), part('### 2.3 1U가 하는 일')].join('\n\n'),
  'ID-YELLOW': part('### 노랑의 의미'),
  'ID-BENEFIT': part('### 6.4 G4의 판정', '**G3과 G4 ①의 구분.**'),
  'ID-N7': part('### 1.1 철학은 판단의 방법이지'),
  tunnel: part('## 5. Tunnel Effect'),
  airplane: [part('### 4.1 정의'), part('### 4.2 "근본 있는"이 제약이다', '#### 반대 대상 표기 형식')].join('\n\n'),
};
await writeFile(path.resolve(here, '../knowledge/core.js'), `// 자동 생성 — 직접 고치지 않는다. 원본: FROM-i/thefrom_design_Skill · ${BASE}/core.md
// 다시 만들기: node scripts/sync-knowledge.mjs
export const CORE = ${JSON.stringify(CORE, null, 2)};
`);
console.log(`core 원문 ${Object.keys(CORE).length}절 · ${Object.values(CORE).reduce((n, t) => n + t.length, 0)}자`);

// ---------- 노하우북 (catalog-form.md PART B) → knowledge/knowhow.js ----------
// 장 단위로 원문을 그대로 옮긴다. 사조가 "왜"라면 노하우북은 "무엇으로, 어떻게"다.
{
  const { text, from } = await load(`${BASE}/catalog-form.md`);
  const start = text.indexOf('\n# PART B'); const end = text.indexOf('\n# PART C');
  const body = text.slice(start, end > 0 ? end : undefined);
  const parts = body.split(/\n(?=## B-\d+\. )/).filter((p) => /^## B-\d+\. /.test(p));
  const chapters = parts.map((p) => {
    const head = p.split('\n')[0];
    const m = head.match(/^## B-(\d+)\. (.+?)(?:\s+—\s+(.+))?$/);
    const prefixes = [...new Set([...p.matchAll(/`([A-Z]{2,6})-(?:\*|[A-Z0-9]+)/g)].map((x) => x[1]))];
    const ids = [...new Set([...p.matchAll(/`([A-Z]{2,6}-[A-Z0-9][A-Z0-9-]*)`/g)].map((x) => x[1]))];
    return { id: `KH-B${m[1]}`, no: +m[1], name: m[2].trim(), note: (m[3] || '').replace(/`/g, '').trim(), prefixes, items: ids.length, text: p.trim() };
  });
  const out = `// 자동 생성 — scripts/sync-knowledge.mjs. 직접 고치지 않는다. 원본: 스킬 저장소 catalog-form.md PART B (Knowhow Book 3권)\n// 노하우북의 장 ${chapters.length}개. 원문 표현을 그대로 둔다.\nexport const KNOWHOW = ${JSON.stringify(chapters, null, 1)};\nexport const knowhowById = (id) => KNOWHOW.find((k) => k.id === id) || null;\n`;
  await writeFile(path.join(here, '../knowledge/knowhow.js'), out);
  console.log(`노하우북 ${chapters.length}장 · 항목 ${chapters.reduce((n, c) => n + c.items, 0)}개 ← ${from}`);
}
