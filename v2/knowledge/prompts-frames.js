// 프레임 단계의 프롬프트 — 경쟁에서 이긴 안을 전통적인 틀로 정리한다.
// 틀은 안을 만드는 도구가 아니라 정리하고 검증하는 칸이다. 새로 추론하지 않고, 이미 나온 재료로 칸을 채우고 근거 id를 남긴다.
//   기획 틀   JTBD → 경쟁 구도 → 포지셔닝 → KSF → Key Claim → Concept Theme
//   디자인 틀 FoR → PoP → PoD(RTB) → Creative 방향. 노하우북은 여기서 필요한 장만 끌어온다.
import { common, missionBlock, toJson as j } from './prompts.js';
import { criteriaBlock } from './criteria.js';
import { KNOWHOW } from './knowhow.js';

const materials = (run) => `## 재료 — 이것만 쓴다. 칸마다 근거 id를 적는다
### 경쟁에서 이긴 안 (N)
${j(run.insights.map((n) => ({ id: n.id, 제목: n.title, 컨셉: n.concept, 보이는_표현: n.visual, 얻는_것: `${n.substitute.who} ${n.substitute.changes}`.trim(), 기본안과의_차이: n.without?.difference, 받은_공격: (n.attacks || []).map((a) => a.hit), 고친_것: (n.fixed || []).map((f) => f.fix), 판정: n.from ? { 판정: n.from.verdict, 차별화: n.from.differentiation.level, 실효성: n.from.effectiveness.level } : null })))}
### 다시 정의한 문제 (R)
${j((run.frames || []).map((f) => ({ id: f.id, 정의: f.frame })))}
### 기본안 (B) — 누구나 내는 안
${j((run.baseline?.concepts || []).map((c) => ({ id: c.id, 컨셉: c.concept })))}
### 터널 판단 — 시장 · 브랜드 · 타겟 · 사용 습관
${j(run.signals.filter((s) => s.family === 'tunnel').map((s) => ({ id: s.id, 판단: s.claim, ...(s.facts?.length ? { 근거_팩트: s.facts } : { 주의: '추정' }) })))}`;

/** 기획 틀 — 1회 호출로 여섯 칸을 채운다 */
export function planPrompt(project, run) {
  return {
    system: `${common(project)}

${criteriaBlock()}

## 너의 역할 — 기획 틀로 정리
경쟁에서 이긴 안을 기획의 틀로 정리해 Concept Theme까지 낸다. 틀은 칸이다. **새로 추론하지 않는다.** 아래 재료와 팩트북으로 칸을 채우고, 칸마다 \`from\`에 근거 id(N · R · B · F · 판단 id)를 적는다.

## 칸과 형식
- \`jtbd\`: 타겟이 해결하려는 일. situation(어떤 상황에서) · motivation(무엇을 하려고) · outcome(어떻게 되기를 바라나) 세 부분으로 쓴다.
- \`competition\`: 그 일을 지금 대신 해 주는 것들. 같은 업종만 보지 않는다(시간을 두고 다투는 것도 경쟁이다). 각각 who · does(무엇을 해 주나) · gap(해 주지 못하는 것).
- \`positioning\`: 경쟁이 서 있는 자리(crowd)와 이 안이 설 빈자리(place) 한 구절, 그리고 그 둘을 가르는 축(axis).
- \`ksf\`: 그 자리에서 이기려면 반드시 되어야 하는 것 2~4개. 이긴 안이 받은 공격과 고친 것에서 가져온다.
- \`claim\`: Key Claim 한 문장 — 타겟에게 하는 약속. rtb에 그 약속을 믿게 하는 근거(팩트 id 또는 안의 장치)를 적는다.
- \`theme\`: Concept Theme 한 구절과 그것이 나온 이유. 차별화의 정의로 본다 — 다르기만 한 말이 아니라 타겟에게 의미가 있고 이 서비스여야 하는 말이어야 한다.

## 규칙
- 재료에 없는 것을 지어내지 않는다. 채울 근거가 없는 칸은 비우고 \`need\`에 "무엇을 누구에게 확인한다"로 적는다. 경쟁사 사실은 팩트북에 있을 때만 사실로 쓴다.
- claim과 theme이 기본안의 해법을 말만 바꾼 것이면 실패다. \`baseline_same\`에 기본안과 같은지 스스로 적는다(true면 다시 쓴다).
- 이긴 안이 여러 개면 하나로 뭉개지 않는다. 가장 앞선 안을 중심에 두고, 나머지는 theme 아래 어디에 놓이는지 \`covers\`에 적는다.

## 출력 JSON
{ "jtbd": { "situation": "", "motivation": "", "outcome": "", "from": ["R1"] },
  "competition": [ { "who": "", "does": "", "gap": "", "from": ["F1"] } ],
  "positioning": { "axis": "", "crowd": "", "place": "", "from": ["B1", "N1"] },
  "ksf": [ { "factor": "", "from": ["N1"] } ],
  "claim": { "claim": "", "rtb": [""], "from": ["N1"] },
  "theme": { "theme": "", "why": "", "from": ["N1"] },
  "covers": [ { "insight": "N2", "role": "theme 아래에서 맡는 자리" } ],
  "baseline_same": false, "need": [""] }`,
    user: `${missionBlock(project)}

${materials(run)}

기획 틀을 JSON으로 출력하라.`,
  };
}

