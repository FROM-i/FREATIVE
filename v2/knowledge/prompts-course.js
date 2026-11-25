// 운영 방향 — 전략 과제의 맨 위 층.
//   컨셉 과제는 "문제를 푸는 안 하나"를 낸다. 전략 과제(운영 · 연간 플랜)는 그 위에 "무엇을 기준으로 운영하는가"가 먼저 있어야 한다.
//   방향을 인사이트에서 올려 쓰면 전술을 일반화한 문장이 된다. 그래서 방향은 전체 판단과 팩트에서 따로 쓰고, 방향끼리 겨루고, 그 아래로 내려 쓴다.
//     1층 운영 방향 — 업무 영역 전부를 하나로 운영하는 기준
//     2층 영역별 전략 — 영역마다 하나 (예: 프로모션 관리 전략)
//     3층 전술 — 영역 전략 아래의 여러 할 일. 단계별로 놓는다. 이긴 인사이트는 여기에 전술 하나로 놓인다
//   방향은 이슈 높이의 판단을 올려 써서는 나오지 않는다. 노드가 방향 높이에서 한 번 더 판단한다(통합 1 + 영역마다 1).
//   그 판단끼리 이어 충돌을 찾고, 충돌을 푸는 자리에서 방향 후보를 쓴다. 이슈 높이의 판단은 전술의 재료로 내려간다.
//   방향인지 가르는 시험대는 "업무 영역"이다. 파트(직무)와 기간만으로 가르면, 한 영역의 대상(예: 프로모션의 혜택)을
//   주어로 삼은 문장이 통과한다 — 모든 파트가 그 대상을 만지기 때문이다.
import { common, missionBlock, toJson as j } from './prompts.js';
import { validFacts } from './facts.js';
import { categoriesOf, categoryById } from './tags.js';

export const COURSE_CAPS = { name: 16, line: 44, standard: 64, from: 30, to: 30, keeps: 34, drop: 26, answer: 60, axis: 14, rule: 42, when: 12, phase: 36, guide: 42, move: 28, pain: 30, fix: 32, why: 90, note: 48, area: 14, areaNote: 40, cover: 36, claim: 120, swap: 56, casee: 40 };

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

