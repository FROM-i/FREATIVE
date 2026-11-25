import fs from 'node:fs';
const base = JSON.parse(fs.readFileSync('bridge/base/001.res.json','utf8'));
const R = JSON.parse(fs.readFileSync('bridge/1x-run/RESULT.json','utf8')).results;
const run = JSON.parse(fs.readFileSync('bridge/2x/RESULT.json','utf8')).project.run;
const brief = fs.readFileSync('brief.md','utf8');
const j = (o)=>JSON.stringify(o,null,1);
const sel = new Set(R.airplane.synth.selected);
const d1 = `### 과정 기록
이 과정은 단계를 차례로 밟는다 (사조 여행 → 여행 종합 → 레이어 → 생각의 회차 → 포지셔닝 → 차별점 → 컨셉). 사조 5개를 여행했고 그중 3개를 골랐다.

#### 사조 여행 기록 (고른 3개)
${j(R.airplane.travels.filter(t=>sel.has(t.id)).map(t=>({id:t.id,name:t.name,postcard:t.postcard,take:t.take,leave:t.leave,apply:t.apply,treatments:t.treatments})))}

#### 여행에 갔지만 고르지 않은 사조
${j(R.airplane.travels.filter(t=>!sel.has(t.id)).map(t=>({id:t.id,name:t.name,apply:t.apply})))}

#### 여행 종합 — 다음 단계로 넘긴 것 (U1~U5)
${j(R.airplane.synth.suitcase.map((s,i)=>({id:`U${i+1}`,내용:s})))}

#### 레이어 종합 — 바꿀 것 (V1~V5)
${j(R.tunnel.synth.change.map((s,i)=>({id:`V${i+1}`,내용:s})))}

### 최종안
${j({concept:R.concept.concept,theme:R.concept.theme,keywords:R.concept.keywords,creative_edge:R.concept.creative_edge,visual_idea:R.concept.visual_idea,metaphor:R.concept.metaphor,core_pod:R.forpop.core_pod.statement,benefit:R.concept.benefit.map(b=>({touchpoint:b.touchpoint,visible:b.visible}))})}`;
const ismSig = run.signals.filter(s=>s.family==='airplane');
const ids = new Set(ismSig.map(s=>s.id));
const d2 = `### 과정 기록
이 과정은 여러 기준 노드가 같은 브리프를 받아 따로 판단을 내고, 판단 사이의 연결을 정한 뒤, 연결된 판단 묶음마다 통합안을 쓴다. 사조 16개 중 4개를 골랐다: ${run.picks.map(p=>p.id).join(', ')}.

#### 사조 노드가 낸 판단 (${ismSig.length}건)
${j(ismSig.map(s=>({id:s.id,사조:s.lens,origin:s.origin,parallel:s.parallel,ladder:s.ladder,claim:s.claim,effect:s.effect,swap:s.swap,leave:s.leave})))}

#### 사조 판단이 다른 판단과 맺은 연결 (${run.edges.filter(e=>ids.has(e.from)||ids.has(e.to)).length}건)
${j(run.edges.filter(e=>ids.has(e.from)||ids.has(e.to)).map(e=>({from:e.from,to:e.to,type:e.type,why:e.why})))}

### 최종안 (통합안 3건)
${j(run.insights.map(n=>({id:n.id,title:n.title,거친_판단:n.chain.map(c=>`${c.signal}: ${c.says}`),insight:n.insight,concept:n.concept,visual:n.visual,keep:n.keep,change:n.change})))}`;
const HEAD = (n, P, Q) => `# 감사 과제 (감사자 ${n})

두 가지 작업 과정(과정 P, 과정 Q)이 같은 브리프로 디자인 안을 만들었다. 둘 다 디자인 사조(스위스 스타일, 브루탈리즘 등)를 재료로 썼다. 너는 **사조가 실제로 깊이 이해되어 최종안을 바꿨는지**를 감사한다. 사조 이름이 언급됐다는 것만으로는 점수를 주지 않는다. 기록의 분량이나 형식이 아니라 내용을 본다.

## 사조마다 매길 것
- understand (0~3): 0 = 이름만 나옴 / 1 = 겉모습·미감을 가져옴 / 2 = 사조의 원리를 맞게 서술함 / 3 = 사조가 무엇에 반대해 나왔는지를 이 과제의 문제 구조에 대응시켜, 브리프에 없던 판단을 끌어냄
- reach (0~3): 0 = 최종안에 흔적 없음 / 1 = 최종안에 이름이나 문구로만 언급 / 2 = 최종안의 표현 일부를 정함 / 3 = 최종안의 구조나 핵심 장치를 정함
- removal: 이 사조를 과정에서 뺐다면 최종안에서 사라지거나 달라질 요소를 구체적으로 적는다. 없으면 "달라지는 것 없음".
- brief_only: 그 요소가 사조 없이 브리프만 읽어도 나오는가. "예" / "일부" / "아니오". 아래 '사조 없이 낸 기본안'에 이미 있는 요소면 "예"다.
- evidence: 판단 근거가 된 기록의 구절 (30자 이내 인용)

## 과정마다 답할 것
- surface: 사조를 이름·겉모습으로만 쓴 사례 (없으면 빈 배열)
- beyond_brief: 최종안 요소 중 브리프와 '사조 없이 낸 기본안'에는 없고 이 과정에서만 나온 것 (최대 5개, 각각 어느 사조·판단에서 왔는지)
- carry (과정 기록에 U1~U5, V1~V5가 있는 과정만): 각 항목이 최종안에 남았는지. "남음" / "일부" / "사라짐"

## 마지막에 답할 것
- verdict: 사조가 최종안을 더 깊이 바꾼 과정은 P인가 Q인가, 차이가 없는가. 근거 두 문장.
- caveat: 이 감사로는 판단할 수 없는 것 한 문장.

## 출력
/tmp/eval/judge/A${n}.res.json 에 아래 JSON만 쓴다. 다른 파일은 읽지 않는다. 웹 검색을 쓰지 않는다.
{ "P": { "isms": [ { "id": "", "understand": 0, "reach": 0, "removal": "", "brief_only": "", "evidence": "" } ], "surface": [""], "beyond_brief": [ { "what": "", "from": "" } ], "carry": { "U1": "" } },
  "Q": { "isms": [ ], "surface": [ ], "beyond_brief": [ ], "carry": { } },
  "verdict": { "deeper": "P|Q|차이 없음", "why": "" }, "caveat": "" }

한 사조가 판단을 여러 건 낸 과정에서는 사조 단위로 묶어 한 줄로 매긴다.

## 브리프
${brief}

## 사조 없이 낸 기본안 (비교 기준)
${j(base.concepts)}

## 과정 P
${P}

## 과정 Q
${Q}
`;
fs.writeFileSync('judge/A1.req.md', HEAD(1, d1, d2));
fs.writeFileSync('judge/A2.req.md', HEAD(2, d2, d1));
fs.writeFileSync('judge/AKEY.json', j({A1:{P:'1x',Q:'2x'},A2:{P:'2x',Q:'1x'}}));
console.log(d1.length, d2.length);
