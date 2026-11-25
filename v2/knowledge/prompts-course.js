// 운영 방향 — 전략 과제의 맨 위 층.
//   컨셉 과제는 "문제를 푸는 안 하나"를 낸다. 전략 과제(운영 · 연간 플랜)는 그 위에 "무엇을 기준으로 운영하는가"가 먼저 있어야 한다.
//   방향을 인사이트에서 올려 쓰면 전술을 일반화한 문장이 된다. 그래서 방향은 전체 판단과 팩트에서 따로 쓰고, 방향끼리 겨루고, 그 아래로 내려 쓴다.
//     1층 운영 방향 — 업무 영역 전부를 하나로 운영하는 기준
//     2층 영역별 전략 — 영역마다 하나 (예: 프로모션 관리 전략)
//     3층 전술 — 영역 전략 아래의 여러 할 일. 단계별로 놓는다. 이긴 인사이트는 여기에 전술 하나로 놓인다
//   방향인지 가르는 시험대는 "업무 영역"이다. 파트(직무)와 기간만으로 가르면, 한 영역의 대상(예: 프로모션의 혜택)을
//   주어로 삼은 문장이 통과한다 — 모든 파트가 그 대상을 만지기 때문이다.
import { common, missionBlock, toJson as j } from './prompts.js';
import { validFacts } from './facts.js';
import { categoriesOf, categoryById } from './tags.js';

export const COURSE_CAPS = { name: 16, line: 44, standard: 64, from: 30, to: 30, keeps: 34, drop: 26, answer: 60, axis: 14, rule: 42, when: 12, phase: 36, guide: 42, move: 28, pain: 30, fix: 32, why: 90, note: 48, area: 14, areaNote: 40, cover: 36 };

/** 방향 문장에 들어가면 전술이라는 표시가 되는 말 — 화면 · 기능 · 표현 장치의 이름 */
export const DEVICE_WORDS = ['화면', '버튼', '배너', '팝업', '탭', '칸', '카드', '쿠폰', '푸시', '아이콘', '위젯', '페이지', '슬롯', '알림창'];

const cut = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n)}…` : String(s || ''));
const areaList = (areas) => areas.map((a) => `- ${a.id}: ${a.name}${a.note ? ` — ${a.note}` : ''}`).join('\n');
const levelBlock = (areas) => `## 업무 영역 — 이 과제가 맡는 일의 범위
${areaList(areas)}

## 층위 — 방향 · 영역 전략 · 전술을 가른다
- **방향**: 위 업무 영역 **전부**를 하나로 운영하는 기준이다. "영역들을 어떻게 하나로 운영하는가"에 답한다. 이 문장만 읽고 영역마다 "그러면 이 영역은 이렇게 바뀐다"를 말할 수 있다.
- **영역 전략**: 한 영역 안의 방침이다. 한 영역의 대상(그 영역에서만 다루는 것 — 예: 프로모션 영역의 혜택 · 쿠폰 · 이벤트)을 주어로 삼은 문장은 아무리 넓게 써도 그 영역의 전략이다.
- **전술**: 특정 화면 · 기능 · 표현 장치 · 한 번의 실행이다. 영역 전략 아래의 여러 할 일 중 하나다.
- 가르는 법: ① 문장의 주어가 한 영역에만 있는 대상인가 → 영역 전략. ② 장치 이름(${DEVICE_WORDS.slice(0, 8).join(' · ')} 등)을 지우면 문장이 서지 않는가 → 전술. ③ 영역 하나를 빼도 문장이 그대로인가 → 그 영역에 걸리지 않는 것이다.
- 파트(직무)와 기간에 걸친다는 것만으로는 방향이 아니다. 모든 파트가 만지는 대상이어도 한 영역의 대상이면 영역 전략이다.
- 누구에게나 맞는 말("고객 중심", "데이터 기반", "안정적 운영", "통합 관리")은 기준이 아니다. 기준은 **무엇을 하지 않는지**가 보인다.`;

function signalGroups(run, lensName) {
  const used = new Set((run.insights || []).flatMap((i) => i.check?.used || []));
  const byLens = new Map();
  for (const s of run.signals.filter((x) => !x.muted)) { if (!byLens.has(s.lens)) byLens.set(s.lens, []); byLens.get(s.lens).push(s); }
  return [...byLens].map(([lens, list]) => `### ${lensName(lens)}${list[0].family === 'tunnel' ? ' (터널 — 팩트에 묶인 판단)' : ''}\n${list.map((s) => `- [${s.id}]${used.has(s.id) ? '' : ' (인사이트에 안 쓰임)'} ${cut(s.claim, 130)}${s.facts?.length ? ` · ${s.facts.join(' ')}` : ''}`).join('\n')}`).join('\n');
}
const tacticList = (run) => (run.insights || []).map((i) => ({ id: i.id, 제목: i.title, 판정: i.from?.verdict || '' }));
const partsOf = (project) => categoriesOf(project).map(categoryById).filter((c) => c.id !== 'integrated');

