// 운영 방향 — 전략 과제의 맨 위 층.
//   컨셉 과제는 "문제를 푸는 안 하나"를 낸다. 전략 과제(운영 · 연간 플랜)는 그 위에 "무엇을 기준으로 운영하는가"가 먼저 있어야 한다.
//   방향을 인사이트에서 올려 쓰면 전술을 일반화한 문장이 된다. 그래서 방향은 전체 판단과 팩트에서 따로 쓰고, 방향끼리 겨루고, 그 아래로 내려 쓴다.
//     1층 운영 방향 → 2층 축 · 연간 단계 → 3층 파트별 × 단계별 할 일(이긴 인사이트는 여기에 전술로 놓인다)
import { common, missionBlock, toJson as j } from './prompts.js';
import { validFacts } from './facts.js';
import { categoriesOf, categoryById } from './tags.js';

export const COURSE_CAPS = { name: 16, line: 44, standard: 64, from: 30, to: 30, keeps: 34, drop: 26, answer: 60, axis: 14, rule: 42, when: 12, phase: 36, guide: 42, move: 28, pain: 30, fix: 32, why: 90, note: 48 };

/** 방향 문장에 들어가면 전술이라는 표시가 되는 말 — 화면 · 기능 · 표현 장치의 이름 */
export const DEVICE_WORDS = ['화면', '버튼', '배너', '팝업', '탭', '칸', '카드', '쿠폰', '푸시', '아이콘', '위젯', '페이지', '슬롯', '알림창'];

const cut = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n)}…` : String(s || ''));
const LEVEL = `## 층위 — 방향과 전술을 가른다
- **방향**: 모든 파트와 전 기간에 걸리는 판단 기준이다. 이 문장만 읽고 파트 담당자가 저마다 "그러면 내 일은 이렇게 바뀐다"를 말할 수 있다.
- **전술**: 특정 화면 · 기능 · 프로모션 · 표현 장치다. 한 파트, 한 시기의 일이다.
- 가르는 법: 문장에서 장치 이름(${DEVICE_WORDS.slice(0, 8).join(' · ')} 등)을 지워도 문장이 서는가. 한 파트나 한 시기에만 닿으면 전술이다.
- 누구에게나 맞는 말("고객 중심", "데이터 기반", "안정적 운영", "통합 관리")은 기준이 아니다. 기준은 **무엇을 하지 않는지**가 보인다.`;

function signalGroups(run, lensName) {
  const used = new Set((run.insights || []).flatMap((i) => i.check?.used || []));
  const byLens = new Map();
  for (const s of run.signals.filter((x) => !x.muted)) { if (!byLens.has(s.lens)) byLens.set(s.lens, []); byLens.get(s.lens).push(s); }
  return [...byLens].map(([lens, list]) => `### ${lensName(lens)}${list[0].family === 'tunnel' ? ' (터널 — 팩트에 묶인 판단)' : ''}\n${list.map((s) => `- [${s.id}]${used.has(s.id) ? '' : ' (인사이트에 안 쓰임)'} ${cut(s.claim, 130)}${s.facts?.length ? ` · ${s.facts.join(' ')}` : ''}`).join('\n')}`).join('\n');
}
const tacticList = (run) => (run.insights || []).map((i) => ({ id: i.id, 제목: i.title, 판정: i.from?.verdict || '' }));
const partsOf = (project) => categoriesOf(project).map(categoryById).filter((c) => c.id !== 'integrated');

/** 기본 방향 — 노드 없이 미션만 읽고 낸 운영 방향. 방향 후보를 견주는 기준이다. */
export function courseBasePrompt(project) {
  const C = COURSE_CAPS;
  return {
    system: `${common(project)}

## 너의 역할 — 기본 방향
경험 많은 대행사가 이 미션만 읽고 낼 법한 **운영 방향 하나**를 쓴다. 특별한 관점 없이, 이 업계에서 통상 내는 방향이다.
장치나 화면이 아니라 "무엇을 기준으로 운영하는가"를 쓴다.

## 글자 수
\`name\` ${C.name}자 · \`line\` ${C.line}자 · \`standard\` ${C.standard}자 이내.

## 출력 (JSON만)
{"name":"","line":"방향 한 줄","standard":"운영 중 결정을 가르는 기준 한 문장"}`,
    user: `${missionBlock(project)}

기본 방향을 JSON으로 낸다.`,
  };
}

