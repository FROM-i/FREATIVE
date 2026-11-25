import fs from 'node:fs';
const C = await import('/home/claude/from-i/freative/v2/knowledge/criteria.js');
const run = JSON.parse(fs.readFileSync('bridge/4x/RESULT.json', 'utf8')).project.run;
const brief = fs.readFileSync('brief4.md', 'utf8');
const cards = [...run.baseline.concepts.map((c) => ({ arm: 'base', src: c.id, title: c.title, concept: c.concept, visual: c.visual, gain: '' })),
  ...run.insights.map((n) => ({ arm: 'brain', src: n.id, title: n.title, concept: n.concept, visual: n.visual, gain: `${n.substitute.who} ${n.substitute.changes}`.trim() }))];
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const shuffle = (a, seed) => { const r = rng(seed); const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const key = {};
const REQ = (n) => `# 평가 과제 (판정자 ${n})

너는 브랜드 · 서비스 기획과 디자인 안을 심사하는 판정자다. 아래 브리프에 대해 서로 다른 방법으로 만든 안 ${cards.length}개가 무작위 순서로 주어진다. 어느 안이 어떤 방법으로 만들어졌는지는 알려 주지 않는다. 글의 말투나 길이로 판정하지 말고 내용만 본다.

${C.criteriaBlock()}

## 답할 것
- 안마다 차별화와 실효성의 수준을 고르고, 그렇게 본 이유를 각각 한두 문장으로 쓴다. 수준은 위에 적힌 이름 그대로 쓴다.
- 안끼리 견주어 판정한다. 전부 같은 수준을 주지 않는다. 다르기만 한 안에 "차별화됨"을 주지 않는다. "목적 초과"는 더 얻는 것이 무엇이고 왜 생기는지 그 안에서 읽힐 때만 준다.
- groups: 핵심 해법이 사실상 같은 안끼리 묶는다. 혼자인 안은 1개짜리 묶음.
- rank: 클라이언트에게 내보낼 순서 1~${cards.length}위 (동점 없이).

## 출력
/tmp/eval/judge/H${n}.res.json 에 아래 JSON만 쓴다. 다른 파일은 읽지 않는다. 웹 검색을 쓰지 않는다.
{ "cards": { "K1": { "differentiation": "${C.DIFFERENTIATION.levels.join('|')}", "diff_why": "", "effectiveness": "${C.EFFECTIVENESS.levels.join('|')}", "eff_why": "" } }, "groups": [ ["K1","K4"], ["K2"] ], "rank": ["K3","K1"] }

## 브리프
${brief}

## 안 ${cards.length}개
`;
[[1, 17], [2, 59], [3, 83]].forEach(([n, seed]) => { const order = shuffle(cards, seed); key[`H${n}`] = Object.fromEntries(order.map((c, k) => [`K${k + 1}`, { arm: c.arm, src: c.src }]));
  fs.writeFileSync(`judge/H${n}.req.md`, REQ(n) + order.map((c, k) => `### K${k + 1} — ${c.title}\n- 컨셉: ${c.concept}\n- 보이는 표현: ${c.visual}${c.gain ? `\n- 사용자에게 달라지는 것: ${c.gain}` : ''}\n`).join('\n')); });
fs.writeFileSync('judge/KEY4.json', JSON.stringify(key, null, 1)); fs.writeFileSync('judge/cards4.json', JSON.stringify(cards, null, 1));
console.log(cards.map((c) => `${c.arm} ${c.src} 컨셉${c.concept.length} 표현${c.visual.length} | ${c.title}`).join('\n'));