/** 업무 영역 — 미션에 적혀 있지 않으면 미션에서 뽑는다. 사람이 고쳐 쓸 수 있다. */
export function courseScopePrompt(project) {
  const C = COURSE_CAPS;
  return {
    system: `${common(project)}

## 너의 역할 — 업무 영역
이 과제가 맡는 **일의 범위**를 2~4개의 업무 영역으로 나눈다. 미션(발주 범위)에 적힌 과업을 그대로 따른다.
- 직무(기획 · 디자인 · 개발 · 마케팅)로 나누지 않는다. 직무는 영역 안에서 일하는 사람이다. UI/UX도 영역이 아니라 영역 안의 일이다.
- 시기(인수인계 · 운영 · 리뷰)로 나누지 않는다.
- 보고 · 회의 같은 관리 수단은 영역이 아니다. 영역들을 묶는 수단이다.
- \`name\` ${C.area}자 이내, \`note\`(그 영역에 드는 일) ${C.areaNote}자 이내.

## 출력 (JSON만)
{"areas":[{"name":"","note":""}]}`,
    user: `${missionBlock(project)}

업무 영역을 JSON으로 낸다.`,
  };
}

/** 기본 방향 — 노드 없이 미션만 읽고 낸 운영 방향. 방향 후보를 견주는 기준이다. */
export function courseBasePrompt(project, areas) {
  const C = COURSE_CAPS;
  return {
    system: `${common(project)}

## 너의 역할 — 기본 방향
경험 많은 대행사가 이 미션만 읽고 낼 법한 **운영 방향 하나**를 쓴다. 특별한 관점 없이, 이 업계에서 통상 내는 방향이다.
아래 업무 영역 전부를 하나로 운영하는 기준을 쓴다. 장치나 화면이 아니다.

## 업무 영역
${areaList(areas)}

## 글자 수
\`name\` ${C.name}자 · \`line\` ${C.line}자 · \`standard\` ${C.standard}자 이내.

## 출력 (JSON만)
{"name":"","line":"방향 한 줄","standard":"운영 중 결정을 가르는 기준 한 문장"}`,
    user: `${missionBlock(project)}

기본 방향을 JSON으로 낸다.`,
  };
}

