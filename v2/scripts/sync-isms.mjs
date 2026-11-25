#!/usr/bin/env node
/**
 * 스킬 저장소의 사조 카탈로그(catalog-ism.md)에서 Airplane 노드를 만든다.
 * 방법론의 원본은 스킬 저장소 하나다 — 이 스크립트는 읽기만 한다.
 *   node scripts/sync-isms.mjs [catalog-ism.md 경로]
 * 경로를 주지 않으면 옆 폴더(../../thefrom_design_Skill)에서 찾고, 없으면 GitHub raw에서 받는다.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const REL = 'plugins/thefrom-ux/skills/thefrom-ux/references/catalog-ism.md';
const RAW = `https://raw.githubusercontent.com/FROM-i/thefrom_design_Skill/main/${REL}`;

async function load() {
  const arg = process.argv[2];
  const local = arg || path.resolve(here, '../../../thefrom_design_Skill', REL);
  if (existsSync(local)) return { text: await readFile(local, 'utf8'), from: local };
  const r = await fetch(RAW);
  if (!r.ok) throw new Error(`카탈로그를 받지 못했습니다: ${r.status}`);
  return { text: await r.text(), from: RAW };
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
// 다시 만들기: node scripts/sync-isms.mjs
export const ISMS = ${JSON.stringify(isms, null, 2)};

export const OPPOSITIONS = ${JSON.stringify(oppositions, null, 2)};
`;
await writeFile(path.resolve(here, '../knowledge/isms.js'), out);
console.log(`사조 ${isms.length}건 · 대립 쌍 ${oppositions.length}건 ← ${from}`);