/** 방향 후보 3개 — 전체 판단과 팩트에서 쓴다. 후보마다 출발하는 충돌이 다르다. */
export function coursePrompt(project, run, spines, base, lensName, need, note = '') {
  const C = COURSE_CAPS;
  const n = Math.max(2, Math.min(3, spines.length || 3));
  const ids = Array.from({ length: n }, (_, i) => `D${i + 1}`);
  return {
    system: `${common(project)}

## 너의 역할 — 운영 방향
이 과제는 장치 하나를 고르는 과제가 아니다. 과제 전체를 관통하는 **운영 방향**을 정하는 과제다.
방향은 "무엇을 만드는가"가 아니라 "무엇을 기준으로 운영하는가"다. 여러 파트가 기간 내내 부딪히는 수많은 결정에서 같은 쪽을 고르게 하는 기준이다.

${LEVEL}
- 이긴 인사이트 ${run.insights?.length || 0}건은 **전술**이다. 방향의 재료가 아니다. 인사이트를 넓게 고쳐 써서 방향으로 올리지 않는다. 방향을 먼저 세우고, 그 인사이트가 방향 아래에 놓이는지만 본다.

## 방향 후보 ${n}개 (${ids.join(' · ')})
- 후보마다 **운영의 기준이 다르다**. 표현만 다르면 같은 후보다.
- 후보마다 출발하는 충돌이 다르다. 아래 "출발 충돌"을 순서대로 하나씩 맡는다. 그 충돌을 한쪽으로 고르지 않고 푸는 기준을 세운다.
- 전체 판단과 팩트로 받친다. 후보마다 **서로 다른 노드 ${need.nodes}개 이상**의 판단, **팩트 ${need.facts}개 이상**.${need.tunnel ? ' 터널 판단을 반드시 포함한다.' : ''} 주어진 id만 쓴다.
- 근본 이슈의 판정 질문에 방향 전체로 답한다(\`answer\`).
- \`from\` → \`to\`: 지금 운영이 기준으로 삼는 것 → 이 방향이 기준으로 삼는 것. 팩트로 확인되는 것만 쓴다.
- \`keeps\`: 이미 잘하고 있어 이 방향이 더 키우는 것. 팩트에 없으면 비운다.
- \`drops\`: 이 방향을 고르면 하지 않는 것 1~2개.
- 기본 방향과 기준이 같으면 후보가 아니다.

## 글자 수 — 넘기지 않는다
\`name\` ${C.name}자(명사로 끝낸다) · \`line\` ${C.line}자 · \`standard\` ${C.standard}자 · \`from\`/\`to\` ${C.from}자 · \`keeps\` ${C.keeps}자 · \`drops\` 각 ${C.drop}자 · \`answer\` ${C.answer}자 이내.
설명 · 이유 · 수식어를 붙이지 않는다. 수치는 팩트 id로 대신한다.

## 출력 (JSON만)
{"candidates":[{"id":"D1","name":"","line":"방향 한 줄","standard":"운영 중 결정을 가르는 기준 한 문장","from":"","to":"","keeps":"","drops":[""],"answer":"","signals":["판단 id"],"facts":["F1"]}]}`,
    user: `${missionBlock(project)}

## 출발 충돌 — ${ids.join(' · ')}가 순서대로 맡는다
${j(spines.slice(0, n).map((sp, i) => ({ 후보: ids[i], 한쪽: `[${sp.a.id}] ${lensName(sp.a.lens)} — ${cut(sp.a.claim, 140)}`, 다른_쪽: `[${sp.b.id}] ${lensName(sp.b.lens)} — ${cut(sp.b.claim, 140)}` })))}

## 전체 판단 ${run.signals.filter((s) => !s.muted).length}건 — 노드별
${signalGroups(run, lensName)}

## 이긴 인사이트 — 전술이다. 방향으로 올리지 않는다
${j(tacticList(run))}

## 기본 방향 — 이 기준으로 돌아가지 않는다
${j(base ? { 이름: base.name, 한_줄: base.line, 기준: base.standard } : {})}
${note ? `\n## 다시 쓰는 이유\n${note}\n` : ''}
방향 후보 ${n}개를 JSON으로 낸다.`,
  };
}

/** 방향 판정 — 후보와 기본 방향을 견줘 하나를 고른다. 전술을 방향이라 부른 안은 진다. */
export function courseJudgePrompt(project, rivals, base) {
  const C = COURSE_CAPS;
  const parts = partsOf(project);
  return {
    system: `${common(project)}

## 너의 역할 — 방향 판정
운영 방향 후보 ${rivals.length}개와 기본 방향(BASE) 하나를 견줘 순서를 매긴다.

${LEVEL}

## 보는 순서
1. **층위** — 전술 하나를 방향이라 부른 안은 진다.${parts.length > 1 ? ` ${parts.map((c) => c.name).join(' · ')} 파트 모두가 이 문장을 자기 일의 기준으로 쓸 수 있어야 방향이다.` : ''}
2. **기준의 힘** — 운영 중 부딪히는 결정에서 실제로 한쪽을 고르게 하는가. 무엇을 하지 않는지가 보이는가.
3. **과제 적합** — 근본 이슈의 판정 질문에 답하는가. 팩트로 확인되는 문제를 풀고, 이미 잘하는 것을 키우는가.
4. **차별** — 기본 방향과 **운영의 기준**이 다른가. 표현이 달라도 기준이 같으면 "같음"이다. 방향이 넓다는 이유만으로 "같음"이라 하지 않는다.
5. **안정** — 기간 내내 지킬 수 있는가. 한 번의 행사로 끝나는 기준은 약하다.
- 뚜렷함은 좁다는 뜻이 아니다. 특이한 장치가 있다는 이유로 올려 주지 않는다.
- 기본 방향이 가장 나으면 그렇게 쓴다.

## 출력 (JSON만)
- \`order\`: 가장 나은 것부터. 후보 id와 "BASE"를 모두 넣는다.
- \`items\`: 후보마다 층위(\`level\`: "방향" 또는 "전술"), 기본 방향과 기준이 다른지(\`vsBase\`: "다름" 또는 "같음"), 강한 점과 약한 점(각 ${C.note}자 이내).
- \`why\`: 1위를 고른 이유. ${C.why}자 이내.
- \`borrow\`: 1위가 다른 후보에서 가져오면 좋은 것. 최대 2개, 각 ${C.note}자 이내.
- \`risk\`: 1위 방향이 실행에서 무너질 수 있는 지점 하나. ${C.note}자 이내.
{"order":["D2","BASE","D1","D3"],"items":[{"id":"D1","level":"방향","vsBase":"다름","strong":"","weak":""}],"why":"","borrow":[{"from":"D1","what":""}],"risk":""}`,
    user: `${missionBlock(project)}

## 방향 후보
${j(rivals.map((r) => ({ id: r.id, 이름: r.name, 한_줄: r.line, 기준: r.standard, 지금: r.from, 바뀌는_것: r.to, 키우는_것: r.keeps, 하지_않는_것: r.drops, 판정_질문의_답: r.answer, 근거_넓이: `노드 ${r.breadth.nodes}개 · 판단 ${r.signals.length}건 · 팩트 ${r.facts.length}건`, ...(r.flags.length ? { 표시: r.flags } : {}) })))}

## 기본 방향 (BASE)
${j(base ? { 이름: base.name, 한_줄: base.line, 기준: base.standard } : {})}

순서를 매겨 JSON으로 낸다.`,
  };
}