const groupBy = (list, key) => { const m = new Map(); for (const x of list) { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
/** 방향 높이의 판단을 노드별로 적는다 */
const highGroups = (signals, lensName, famName) => [...groupBy(signals, (x) => x.lens)].map(([lens, list]) => `### ${lensName(lens)} (${famName(list[0].family)})\n${list.map((x) => `- [${x.id}] ${x.claim}${x.facts?.length ? ` · ${x.facts.join(' ')}` : ''}`).join('\n')}`).join('\n');
const FAM = { identity: '아이덴티티 — 더프롬의 기준', airplane: '사조', tunnel: '터널 — 팩트에 묶인 판단' };
const famName = (f) => FAM[f] || f;

/** 노드가 방향 높이에서 본다 — 통합 판단 하나와 영역마다 판단 하나. 이슈 높이에서 낸 판단은 배경으로만 받는다. */
export function courseLensPrompt(project, lens, areas, own = []) {
  const C = COURSE_CAPS;
  const ism = lens.family === 'airplane';
  const source = ism
    ? `## 이 사조의 카드 원문\n${lens.card}\n\n카드의 "가져올 것 · 두고 올 것"은 지난 적용 메모다. 규칙으로 쓰지 않는다.`
    : `## 이 노드의 원문 (더프롬 방법론 CORE)\n${lens.text}\n\n판정 기준: ${lens.criteria}`;
  return {
    system: `${common(project)}

## 너의 역할 — 노드 "${lens.name}", 방향 높이
너는 더프롬 브레인의 노드 하나다. 지금까지는 이슈 하나하나를 봤다. 이제 한 층 위를 본다.
**이 과제의 업무 영역 전부를 어떻게 하나로 운영해야 하는가, 그리고 영역마다 전략은 무엇이어야 하는가**를 네 기준 하나로만 본다. 다른 노드가 할 일을 대신하지 않는다.
화면 · 기능 · 표현 장치를 내지 않는다. 그것은 아래 층(전술)의 일이다.

${source}

노드의 질문: ${lens.ask}
(이 질문의 "이슈" 자리에 "이 과제의 운영 전체"와 "각 업무 영역"을 넣어 읽는다)

## 업무 영역
${areaList(areas)}

## 생각하는 순서 — 건너뛰지 않는다
1. 원문을 읽는다. 이 기준이 왜 있는지, 무엇을 막으려는 것인지를 먼저 이해한다.
2. **통념(against).** 이런 운영 과제를 업계가 통상 어떻게 굴리는가. 네 기준으로 보면 그 방식의 무엇이 틀렸거나 비어 있는가. 한 문장.
3. **통합(ALL).** 네 기준으로 보면 영역들을 하나로 묶는 것은 무엇이어야 하는가. 판단 하나.
   - 한 영역의 대상(그 영역에서만 다루는 것)을 다른 영역에 옮겨 붙이지 않는다. 영역 하나를 빼도 문장이 그대로면 통합 판단이 아니다.
   - 누구에게나 맞는 말을 쓰지 않는다. 네 기준이 아니면 나오지 않는 판단이어야 한다 — 다른 노드의 이름으로 바꿔 써도 성립하면 버린다.
4. **영역별.** 영역마다, 네 기준이 그 영역에 요구하는 방침을 판단 하나로 낸다. 그 영역의 과업 전체(미션과 팩트북에 적힌 요구)를 본다. 낼 것이 없는 영역은 건너뛴다.
5. **통제 범위.** 우리가 정할 수 없는 구간(미션 · 팩트북에 남이 관리한다고 적힌 것)은 판단의 대상이 아니라 조건으로 둔다.

## 규칙
- 판단은 "그래서 무엇을 기준으로 삼거나, 지키거나, 바꾸는가"까지 쓴다. 관찰만 쓰지 않는다. \`claim\` ${C.claim}자 이내.
- \`scope\`: 통합 판단은 "ALL", 영역 판단은 영역 id. 통합 판단 1개는 반드시 낸다. 영역마다 최대 1개.
- \`stance\`: keep(지킬 관성) · change(바꿀 해석) · limit(넘지 않을 경계) · open(비어 있는 자리)
${lens.family === 'tunnel' ? '- 너는 터널의 레이어다. 팩트북에서 출발한다. 판단이 기대는 팩트의 id를 `facts`에 적는다.' : '- 판단이 팩트북의 사실에 기대면 그 id를 `facts`에 적는다. 주어진 id만 쓴다.'}

## 출력 (JSON만)
{"against":"네 기준으로 본 통념의 틀린 점","signals":[{"scope":"ALL","claim":"판단 한 문장","basis":"원문의 어느 대목에서 나왔나 한 문장","stance":"keep|change|limit|open","facts":["F1"]}]}`,
    user: `${missionBlock(project, lens.id)}

## 네가 이슈 높이에서 낸 판단 — 배경이다. 넓게 고쳐 써서 올리지 않는다
${own.length ? own.map((x) => `- ${cut(x.claim, 120)}`).join('\n') : '(없음)'}

노드 "${lens.name}"의 방향 높이 판단을 JSON으로 낸다.`,
  };
}

/** 통합 판단끼리 잇는다 — 충돌이 방향 후보의 출발점이 된다 */
export function courseLinkPrompt(project, signals, lensName) {
  return {
    system: `${common(project)}

## 너의 역할 — 통합 판단을 잇는다
노드마다 "영역들을 무엇으로 하나로 묶을 것인가"를 따로 판단했다. 그 판단끼리의 관계를 찾는다.
- **충돌(tension)**: 둘을 동시에 그대로 따를 수 없다. 한쪽을 따르면 다른 쪽이 깎인다. 표현만 다른 것, 강조점만 다른 것은 충돌이 아니다.
- **강화(reinforce)**: 한쪽이 서면 다른 쪽이 더 잘 선다.
- 서로 다른 노드의 판단끼리만 잇는다. 이유(\`why\`)를 쓸 수 없는 연결은 내지 않는다. 40자 이내.
- 충돌을 먼저 찾는다. 충돌 3~6개, 강화는 최대 6개.

## 출력 (JSON만)
{"edges":[{"from":"판단 id","to":"판단 id","type":"tension","why":""}]}`,
    user: `## 과제
${j({ 프로젝트: project.title, 무엇: project.brief?.what })}

## 통합 판단
${signals.map((x) => `- [${x.id}] ${lensName(x.lens)} — ${x.claim}`).join('\n')}

연결을 JSON으로 낸다.`,
  };
}

/** 방향 후보 3개 — 노드가 방향 높이에서 낸 판단의 충돌을 푸는 자리에서 쓴다. */
export function coursePrompt(project, run, spines, base, lensName, need, areas, high, note = '') {
  const C = COURSE_CAPS;
  const n = 3;
  const ids = Array.from({ length: n }, (_, i) => `D${i + 1}`);
  const all = high.filter((x) => x.scope === 'ALL');
  const byArea = areas.map((a) => `### ${a.id} ${a.name}\n${high.filter((x) => x.scope === a.id).map((x) => `- [${x.id}] ${lensName(x.lens)} — ${x.claim}`).join('\n') || '(판단 없음 — 미션과 팩트북에서 읽는다)'}`).join('\n');
  return {
    system: `${common(project)}

## 너의 역할 — 통합 운영 방향
이 과제는 장치 하나를 고르는 과제가 아니다. 업무 영역 ${areas.length}개를 **하나로 운영하는 방향**을 정하는 과제다.
방향은 "무엇을 만드는가"가 아니라 "무엇을 기준으로 운영하는가"다. 영역마다 따로 굴러가는 일을 같은 기준으로 굴러가게 한다.

${levelBlock(areas)}

## 방향은 충돌을 푸는 자리에서 나온다
- 아래 "통합 판단"은 노드마다 방향 높이에서 따로 본 것이다. 강한 판단 하나를 골라 다시 쓰면 방향이 아니다. **서로 부딪히는 판단을 둘 다 살리는 기준**을 세운다.
- 후보마다 출발하는 충돌이 다르다. "출발 충돌"을 순서대로 하나씩 맡는다. 한쪽을 고르거나 반씩 섞지 않는다. 어떻게 푸는지 \`how\`에 쓴다.
- **아이덴티티 노드의 판단이 뼈대다.** 후보마다 아이덴티티 판단 ${need.identity}개 이상이 기준을 만든 근거여야 한다. 터널 판단은 그 기준이 이 클라이언트에 맞는지를 받친다.
- **바꿔치기 시험(\`swap\`)**: 경쟁 대행사가 이 문장을 그대로 제안서에 쓸 수 있는가. 쓸 수 있으면 방향이 아니라 구호다. 쓸 수 없는 이유를 쓴다.
- 이긴 인사이트 ${run.insights?.length || 0}건은 **전술**이다. 넓게 고쳐 써서 방향으로 올리지 않는다.

## 방향 후보 ${n}개 (${ids.join(' · ')})
- 후보마다 **영역을 묶는 축이 다르다**. 표현만 다르면 같은 후보다.
- \`covers\`: **영역마다 한 줄씩**, 이 방향이면 그 영역에서 무엇이 달라지는가. 그 영역의 과업에 맞는 말로 쓴다 — 다른 영역의 대상을 옮겨 붙인 줄은 걸린 것이 아니다.
- **약속할 수 있는 것만 기준으로 삼는다.** 우리가 정할 수 없는 구간(남이 관리)은 기준의 판정 대상이 아니다.
- 근거: 서로 다른 노드 ${need.nodes}개 이상의 통합 · 영역 판단, 팩트 ${need.facts}개 이상. 주어진 id만 쓴다.
- 근본 이슈의 판정 질문에 방향 전체로 답한다(\`answer\`).
- \`from\` → \`to\`: 이 업계가 당연하게 여기는 운영 관행 → 이 방향이 그것을 다르게 읽은 것. 팩트로 확인되는 것만 쓴다.
- \`keeps\`: 이미 잘하고 있어 그대로 두고 더 키우는 것. 팩트에 없으면 비운다.
- \`drops\`: 이 방향을 고르면 하지 않는 것 1~2개.
- 기본 방향과 기준이 같으면 후보가 아니다.

## 글자 수 — 넘기지 않는다
\`name\` ${C.name}자(명사로 끝낸다) · \`line\` ${C.line}자 · \`standard\` ${C.standard}자 · \`covers\`의 \`line\` ${C.cover}자 · \`how\` ${C.swap}자 · \`swap\` ${C.swap}자 · \`from\`/\`to\` ${C.from}자 · \`keeps\` ${C.keeps}자 · \`drops\` 각 ${C.drop}자 · \`answer\` ${C.answer}자 이내.
설명 · 이유 · 수식어를 붙이지 않는다. 수치는 팩트 id로 대신한다.

## 출력 (JSON만)
{"candidates":[{"id":"D1","name":"","line":"방향 한 줄","standard":"운영 중 결정을 가르는 기준 한 문장","how":"출발 충돌을 푸는 방법","swap":"경쟁사가 그대로 쓸 수 없는 이유","covers":[{"area":"${areas[0].id}","line":"이 영역에서 달라지는 것"}],"from":"","to":"","keeps":"","drops":[""],"answer":"","signals":["판단 id"],"facts":["F1"]}]}`,
    user: `${missionBlock(project)}

## 출발 충돌 — ${ids.join(' · ')}가 순서대로 맡는다
${spines.length ? j(spines.slice(0, n).map((sp, i) => ({ 후보: ids[i], 한쪽: `[${sp.a.id}] ${lensName(sp.a.lens)} — ${sp.a.claim}`, 다른_쪽: `[${sp.b.id}] ${lensName(sp.b.lens)} — ${sp.b.claim}`, 부딪히는_이유: sp.edge.why || '' }))) : '(찾은 충돌이 없다 — 후보마다 서로 다른 아이덴티티 판단에서 출발한다)'}${spines.length && spines.length < n ? `\n충돌이 ${spines.length}개뿐이다. 나머지 후보는 아직 쓰이지 않은 아이덴티티 판단에서 출발한다.` : ''}

## 통합 판단 ${all.length}건 — 노드가 방향 높이에서 낸 것
${highGroups(all, lensName, famName)}

## 영역별 판단
${byArea}

## 이긴 인사이트 — 전술이다. 방향으로 올리지 않는다
${j(tacticList(run))}

## 기본 방향 — 이 기준으로 돌아가지 않는다
${j(base ? { 이름: base.name, 한_줄: base.line, 기준: base.standard } : {})}
${note ? `\n## 다시 쓰는 이유\n${note}\n` : ''}
방향 후보 ${n}개를 JSON으로 낸다.`,
  };
}

/** 방향 판정 — 후보와 기본 방향을 견줘 하나를 고른다. 통과가 기본값이 아니다. */
export function courseJudgePrompt(project, rivals, base, areas, lensName = (x) => x) {
  const C = COURSE_CAPS;
  const name = (id) => areas.find((a) => a.id === id)?.name || id;
  return {
    system: `${common(project)}

## 너의 역할 — 방향 판정
통합 운영 방향 후보 ${rivals.length}개와 기본 방향(BASE) 하나를 견줘 순서를 매긴다.
**통과가 기본값이 아니다.** 시험마다 근거를 쓸 수 있을 때만 통과다. 쓸 수 없으면 떨어뜨린다. 후보 전원이 떨어질 수 있다.

${levelBlock(areas)}

## 시험 — 후보마다 차례로 본다
1. **영역 시험(\`reaches\`)** — 영역마다, 이 기준이 그 영역에서 가르는 **실제 결정 하나**(\`case\`)를 쓴다. 그 영역의 과업에서 나온 결정이어야 한다. 다른 영역의 대상을 빌려 온 결정(예: 보안 영역의 결정을 프로모션의 대상으로 설명)은 쓰지 않는다. 쓸 수 없는 영역은 뺀다. 걸리는 영역이 하나뿐이면 "영역 전략", 장치 이름을 지우면 서지 않으면 "전술"이다.
2. **고유 시험(\`own\`)** — 경쟁 대행사가 이 문장을 그대로 제안서에 쓸 수 있는가. 쓸 수 있으면 "범용", 이 과제의 팩트와 더프롬의 기준(아이덴티티 노드의 판단)에서만 나오면 "고유". "고객 중심", "여정 기준", "데이터 기반"의 변형은 범용이다.
3. **약속 시험(\`control\`)** — 기준의 판정 대상이 우리가 통제하는 범위 안에 있는가. 남이 관리하는 구간의 결과를 기준으로 삼았으면 "일부 불가".
4. **기준의 힘** — 운영 중 부딪히는 결정에서 실제로 한쪽을 고르게 하는가. 무엇을 하지 않는지가 보이는가.
5. **과제 적합** — 근본 이슈의 판정 질문과 미션의 성공 기준 · 평가 항목에 답하는가. 빠진 항목이 있으면 약점에 쓴다.
6. **차별** — 기본 방향과 **운영의 기준**이 다른가. 표현이 달라도 기준이 같으면 "같음"이다.

## 순서
방향 · 고유 · 통제 가능한 후보를 먼저 세운다. 범용이거나 영역 전략인 후보는 그 뒤다. 기본 방향이 가장 나으면 그렇게 쓴다.

## 출력 (JSON만)
- \`order\`: 가장 나은 것부터. 후보 id와 "BASE"를 모두 넣는다.
- \`items\`: 후보마다 \`level\`("방향" · "영역 전략" · "전술"), \`reaches\`(영역 id와 \`case\` ${C.casee}자 이내), \`own\`("고유" · "범용"), \`control\`("가능" · "일부 불가"), \`vsBase\`("다름" · "같음"), 강한 점과 약한 점(각 ${C.note}자 이내).
- \`why\`: 1위를 고른 이유. ${C.why}자 이내. \`borrow\`: 1위가 다른 후보에서 가져오면 좋은 것. 최대 2개, 각 ${C.note}자 이내. \`risk\`: 1위 방향이 실행에서 무너질 수 있는 지점 하나. ${C.note}자 이내.
{"order":["D2","BASE","D1","D3"],"items":[{"id":"D1","level":"방향","reaches":[{"area":"${areas[0].id}","case":"이 영역에서 가르는 결정"}],"own":"고유","control":"가능","vsBase":"다름","strong":"","weak":""}],"why":"","borrow":[{"from":"D1","what":""}],"risk":""}`,
    user: `${missionBlock(project)}

## 방향 후보
${j(rivals.map((r) => ({ id: r.id, 이름: r.name, 한_줄: r.line, 기준: r.standard, 영역마다_달라지는_것: Object.fromEntries(r.covers.map((c) => [`${c.area} ${name(c.area)}`, c.line])), 충돌을_푸는_방법: r.how, 경쟁사가_못_쓰는_이유: r.swap, 관행: r.from, 다르게_읽은_것: r.to, 키우는_것: r.keeps, 하지_않는_것: r.drops, 판정_질문의_답: r.answer, 기준을_만든_노드: r.lenses.map(lensName), 근거_넓이: `노드 ${r.breadth.nodes}개(아이덴티티 ${r.breadth.identity}) · 판단 ${r.signals.length}건 · 팩트 ${r.facts.length}건`, ...(r.flags.length ? { 표시: r.flags } : {}) })))}

## 기본 방향 (BASE)
${j(base ? { 이름: base.name, 한_줄: base.line, 기준: base.standard } : {})}

순서를 매겨 JSON으로 낸다.`,
  };
}

/** 아래로 내린다 — 정해진 방향 아래로 영역별 전략과 그 아래의 전술을 단계별로 쓴다. */
export function layersPrompt(project, run, direction, judge, lensName, need, areas, high, note = '') {
  const C = COURSE_CAPS;
  const parts = partsOf(project);
  const byArea = areas.map((a) => `### ${a.id} ${a.name}\n${high.filter((x) => x.scope === a.id).map((x) => `- [${x.id}] ${lensName(x.lens)} — ${x.claim}${x.facts?.length ? ` · ${x.facts.join(' ')}` : ''}`).join('\n') || '(판단 없음 — 미션과 팩트북에서 읽는다)'}`).join('\n');
  return {
    system: `${common(project)}

## 너의 역할 — 방향을 아래로 내린다
통합 운영 방향(1층)은 정해졌다. 바꾸지 않는다. 그 아래 두 층을 쓴다. 위에서 아래로 쓴다 — 인사이트를 모아 올리지 않는다.

## 업무 영역
${areaList(areas)}

## 2층 — 영역별 전략
- 영역마다 **전략 하나**를 쓴다(\`name\`, \`line\`). 방향이 그 영역에서 어떤 방침이 되는가다.
- **방향 문장에 영역 이름만 바꿔 붙이지 않는다.** 영역 전략은 그 영역의 과업 전체(미션과 팩트북에 적힌 요구)를 덮어야 한다. 아래 "영역별 판단"은 노드가 그 영역을 따로 본 것이다. 거기서 출발한다.
- 미션의 성공 기준 · 평가 항목마다 어느 영역 전략이 답하는지 스스로 확인한다. 답하지 못한 항목은 \`gaps\`에 적는다.
- 영역 전략은 전술 하나가 아니다. 그 아래에 서로 다른 전술이 여러 개 달릴 수 있어야 한다. 이긴 인사이트 하나를 이름만 바꿔 영역 전략으로 올리지 않는다.
- 영역마다 근거 판단 2개 이상(영역별 판단 또는 이슈 높이의 판단), 팩트 2개 이상.

## 3층 — 전술
- \`phases\`: 시간 순서 3~4단계. 미션에 기간이 있으면 그 기간으로 나눈다. \`line\`은 그 시기에 이뤄야 하는 상태다.
- 영역마다 \`tactics\`를 쓴다. **영역마다 ${need.tactics}개 이상, 단계마다 1개 이상.** 전술마다 단계(\`phase\`), 할 일(\`move\`, "무엇을 한다" 꼴), 맡는 파트(\`parts\`)를 적는다.
- 전술은 그 영역의 전략에서 내려온 것이어야 한다. 전략 없이도 할 일이면 쓰지 않는다. 한 영역의 전술이 한 가지 종류로만 채워지지 않게 한다. 아래 "이슈 높이의 판단"이 전술의 재료다.${parts.length > 1 ? `\n- 파트 id: ${parts.map((c) => `${c.id}(${c.name})`).join(' · ')}. 모든 파트가 어딘가의 전술을 맡는다.` : ''}
- **이긴 인사이트는 전술 하나다.** 맞는 영역의 전술로 놓고 그 전술의 \`insight\`에 id를 적는다. 그 영역의 다른 전술과 나란히 놓인다. 방향에 맞지 않으면 놓지 않는다.
- \`insights\`: 인사이트마다 짧은 이름과 한 줄, 놓았는지(\`fit\`: "맞음" 또는 "맞지 않음").
- 우리가 정할 수 없는 구간의 일은 "건의한다"로 쓴다. 판정이 남긴 "가져올 것"과 "무너질 수 있는 지점"을 영역 전략이나 전술에 반영한다.

## 나머지
- \`fixes\`: 지금의 문제(팩트로 확인되는 것)와 이 방향이 그것을 바꾸는 방법. 최대 4개. 한 영역에 몰리지 않게 한다.
- \`boosts\`: 이미 잘하는 것(팩트로 확인되는 것)과 더 키우는 방법. 최대 3개. 팩트에 없으면 비운다.
- \`gaps\`: 이 방향이 서려면 확인해야 하는 것. 최대 3개.
- 전체로 서로 다른 팩트 ${need.total}개 이상, 인사이트에 쓰이지 않은 이슈 높이의 판단 ${need.fresh}개 이상을 쓴다. 주어진 id만 쓴다.

## 글자 수 — 넘기지 않는다
보는 판이다. 설명 · 이유 · 수식어를 붙이지 않는다.
영역 전략 \`name\` ${C.name}자(명사로 끝낸다) · \`line\` ${C.line}자 · 단계 \`when\` ${C.when}자 · \`line\` ${C.phase}자 · \`move\` ${C.move}자 · \`pain\`/\`strength\` ${C.pain}자 · \`answer\` ${C.fix}자 · 인사이트 \`name\` ${C.axis}자 · \`line\` ${C.line}자 이내.

## 출력 (JSON만)
{"phases":[{"id":"P1","when":"","line":""}],"areas":[{"area":"${areas[0].id}","name":"영역 전략의 이름","line":"영역 전략 한 줄","tactics":[{"phase":"P1","move":"","parts":["${parts[0]?.id || 'planning'}"],"insight":""}],"facts":["F1"],"signals":["판단 id"]}],"insights":[{"id":"N1","name":"","line":"","fit":"맞음"}],"fixes":[{"pain":"","answer":"","facts":["F1"]}],"boosts":[{"strength":"","answer":"","facts":["F1"]}],"gaps":[""]}`,
    user: `${missionBlock(project)}

## 통합 운영 방향 (1층) — 바꾸지 않는다
${j({ 이름: direction.name, 한_줄: direction.line, 기준: direction.standard, 영역마다_달라지는_것: Object.fromEntries(direction.covers.map((c) => [c.area, c.line])), 관행: direction.from, 다르게_읽은_것: direction.to, 키우는_것: direction.keeps, 하지_않는_것: direction.drops })}

## 판정이 남긴 것
${j({ 가져올_것: (judge?.borrow || []).map((b) => b.what), 무너질_수_있는_지점: judge?.risk || '' })}

## 영역별 판단 — 노드가 영역 높이에서 낸 것. 영역 전략의 출발점
${byArea}

## 이긴 인사이트 — 전술 하나로 놓는다
${j((run.insights || []).map((i) => ({ id: i.id, 제목: i.title, 컨셉: cut(i.concept, 200), 판정: i.from?.verdict || '' })))}

## 이슈 높이의 판단 — 전술의 재료
${signalGroups(run, lensName)}
${note ? `\n## 다시 쓰는 이유\n${note}\n` : ''}
영역별 전략과 전술을 JSON으로 낸다.`,
  };
}
