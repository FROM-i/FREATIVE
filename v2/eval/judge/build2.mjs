import fs from 'node:fs';
const V = await import('/home/claude/from-i/freative/v2/knowledge/viewpoint.js');
const { IDENTITY } = await import('/home/claude/from-i/freative/v2/knowledge/nodes.js');
const old = JSON.parse(fs.readFileSync('judge/cards.json', 'utf8'));
const run = JSON.parse(fs.readFileSync('bridge/3x/RESULT.json', 'utf8')).project.run;
const brief = fs.readFileSync('brief.md', 'utf8');
const cards = [...old, ...run.insights.map((n) => ({ arm: '3x', src: `M${n.id.slice(1)}`, title: n.title, concept: n.concept, visual: n.visual, gain: `${n.substitute.who} ${n.substitute.changes}`.trim() }))];
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const shuffle = (a, seed) => { const r = rng(seed); const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const key = {};
const list = (order) => order.map((c, k) => `### K${k + 1} — ${c.title}\n- 컨셉: ${c.concept}\n- 보이는 표현: ${c.visual}\n- 사용자에게 달라지는 것: ${c.gain}\n`).join('\n');
const GEN = (n) => `# 평가 과제 (판정자 ${n})

너는 디지털 서비스 기획·디자인 안을 심사하는 판정자다. 아래 브리프에 대해 서로 다른 방법으로 만든 안 ${cards.length}개가 무작위 순서로 주어진다. 어느 안이 어떤 방법으로 만들어졌는지는 알려 주지 않는다. 글의 말투나 길이로 점수를 주지 말고 내용만 본다.

## 채점 기준 (각 1~5점, 정수)
- 독창성: 이 브리프를 받은 사람 대부분이 떠올릴 안과 얼마나 다른 해석인가. 1 = 누구나 내는 안, 5 = 브리프에서 바로 나오지 않는 새 해석.
- 차별성: 기존 성향 테스트(16Personalities, 푸망 등)와 사용자가 설명 없이 구분할 수 있는가. 1 = 구분 안 됨, 5 = 한눈에 다름.
- 실효성: 브리프의 실패 지점("공유는 해도 납득은 안 된다")을 실제로 푸는가. 제약(토스 안 이질감, 생년월일 비공개, 1~2분 틈)을 지키며 구현할 수 있는가. 1 = 풀지 못함, 5 = 풀고 바로 만들 수 있음.
- 경쟁성: 출시했을 때 선택받을 이유가 있고, 경쟁 서비스가 쉽게 따라 하기 어려운가. 1 = 이유 없음, 5 = 강한 이유와 모방 장벽.

점수는 고르게 나눠 쓴다. 전부 4~5점으로 주지 않는다. 한 기준에서 5점은 최대 3개까지만 준다.

## 추가로 답할 것
- groups: 핵심 아이디어가 사실상 같은 안끼리 묶는다. 혼자인 안은 1개짜리 묶음.
- rank: 종합 순위 1~${cards.length}위 (동점 없이).

## 출력
/tmp/eval/judge/G${n}.res.json 에 아래 JSON만 쓴다. 다른 파일은 읽지 않는다. 웹 검색을 쓰지 않는다.
{ "scores": { "K1": { "독창성": 0, "차별성": 0, "실효성": 0, "경쟁성": 0, "why": "한 줄" } }, "groups": [ ["K1","K4"], ["K2"] ], "rank": ["K3","K1"] }

## 브리프
${brief}

## 안 ${cards.length}개
`;
const FROM = (n) => `# 평가 과제 (더프롬 판정자 ${n})

${V.viewpointBlock(V.SEED_PRECEDENTS, V.WEIGHTS)}

## 과제
아래 브리프에 대해 서로 다른 방법으로 만든 안 ${cards.length}개가 무작위 순서로 주어진다. 어느 안이 어떤 방법으로 만들어졌는지는 알려 주지 않는다.
더프롬의 디렉터로서, **더프롬의 이름으로 클라이언트에게 내보낼 수 있는가**를 판정한다. 많은 사람이 좋다고 할지를 묻지 않는다. 글의 말투나 길이로 판정하지 않는다.

## 채점
- 기준 6개마다 1~5점(정수). 3점은 "문제는 없지만 더프롬이 아니어도 낼 수 있다"이다. 4점 이상은 그 기준에서 더프롬의 판단이 보일 때만 준다.
- 안끼리 비교해서 매긴다. 전부 같은 점수를 주지 않는다.
- verdict: 채택(그대로 내보낸다) · 보완(방향은 맞고 고칠 곳이 있다) · 기각(더프롬의 안이 아니다).
- rank: 내보낼 순서 1~${cards.length}위 (동점 없이).

기준 id: ${IDENTITY.map((l) => `${l.id} = ${l.name}`).join(' / ')}

## 출력
/tmp/eval/judge/F${n}.res.json 에 아래 JSON만 쓴다. 다른 파일은 읽지 않는다. 웹 검색을 쓰지 않는다.
{ "scores": { "K1": { ${IDENTITY.map((l) => `"${l.id}": 0`).join(', ')}, "verdict": "채택|보완|기각", "why": "한 줄" } }, "rank": ["K3","K1"] }

## 브리프
${brief}

## 안 ${cards.length}개
`;
[[1, 101], [2, 211], [3, 307]].forEach(([n, seed]) => { const order = shuffle(cards, seed); key[`G${n}`] = Object.fromEntries(order.map((c, k) => [`K${k + 1}`, { arm: c.arm, src: c.src }])); fs.writeFileSync(`judge/G${n}.req.md`, GEN(n) + list(order)); });
[[1, 409], [2, 503]].forEach(([n, seed]) => { const order = shuffle(cards, seed); key[`F${n}`] = Object.fromEntries(order.map((c, k) => [`K${k + 1}`, { arm: c.arm, src: c.src }])); fs.writeFileSync(`judge/F${n}.req.md`, FROM(n) + list(order)); });
fs.writeFileSync('judge/KEY2.json', JSON.stringify(key, null, 1)); fs.writeFileSync('judge/cards2.json', JSON.stringify(cards, null, 1));
console.log(cards.map((c) => `${c.arm} ${c.src} 컨셉${c.concept.length} 표현${c.visual.length} 효과${c.gain.length} | ${c.title}`).join('\n'));