/** 방향 후보 3개 — 업무 영역 전부를 하나로 운영하는 기준. 후보마다 영역을 묶는 축이 다르다. */
export function coursePrompt(project, run, spines, base, lensName, need, areas, note = '') {
  const C = COURSE_CAPS;
  const n = 3;
  const ids = Array.from({ length: n }, (_, i) => `D${i + 1}`);
  return {
    system: `${common(project)}

## 너의 역할 — 통합 운영 방향
이 과제는 장치 하나를 고르는 과제가 아니다. 업무 영역 ${areas.length}개를 **하나로 운영하는 방향**을 정하는 과제다.
방향은 "무엇을 만드는가"가 아니라 "무엇을 기준으로 운영하는가"다. 영역마다 따로 굴러가는 일을 같은 기준으로 굴러가게 한다.

${levelBlock(areas)}
- 이긴 인사이트 ${run.insights?.length || 0}건은 **전술**이다. 방향의 재료가 아니다. 인사이트를 넓게 고쳐 써서 방향으로 올리지 않는다.
- **판단의 수가 방향을 정하지 않는다.** 아래 판단은 한 영역에 몰려 있을 수 있다. 판단이 적은 영역은 미션과 팩트북에서 직접 읽는다. 판단이 많은 영역의 대상을 방향의 주어로 삼지 않는다.

## 방향 후보 ${n}개 (${ids.join(' · ')})
- 후보마다 **영역을 묶는 축이 다르다** — 무엇을 영역 공통으로 두는가가 다르다. 표현만 다르면 같은 후보다.
- \`covers\`: **영역마다 한 줄씩**, 이 방향이면 그 영역에서 무엇이 달라지는가. 영역 id를 모두 쓴다. 한 영역이라도 "달라지는 것이 없다"면 방향이 아니다.
- 전체 판단과 팩트로 받친다. 후보마다 **서로 다른 노드 ${need.nodes}개 이상**의 판단, **팩트 ${need.facts}개 이상**.${need.tunnel ? ' 터널 판단을 반드시 포함한다.' : ''} 주어진 id만 쓴다.
- 근본 이슈의 판정 질문에 방향 전체로 답한다(\`answer\`).
- \`from\` → \`to\`: 지금 운영이 기준으로 삼는 것 → 이 방향이 기준으로 삼는 것. 팩트로 확인되는 것만 쓴다.
- \`keeps\`: 이미 잘하고 있어 이 방향이 더 키우는 것. 팩트에 없으면 비운다.
- \`drops\`: 이 방향을 고르면 하지 않는 것 1~2개.
- 기본 방향과 기준이 같으면 후보가 아니다.

## 글자 수 — 넘기지 않는다
\`name\` ${C.name}자(명사로 끝낸다) · \`line\` ${C.line}자 · \`standard\` ${C.standard}자 · \`covers\`의 \`line\` ${C.cover}자 · \`from\`/\`to\` ${C.from}자 · \`keeps\` ${C.keeps}자 · \`drops\` 각 ${C.drop}자 · \`answer\` ${C.answer}자 이내.
설명 · 이유 · 수식어를 붙이지 않는다. 수치는 팩트 id로 대신한다.

## 출력 (JSON만)
{"candidates":[{"id":"D1","name":"","line":"방향 한 줄","standard":"운영 중 결정을 가르는 기준 한 문장","covers":[{"area":"${areas[0].id}","line":"이 영역에서 달라지는 것"}],"from":"","to":"","keeps":"","drops":[""],"answer":"","signals":["판단 id"],"facts":["F1"]}]}`,
    user: `${missionBlock(project)}

## 전체 판단 ${run.signals.filter((s) => !s.muted).length}건 — 노드별
${signalGroups(run, lensName)}

## 판단끼리 부딪힌 자리 — 참고
${j(spines.map((sp) => ({ 한쪽: `[${sp.a.id}] ${lensName(sp.a.lens)} — ${cut(sp.a.claim, 110)}`, 다른_쪽: `[${sp.b.id}] ${lensName(sp.b.lens)} — ${cut(sp.b.claim, 110)}` })))}

## 이긴 인사이트 — 전술이다. 방향으로 올리지 않는다
${j(tacticList(run))}

## 기본 방향 — 이 기준으로 돌아가지 않는다
${j(base ? { 이름: base.name, 한_줄: base.line, 기준: base.standard } : {})}
${note ? `\n## 다시 쓰는 이유\n${note}\n` : ''}
방향 후보 ${n}개를 JSON으로 낸다.`,
  };
}

/** 방향 판정 — 후보와 기본 방향을 견줘 하나를 고른다. 영역 전략이나 전술을 방향이라 부른 안은 진다. */
export function courseJudgePrompt(project, rivals, base, areas) {
  const C = COURSE_CAPS;
  const name = (id) => areas.find((a) => a.id === id)?.name || id;
  return {
    system: `${common(project)}

## 너의 역할 — 방향 판정
통합 운영 방향 후보 ${rivals.length}개와 기본 방향(BASE) 하나를 견줘 순서를 매긴다.

${levelBlock(areas)}

## 보는 순서
1. **층위** — 영역 전략이나 전술을 방향이라 부른 안은 진다. 후보의 "영역마다 달라지는 것"을 영역별로 읽는다. 한 영역의 대상을 다른 영역에 억지로 옮겨 쓴 줄(예: 보안 영역에 프로모션의 대상을 그대로 적용)은 걸린 것으로 치지 않는다. 진짜로 걸리는 영역이 하나뿐이면 그 영역의 "영역 전략"이다.
2. **기준의 힘** — 운영 중 부딪히는 결정에서 실제로 한쪽을 고르게 하는가. 무엇을 하지 않는지가 보이는가.
3. **과제 적합** — 근본 이슈의 판정 질문에 답하는가. 팩트로 확인되는 문제를 풀고, 이미 잘하는 것을 키우는가.
4. **차별** — 기본 방향과 **운영의 기준**이 다른가. 표현이 달라도 기준이 같으면 "같음"이다. 방향이 넓다는 이유만으로 "같음"이라 하지 않는다.
5. **안정** — 기간 내내 지킬 수 있는가. 한 번의 행사로 끝나는 기준은 약하다.
- 뚜렷함은 좁다는 뜻이 아니다. 특이한 장치가 있다는 이유로 올려 주지 않는다.
- 기본 방향이 가장 나으면 그렇게 쓴다.

## 출력 (JSON만)
- \`order\`: 가장 나은 것부터. 후보 id와 "BASE"를 모두 넣는다.
- \`items\`: 후보마다 층위(\`level\`: "방향" · "영역 전략" · "전술" 중 하나), 진짜로 걸리는 영역의 id(\`reaches\`), 기본 방향과 기준이 다른지(\`vsBase\`: "다름" 또는 "같음"), 강한 점과 약한 점(각 ${C.note}자 이내).
- \`why\`: 1위를 고른 이유. ${C.why}자 이내.
- \`borrow\`: 1위가 다른 후보에서 가져오면 좋은 것. 최대 2개, 각 ${C.note}자 이내.
- \`risk\`: 1위 방향이 실행에서 무너질 수 있는 지점 하나. ${C.note}자 이내.
{"order":["D2","BASE","D1","D3"],"items":[{"id":"D1","level":"방향","reaches":["${areas[0].id}"],"vsBase":"다름","strong":"","weak":""}],"why":"","borrow":[{"from":"D1","what":""}],"risk":""}`,
    user: `${missionBlock(project)}

## 방향 후보
${j(rivals.map((r) => ({ id: r.id, 이름: r.name, 한_줄: r.line, 기준: r.standard, 영역마다_달라지는_것: Object.fromEntries(r.covers.map((c) => [`${c.area} ${name(c.area)}`, c.line])), 지금: r.from, 바뀌는_것: r.to, 키우는_것: r.keeps, 하지_않는_것: r.drops, 판정_질문의_답: r.answer, 근거_넓이: `노드 ${r.breadth.nodes}개 · 판단 ${r.signals.length}건 · 팩트 ${r.facts.length}건`, ...(r.flags.length ? { 표시: r.flags } : {}) })))}

## 기본 방향 (BASE)
${j(base ? { 이름: base.name, 한_줄: base.line, 기준: base.standard } : {})}

순서를 매겨 JSON으로 낸다.`,
  };
}

