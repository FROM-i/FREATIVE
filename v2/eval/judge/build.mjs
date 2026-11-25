import fs from 'node:fs';
const base = JSON.parse(fs.readFileSync('bridge/base/001.res.json','utf8'));
const x = JSON.parse(fs.readFileSync('bridge/1x-run/RESULT.json','utf8')).results.concept;
const run = JSON.parse(fs.readFileSync('bridge/2x/RESULT.json','utf8')).project.run;
const brief = fs.readFileSync('brief.md','utf8');
const cards = [];
for (const c of base.concepts) cards.push({ arm:'base', src:`B${c.id}`, title:c.title, concept:c.concept, visual:c.visual, gain:c.benefit });
for (const id of x.first_round.picked) { const p = x.proposals.find(q=>q.id===id); cards.push({ arm:'1x', src:id, title:p.theme, concept:p.concept, visual:p.visual, gain:p.root_change }); }
for (const n of run.insights) cards.push({ arm:'2x', src:n.id, title:n.title, concept:n.concept, visual:n.visual, gain:`${n.substitute.who} ${n.substitute.changes}` });
// 결정적 셔플 (시드)
const rng = (seed)=>()=>{ seed = (seed*1664525+1013904223)>>>0; return seed/4294967296; };
const shuffle=(a,seed)=>{const r=rng(seed);const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;};
const key = {};
const HEAD = (n)=>`# 평가 과제 (판정자 ${n})

너는 디지털 서비스 기획·디자인 안을 심사하는 판정자다. 아래 브리프에 대해 서로 다른 방법으로 만든 안 9개가 무작위 순서로 주어진다. 어느 안이 어떤 방법으로 만들어졌는지는 알려 주지 않는다. 글의 말투나 길이로 점수를 주지 말고 내용만 본다.

## 채점 기준 (각 1~5점, 정수)
- 독창성: 이 브리프를 받은 사람 대부분이 떠올릴 안과 얼마나 다른 해석인가. 1 = 누구나 내는 안, 5 = 브리프에서 바로 나오지 않는 새 해석.
- 차별성: 기존 성향 테스트(16Personalities, 푸망 등)와 사용자가 설명 없이 구분할 수 있는가. 1 = 구분 안 됨, 5 = 한눈에 다름.
- 실효성: 브리프의 실패 지점("공유는 해도 납득은 안 된다")을 실제로 푸는가. 제약(토스 안 이질감, 생년월일 비공개, 1~2분 틈)을 지키며 구현할 수 있는가. 1 = 풀지 못함, 5 = 풀고 바로 만들 수 있음.
- 경쟁성: 출시했을 때 선택받을 이유가 있고, 경쟁 서비스가 쉽게 따라 하기 어려운가. 1 = 이유 없음, 5 = 강한 이유와 모방 장벽.

점수는 9개 안에 고르게 나눠 쓴다. 전부 4~5점으로 주지 않는다. 한 기준에서 5점은 최대 2개까지만 준다.

## 추가로 답할 것
- groups: 핵심 아이디어가 사실상 같은 안끼리 묶는다 (표현만 다르고 같은 해법이면 같은 묶음). 혼자인 안은 1개짜리 묶음.
- common: 9개 안 대부분에 공통으로 들어 있는 해법이 있으면 한 문장으로 적는다.
- unique: 다른 안에는 없고 그 안에만 있는 요소를 안마다 한 줄로 적는다. 없으면 "없음".
- rank: 종합 순위 1~9위 (동점 없이).

## 출력
/tmp/eval/judge/J${n}.res.json 에 아래 JSON만 쓴다. 다른 파일은 읽지 않는다. 웹 검색을 쓰지 않는다.
{ "scores": { "K1": { "독창성": 0, "차별성": 0, "실효성": 0, "경쟁성": 0, "why": "한 줄" }, "K2": { } },
  "groups": [ ["K1","K4"], ["K2"] ], "common": "", "unique": { "K1": "" }, "rank": ["K3","K1"] }

## 브리프
${brief}

## 안 9개
`;
[11, 29, 47].forEach((seed, i) => {
  const n = i+1; const order = shuffle(cards, seed); key[`J${n}`] = {};
  let md = HEAD(n);
  order.forEach((c, k) => { const id = `K${k+1}`; key[`J${n}`][id] = { arm:c.arm, src:c.src };
    md += `### ${id} — ${c.title}\n- 컨셉: ${c.concept}\n- 보이는 표현: ${c.visual}\n- 사용자에게 달라지는 것: ${c.gain}\n\n`; });
  fs.writeFileSync(`judge/J${n}.req.md`, md);
});
fs.writeFileSync('judge/KEY.json', JSON.stringify(key, null, 1));
fs.writeFileSync('judge/cards.json', JSON.stringify(cards, null, 1));
console.log(cards.map(c=>`${c.arm} ${c.src} 컨셉${c.concept.length} 표현${c.visual.length} 효과${c.gain.length}`).join('\n'));
console.log(JSON.stringify(key));