/** 노하우북 끌어오기 — 이긴 안의 보이는 표현을 만들 때 생기는 조형 문제를 뽑고, 그 문제를 푸는 장을 부른다 */
export function knowhowPullPrompt(project, run, plan) {
  return {
    system: `${common(project)}

## 너의 역할 — 조형 문제 뽑기
이긴 안의 "보이는 표현"을 실제 화면이나 제작물로 만들 때 생기는 조형 문제를 뽑는다. 그리고 더프롬 노하우북의 어느 장이 그 문제를 푸는지 고른다.
노하우북은 미리 고르지 않는다. **문제가 먼저고, 장은 그 문제 때문에 불려 온다.**

## 규칙
- 조형 문제는 "무엇이 무엇과 구분되지 않는다", "무엇이 먼저 읽히지 않는다"처럼 화면에서 벌어질 일로 쓴다. 3~5개.
- 문제마다 푸는 장을 1~2개 고른다. 장의 이름이 과제와 가까워 보인다는 이유로 고르지 않는다. 그 문제를 푸는 수단이 그 장에 있어야 한다.
- 전체에서 부르는 장은 5개를 넘지 않는다.

## 출력 JSON
{ "problems": [ { "insight": "N1", "problem": "화면에서 벌어질 조형 문제", "chapters": ["KH-B4"], "why": "이 장이 푸는 이유" } ] }`,
    user: `${missionBlock(project)}

## Concept Theme
${j({ theme: plan?.theme?.theme, claim: plan?.claim?.claim })}

## 이긴 안의 보이는 표현
${j(run.insights.map((n) => ({ id: n.id, 제목: n.title, 보이는_표현: n.visual })))}

## 노하우북의 장
${j(KNOWHOW.map((k) => ({ id: k.id, 장: k.name, 다루는_것: k.note || k.prefixes.join(' · '), 항목_수: k.items })))}

조형 문제와 부를 장을 JSON으로 출력하라.`,
  };
}

/** 디자인 틀 — FoR · PoP · PoD · Creative 방향. 사조의 읽기와 노하우북의 조작이 여기서 만난다 */
export function creativePrompt(project, run, plan, pulled, chapters) {
  const sig = new Map(run.signals.map((s) => [s.id, s]));
  const readings = [...new Set(run.insights.flatMap((n) => n.check.used))].map((id) => sig.get(id)).filter((s) => s && s.family === 'airplane');
  return {
    system: `${common(project)}

${criteriaBlock()}

## 너의 역할 — 디자인 틀로 정리
확정된 Concept Theme을 디자인의 틀로 옮겨 Creative 방향을 낸다. 새로 추론하지 않고 재료로 칸을 채운다.

## 칸과 형식
- \`for\`: Frame of Reference — 사용자가 이것을 어느 범주로 읽게 할 것인가 한 문장.
- \`pop\`: Points of Parity — 그 범주에 들려면 당연히 갖출 것. 기본안에서 가져온다. 2~4개.
- \`pod\`: Points of Difference — 기본안에 없고 이긴 안에만 있는 것. 하나를 코어(core: true)로 정한다. 각각 타겟에게 왜 중요한지(matters)와 믿게 하는 근거(rtb — 팩트 id 또는 안의 장치)를 쓴다.
- \`direction\`: Creative 방향 한두 문장 — 무엇으로 무엇을 느끼게 하는가.
- \`look\`: 눈에 보이는 방향 — 지킬 것(keep)과 바꿀 것(change), 하지 않을 것(not).
- \`isms\`: 이 방향에 쓰인 사조의 읽기. 어느 사조의 어느 갈래를 어느 층에서 얼마나 세게 썼고, 그래서 무엇이 달라졌는지.
- \`knowhow\`: 불려 온 노하우북의 장마다 — 푸는 문제(solves), 쓰는 조작(operation, 원문의 항목 id를 적는다), 무엇을 어떻게 바꾸나(from → to), 이 조작을 빼면 화면에서 달라지는 것(without).

## 규칙
- 노하우는 id를 붙이는 것으로 끝내지 않는다. 그 조작이 **무엇을 → 어떻게** 바꿨는지 쓴다. 바꾼 것이 없으면 그 노하우는 쓰지 않는다.
- 노하우북 원문의 표현을 유지한다. 원문에 없는 항목 id를 만들지 않는다.
- 사조는 장식으로 얹지 않는다. 표현 층으로 읽은 사조만 look에 나타난다.
- 더프롬 자사의 형상 · 색 · 서사는 결과물에 쓰지 않는다(N7).
- 글만으로 정할 수 없는 것(실제 굵기 · 크기 · 색 값, 새로 읽히는 느낌)은 정하지 않고 \`held\`에 "시안에서 정할 것"으로 적는다.

## 출력 JSON
{ "for": { "frame": "", "from": ["N1"] },
  "pop": [ { "point": "", "from": ["B1"] } ],
  "pod": [ { "point": "", "core": true, "matters": "", "rtb": [""], "from": ["N1"] } ],
  "direction": "", "look": { "keep": "", "change": "", "not": "" },
  "isms": [ { "signal": "판단 id", "strand": "", "layer": "", "changed": "" } ],
  "knowhow": [ { "chapter": "KH-B4", "solves": "", "operation": "항목 id와 조작", "from": "", "to": "", "without": "" } ],
  "held": ["시안에서 정할 것"] }`,
    user: `${missionBlock(project)}

## 확정된 기획 틀
${j({ theme: plan?.theme, claim: plan?.claim, positioning: plan?.positioning, ksf: plan?.ksf })}

${materials(run)}

## 이긴 안에 쓰인 사조의 읽기
${j(readings.map((s) => ({ id: s.id, 사조: s.lens, 갈래: s.strand, 읽기: s.reading, 층: s.layer, 세기: s.degree, 표현: s.expression || '' })))}

## 조형 문제
${j(pulled)}

## 불려 온 노하우북 — 원문
${chapters.map((k) => k.text).join('\n\n')}

디자인 틀을 JSON으로 출력하라.`,
  };
}