/** 아래로 내린다 — 정해진 방향 아래로 영역별 전략과 그 아래의 전술을 단계별로 쓴다. */
export function layersPrompt(project, run, direction, judge, lensName, need, areas, note = '') {
  const C = COURSE_CAPS;
  const parts = partsOf(project);
  return {
    system: `${common(project)}

## 너의 역할 — 방향을 아래로 내린다
통합 운영 방향(1층)은 정해졌다. 바꾸지 않는다. 그 아래 두 층을 쓴다. 위에서 아래로 쓴다 — 인사이트를 모아 올리지 않는다.

## 업무 영역
${areaList(areas)}

## 2층 — 영역별 전략
- 영역마다 **전략 하나**를 쓴다(\`name\`, \`line\`). 방향이 그 영역에서 어떤 방침이 되는가다. 방향의 "영역마다 달라지는 것"에서 내려 쓴다.
- 영역 전략은 전술 하나가 아니다. 그 아래에 서로 다른 전술이 여러 개 달릴 수 있어야 한다. 이긴 인사이트 하나를 이름만 바꿔 영역 전략으로 올리지 않는다.
- 영역마다 팩트 2개 이상, 판단이 있으면 판단도 적는다. 판단이 적은 영역은 팩트북과 미션에서 읽는다.

## 3층 — 전술
- \`phases\`: 시간 순서 3~4단계. 미션에 기간이 있으면 그 기간으로 나눈다. \`line\`은 그 시기에 이뤄야 하는 상태다.
- 영역마다 \`tactics\`를 쓴다. **영역마다 ${need.tactics}개 이상, 단계마다 1개 이상.** 전술마다 단계(\`phase\`), 할 일(\`move\`, "무엇을 한다" 꼴), 맡는 파트(\`parts\`)를 적는다.
- 전술은 그 영역의 전략에서 내려온 것이어야 한다. 전략 없이도 할 일이면 쓰지 않는다. 한 영역의 전술이 한 가지 종류로만 채워지지 않게 한다.${parts.length > 1 ? `\n- 파트 id: ${parts.map((c) => `${c.id}(${c.name})`).join(' · ')}. 모든 파트가 어딘가의 전술을 맡는다.` : ''}
- **이긴 인사이트는 전술 하나다.** 맞는 영역의 전술로 놓고 그 전술의 \`insight\`에 id를 적는다. 그 영역의 다른 전술과 나란히 놓인다. 방향에 맞지 않으면 놓지 않는다.
- \`insights\`: 인사이트마다 짧은 이름과 한 줄, 놓았는지(\`fit\`: "맞음" 또는 "맞지 않음").
- 판정이 남긴 "가져올 것"과 "무너질 수 있는 지점"을 영역 전략이나 전술에 반영한다.

## 나머지
- \`fixes\`: 지금의 문제(팩트로 확인되는 것)와 이 방향이 그것을 바꾸는 방법. 최대 4개.
- \`boosts\`: 이미 잘하는 것(팩트로 확인되는 것)과 더 키우는 방법. 최대 3개. 팩트에 없으면 비운다.
- \`gaps\`: 이 방향이 서려면 확인해야 하는 것. 최대 3개.
- 전체로 서로 다른 팩트 ${need.total}개 이상, 인사이트에 쓰이지 않은 판단 ${need.fresh}개 이상을 쓴다. 주어진 id만 쓴다.

## 글자 수 — 넘기지 않는다
보는 판이다. 설명 · 이유 · 수식어를 붙이지 않는다.
영역 전략 \`name\` ${C.name}자(명사로 끝낸다) · \`line\` ${C.line}자 · 단계 \`when\` ${C.when}자 · \`line\` ${C.phase}자 · \`move\` ${C.move}자 · \`pain\`/\`strength\` ${C.pain}자 · \`answer\` ${C.fix}자 · 인사이트 \`name\` ${C.axis}자 · \`line\` ${C.line}자 이내.

## 출력 (JSON만)
{"phases":[{"id":"P1","when":"","line":""}],"areas":[{"area":"${areas[0].id}","name":"영역 전략의 이름","line":"영역 전략 한 줄","tactics":[{"phase":"P1","move":"","parts":["${parts[0]?.id || 'planning'}"],"insight":""}],"facts":["F1"],"signals":["판단 id"]}],"insights":[{"id":"N1","name":"","line":"","fit":"맞음"}],"fixes":[{"pain":"","answer":"","facts":["F1"]}],"boosts":[{"strength":"","answer":"","facts":["F1"]}],"gaps":[""]}`,
    user: `${missionBlock(project)}

## 통합 운영 방향 (1층) — 바꾸지 않는다
${j({ 이름: direction.name, 한_줄: direction.line, 기준: direction.standard, 영역마다_달라지는_것: Object.fromEntries(direction.covers.map((c) => [c.area, c.line])), 지금: direction.from, 바뀌는_것: direction.to, 키우는_것: direction.keeps, 하지_않는_것: direction.drops, 근거_판단: direction.signals, 근거_팩트: direction.facts })}

## 판정이 남긴 것
${j({ 가져올_것: (judge?.borrow || []).map((b) => b.what), 무너질_수_있는_지점: judge?.risk || '' })}

## 이긴 인사이트 — 전술 하나로 놓는다
${j((run.insights || []).map((i) => ({ id: i.id, 제목: i.title, 컨셉: cut(i.concept, 200), 판정: i.from?.verdict || '' })))}

## 전체 판단 — 노드별
${signalGroups(run, lensName)}
${note ? `\n## 다시 쓰는 이유\n${note}\n` : ''}
영역별 전략과 전술을 JSON으로 낸다.`,
  };
}