/** 3층 전개 — 정해진 방향 아래로 축 · 연간 단계 · 파트별 × 단계별 할 일을 내려 쓴다. */
export function layersPrompt(project, run, direction, judge, lensName, need, note = '') {
  const C = COURSE_CAPS;
  const parts = partsOf(project);
  const partRule = parts.length > 1
    ? `파트는 아래 ${parts.length}개다. \`part\`에 id를 적는다.\n${parts.map((c) => `  - ${c.id}: ${c.name} — ${c.role}`).join('\n')}`
    : '파트는 과제에 맞게 3~4개로 스스로 정한다. `part`에는 a1, a2처럼 적고 `label`에 이름을 쓴다.';
  return {
    system: `${common(project)}

## 너의 역할 — 방향을 아래로 내린다
운영 방향(1층)은 정해졌다. 바꾸지 않는다. 그 아래 두 층을 쓴다. 위에서 아래로 쓴다 — 인사이트를 모아 올리지 않는다.

## 2층 — 축과 단계
- \`axes\`: 방향을 운영에서 지키게 하는 **원칙 3~4개**. 파트 이름이 아니다. 모든 파트에 걸리는 판단 기준이다.
  \`rule\`은 결정을 가르는 문장으로 쓴다("A보다 B를 먼저", "~이면 ~한다" 꼴). 축마다 서로 다른 노드의 판단 3개 이상, 팩트 2개 이상.
- \`phases\`: 시간 순서 3~4단계. 미션에 기간이 있으면 그 기간으로 나눈다. \`line\`은 그 시기에 이뤄야 하는 상태다.

## 3층 — 파트별 × 단계별 할 일
- ${partRule}
- 파트마다 \`guide\`(이 파트가 방향을 받는 방법 한 줄)와 \`cells\`를 쓴다. \`cells\`는 **단계마다 하나씩**: 할 일(\`move\`, "무엇을 한다" 꼴)과 그 할 일이 따르는 축(\`axis\`).
- 할 일은 방향과 축에서 내려온 것이어야 한다. 방향 없이도 할 일이면 쓰지 않는다. 파트마다 팩트 2개 이상.
- \`insights\`: 이긴 인사이트는 전술이다. 인사이트마다 짧은 이름과 한 줄을 붙이고 파트 · 단계 · 축에 놓는다. 방향에 맞지 않으면 \`fit\`을 "맞지 않음"으로 하고 억지로 넣지 않는다.
- 판정이 남긴 "가져올 것"과 "무너질 수 있는 지점"을 축이나 할 일에 반영한다.

## 나머지
- \`fixes\`: 지금의 문제(팩트로 확인되는 것)와 이 방향이 그것을 바꾸는 방법. 최대 4개.
- \`boosts\`: 이미 잘하는 것(팩트로 확인되는 것)과 더 키우는 방법. 최대 3개. 팩트에 없으면 비운다.
- \`gaps\`: 이 방향이 서려면 확인해야 하는 것. 최대 3개.
- 전체로 서로 다른 팩트 ${need.facts}개 이상, 인사이트에 쓰이지 않은 판단 ${need.fresh}개 이상을 쓴다. 주어진 id만 쓴다.

## 글자 수 — 넘기지 않는다
보는 판이다. 설명 · 이유 · 수식어를 붙이지 않는다.
축 \`name\` ${C.axis}자(명사로 끝낸다) · \`rule\` ${C.rule}자 · 단계 \`when\` ${C.when}자 · \`line\` ${C.phase}자 · \`guide\` ${C.guide}자 · \`move\` ${C.move}자 · \`pain\`/\`strength\` ${C.pain}자 · \`answer\` ${C.fix}자 · 인사이트 \`name\` ${C.axis}자 · \`line\` ${C.line}자 이내.

## 출력 (JSON만)
{"axes":[{"id":"A1","name":"","rule":"","signals":["판단 id"],"facts":["F1"]}],"phases":[{"id":"P1","when":"","line":""}],"parts":[{"part":"","label":"","guide":"","cells":[{"phase":"P1","move":"","axis":"A1"}],"facts":["F1"],"signals":["판단 id"]}],"insights":[{"id":"N1","name":"","line":"","part":"","phase":"P1","axis":"A1","fit":"맞음"}],"fixes":[{"pain":"","answer":"","facts":["F1"]}],"boosts":[{"strength":"","answer":"","facts":["F1"]}],"gaps":[""]}`,
    user: `${missionBlock(project)}

## 운영 방향 (1층) — 바꾸지 않는다
${j({ 이름: direction.name, 한_줄: direction.line, 기준: direction.standard, 지금: direction.from, 바뀌는_것: direction.to, 키우는_것: direction.keeps, 하지_않는_것: direction.drops, 근거_판단: direction.signals, 근거_팩트: direction.facts })}

## 판정이 남긴 것
${j({ 가져올_것: (judge?.borrow || []).map((b) => b.what), 무너질_수_있는_지점: judge?.risk || '' })}

## 이긴 인사이트 — 전술로 배치한다
${j((run.insights || []).map((i) => ({ id: i.id, 제목: i.title, 컨셉: cut(i.concept, 200), 판정: i.from?.verdict || '' })))}

## 전체 판단 — 노드별
${signalGroups(run, lensName)}
${note ? `\n## 다시 쓰는 이유\n${note}\n` : ''}
축 · 단계 · 파트별 할 일을 JSON으로 낸다.`,
  };
}
