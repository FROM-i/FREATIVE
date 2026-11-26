// 방향 — 모든 과제가 같은 길을 간다.
//   ① 모든 노드가 과제 전체를 보고 판단한다(방향 높이). 이슈 하나에 붙지 않고 브리프의 무엇을 · 목적 · 성공 기준 · 대상 · 제약을 함께 본다.
//   ② 그 판단끼리 이어 충돌을 찾고, 충돌을 푸는 자리에서 더프롬의 방향을 정한다.
//   ③ 방향이 정해진 뒤 노드가 이슈마다 판단하고 겨뤄 전술을 낸다(이슈 높이). 이 단계의 모든 호출이 같은 방향을 받는다.
//   ④ 방향 → 영역별 전략 → 전술로 내려 쓴다. 전술마다 어느 노드의 판단에서 나왔는지 남긴다.
//   영역은 과제가 맡는 일의 범위다. 방향인지 가르는 시험대다 — 한 영역의 대상을 주어로 삼은 문장은 그 영역의 전략이다.
//   과제의 종류(캠페인 · 서비스 · 운영 · 제안)에 따라 길이 달라지지 않는다.
import { common, missionBlock, toJson as j } from './prompts.js';
import { validFacts } from './facts.js';
import { categoriesOf, categoryById } from './tags.js';

export const COURSE_CAPS = { name: 28, line: 44, standard: 64, from: 30, to: 30, keeps: 34, drop: 26, answer: 60, axis: 14, rule: 42, when: 12, phase: 36, guide: 42, move: 28, pain: 30, fix: 32, why: 90, note: 48, area: 14, areaNote: 40, cover: 36, claim: 120, swap: 56, casee: 40, object: 8 };

/** 방향 문장에 들어가면 전술이라는 표시가 되는 말 — 화면 · 기능 · 표현 장치의 이름 */
export const DEVICE_WORDS = ['화면', '버튼', '배너', '팝업', '탭', '칸', '카드', '쿠폰', '푸시', '아이콘', '위젯', '페이지', '슬롯', '알림창'];

const cut = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n)}…` : String(s || ''));
const areaList = (areas) => areas.map((a) => `- ${a.id}: ${a.name}${a.note ? ` — ${a.note}` : ''}${a.objects?.length ? ` · 이 영역만의 대상: ${a.objects.join(', ')}` : ''}`).join('\n');
const levelBlock = (areas) => `## 영역 — 이 과제가 맡는 일의 범위
${areaList(areas)}

## 층위 — 방향 · 영역 전략 · 전술을 가른다
- **방향**: 이 과제를 **무엇을 기준으로 풀 것인가**다. 브리프의 목적과 성공 기준에 닿고, 위 영역 **전부**에 걸린다. 이 문장만 읽고 영역마다 "그러면 이 영역은 이렇게 바뀐다"를 말할 수 있다.
- **영역 전략**: 한 영역 안의 방침이다. 한 영역의 대상(그 영역에서만 다루는 것 — 예: 프로모션 영역의 혜택 · 쿠폰 · 이벤트)을 주어로 삼은 문장은 아무리 넓게 써도 그 영역의 전략이다.
- **전술**: 특정 화면 · 기능 · 표현 장치 · 한 번의 실행이다. 영역 전략 아래의 여러 할 일 중 하나다.
- 가르는 법: ① 문장의 주어가 한 영역에만 있는 대상인가 → 영역 전략. ② 장치 이름(${DEVICE_WORDS.slice(0, 8).join(' · ')} 등)을 지우면 문장이 서지 않는가 → 전술. ③ 영역 하나를 빼도 문장이 그대로인가 → 그 영역에 걸리지 않는 것이다.
- **대상 낱말 검사**: 위 "이 영역만의 대상"에 적힌 낱말이 방향 문장(이름 · 한 줄 · 기준)에 한 영역 것만 들어 있으면 그 영역의 전략으로 본다. 영역마다 달라지는 것을 쓸 때도 다른 영역의 대상 낱말을 빌려 쓰지 않는다. 기계가 낱말을 대조한다.
- 파트(직무)와 기간에 걸친다는 것만으로는 방향이 아니다. 모든 파트가 만지는 대상이어도 한 영역의 대상이면 영역 전략이다. 영역이 하나뿐인 과제에서는 이 시험 대신 ②와 "이슈 하나의 답인가"로 가른다.
- **이슈 하나의 답은 방향이 아니다.** 이슈는 과제 안의 문제들이다. 방향은 브리프의 무엇을 · 목적 · 성공 기준 · 대상 · 제약을 함께 보고 세운다.
- 누구에게나 맞는 말("고객 중심", "데이터 기반", "안정적 운영", "통합 관리")은 기준이 아니다. 기준은 **무엇을 하지 않는지**가 보인다.`;

function signalGroups(run, lensName) {
  const used = new Set((run.insights || []).flatMap((i) => i.check?.used || []));
  const byLens = new Map();
  for (const s of run.signals.filter((x) => !x.muted)) { if (!byLens.has(s.lens)) byLens.set(s.lens, []); byLens.get(s.lens).push(s); }
  return [...byLens].map(([lens, list]) => `### ${lensName(lens)}${list[0].family === 'tunnel' ? ' (터널 — 팩트에 묶인 판단)' : ''}\n${list.map((s) => `- [${s.id}]${used.has(s.id) ? '' : ' (인사이트에 안 쓰임)'} ${cut(s.claim, 130)}${s.facts?.length ? ` · ${s.facts.join(' ')}` : ''}`).join('\n')}`).join('\n');
}
const tacticList = (run) => (run.insights || []).map((i) => ({ id: i.id, 제목: i.title, 판정: i.from?.verdict || '' }));
const partsOf = (project) => categoriesOf(project).map(categoryById).filter((c) => c.id !== 'integrated');

const OBJECT_RULE = `- \`objects\`: **그 영역에서만 다루는 대상**을 가리키는 낱말 3~6개. 브리프와 팩트북에 실제로 나오는 명사로 쓴다(예: 프로모션 영역이면 혜택 · 쿠폰 · 캠페인 · 이벤트 · 응모). 낱말 하나는 ${COURSE_CAPS.object}자 이내.
  - 다른 영역에서도 쓰는 말, 과제 전체에 쓰이는 말(운영, 고객, 타겟, 화면, 일정, 기획, 요청)은 넣지 않는다.
  - 이 낱말로 "방향이 한 영역의 대상에 붙었는가"를 기계가 대조한다. 영역이 하나뿐이면 비운다.`;

/** 영역의 대상 낱말 — 사람이 영역만 적고 낱말은 적지 않았을 때 뽑는다 */
export function courseObjectsPrompt(project, areas) {
  return {
    system: `${common(project)}

## 너의 역할 — 영역마다의 대상 낱말
아래 영역마다, 그 영역에서만 다루는 대상을 가리키는 낱말을 뽑는다.
${OBJECT_RULE}

## 영역
${areas.map((a) => `- ${a.id}: ${a.name}${a.note ? ` — ${a.note}` : ''}`).join('\n')}

## 출력 (JSON만)
{"areas":[{"id":"${areas[0].id}","objects":[""]}]}`,
    user: `${missionBlock(project, null, { high: true })}

영역마다의 대상 낱말을 JSON으로 낸다.`,
  };
}

/** 업무 영역 — 미션에 적혀 있지 않으면 미션에서 뽑는다. 사람이 고쳐 쓸 수 있다. */
export function courseScopePrompt(project) {
  const C = COURSE_CAPS;
  return {
    system: `${common(project)}

## 너의 역할 — 과제의 영역
이 과제가 맡는 **일의 범위**를 1~4개의 영역으로 나눈다. 브리프에 적힌 과업 · 결과물 · 범위를 그대로 따른다.
- 직무(기획 · 디자인 · 개발 · 마케팅)로 나누지 않는다. 직무는 영역 안에서 일하는 사람이다. UI/UX도 영역이 아니라 영역 안의 일이다.
- 시기(준비 · 진행 · 마무리)로 나누지 않는다.
- 보고 · 회의 같은 관리 수단은 영역이 아니다. 영역들을 묶는 수단이다.
- 이슈를 그대로 옮기지 않는다. 이슈는 문제이고 영역은 일의 범위다.
- 나눌 것이 없는 과제(결과물 하나)는 1개만 낸다. 억지로 쪼개지 않는다.
- \`name\` ${C.area}자 이내, \`note\`(그 영역에 드는 일) ${C.areaNote}자 이내.
${OBJECT_RULE}

## 출력 (JSON만)
{"areas":[{"name":"","note":"","objects":[""]}]}`,
    user: `${missionBlock(project, null, { high: true })}

과제의 영역을 JSON으로 낸다.`,
  };
}

/** 기본 방향 — 노드 없이 브리프만 읽고 낸 방향. 방향 후보를 견주는 기준이다. */
export function courseBasePrompt(project, areas) {
  const C = COURSE_CAPS;
  return {
    system: `${common(project)}

## 너의 역할 — 기본 방향
경험 많은 대행사가 이 브리프만 읽고 낼 법한 **방향 하나**를 쓴다. 특별한 관점 없이, 이 업계에서 통상 내는 방향이다.
이 과제를 무엇을 기준으로 풀 것인가를 쓴다. 아래 영역 전부에 걸려야 한다. 장치나 화면이 아니다.

## 영역
${areaList(areas)}

## 글자 수
\`name\` ${C.name}자 · \`line\` ${C.line}자 · \`standard\` ${C.standard}자 이내.

## 출력 (JSON만)
{"name":"","line":"방향 한 줄","standard":"과제 안의 결정을 가르는 기준 한 문장"}`,
    user: `${missionBlock(project, null, { high: true })}

기본 방향을 JSON으로 낸다.`,
  };
}

const FAM = { identity: '아이덴티티 — 더프롬의 기준', airplane: '사조', tunnel: '터널 — 팩트에 묶인 판단' };
const famName = (f) => FAM[f] || f;
const inArea = (x, id) => (x.scopes || [x.scope]).includes(id);
/** 사람이 쓴 목표 · 목적 · 핵심 포인트 — 고정된 문장이다. 조각이 여기에 닿는지를 본다 */
export function goalsOf(project) {
  const b = project?.brief || {}; const lines = (t) => String(t || '').split('\n').map((x) => x.replace(/^[\s\-·•*\d.)]+/, '').trim()).filter(Boolean);
  return [['목표', b.what], ['목적', b.purpose], ['성공 기준', b.success], ...lines(b.points).map((t) => ['핵심 포인트', t]), ['제약', b.note]].filter(([, t]) => String(t || '').trim()).slice(0, 9).map(([k, t], i) => ({ id: `G${i + 1}`, kind: k, text: String(t).trim() }));
}
const goalList = (goals) => goals.map((g) => `- ${g.id} ${g.kind}: ${cut(g.text, 260)}`).join('\n');
const atomLine = (x, lensName) => `${x.id} | ${lensName(x.lens)} | ${x.type}/${x.layer} | ${(x.scopes || [x.scope]).join(',')} | ${x.claim}`;

/** 구성 — 노드 하나가 과제를 읽고 "조각"을 낸다. 결론이 아니다. 결론은 여러 노드의 조각이 맞물려서 나온다. */
export function courseLensPrompt(project, lens, areas, own = []) {
  const C = COURSE_CAPS; const goals = goalsOf(project);
  const ism = lens.family === 'airplane';
  const source = ism
    ? `## 이 사조의 카드 원문\n${lens.card}\n\n카드의 "가져올 것 · 두고 올 것"은 지난 적용 메모다. 규칙으로 쓰지 않는다.`
    : `## 이 노드의 원문 (더프롬 방법론 CORE)\n${lens.text}\n\n판정 기준: ${lens.criteria}`;
  const many = areas.length > 1;
  return {
    system: `${common(project)}

## 너의 역할 — 노드 "${lens.name}"
너는 더프롬 브레인의 노드 하나다. 다른 노드가 무엇을 내는지는 모른다. 네 기준 하나로만 과제 전체를 읽는다.
**결론을 내지 않는다.** 방향 · 해법 · 제안 문장을 쓰지 않는다("~을 기준으로 삼는다", "~을 도입한다" 금지). 네 기준으로 읽었을 때 보이는 **조각**을 낸다. 결론은 나중에 여러 노드의 조각이 맞물려서 나온다.

${source}

노드의 질문: ${lens.ask}
(이 질문의 "이슈" 자리에 "이 과제 전체"와 "각 영역"을 넣어 읽는다)

## 영역
${areaList(areas)}

## 목표 — 사람이 쓴 문장이다. 고정이다
${goalList(goals)}

## 조각의 종류 (\`type\`)
- \`관찰\` — 네 기준으로 자료를 읽었을 때 보이는 것. 팩트를 옮겨 적지 않는다. 네 기준이어서 보이는 뜻을 쓴다.
- \`제약\` — 무엇을 하든 깨면 안 되는 것, 넘으면 안 되는 선. 우리가 통제할 수 없는 범위도 제약이다.
- \`해석\` — 이 과제(또는 그 일부)를 **무엇으로 볼 것인가**. 통념과 다르게 읽는 법. 해법이 아니라 보는 틀이다.
- \`지렛대\` — 이미 있어서 쓸 수 있는 것(자산 · 기회 · 반복되는 것).
조각의 층(\`layer\`): \`구조\`(그대로 두고 지킬 것에 관한 조각) · \`해석\`(새로 읽거나 바꿀 것에 관한 조각).

## 규칙
- **8개**를 낸다. 해석 2개 이상, 제약 1개 이상, 지렛대 1개 이상.
- ${many ? `영역을 모두 본다. 영역마다 1개 이상, 과제 전체에 걸리는 조각(\`scope\`: ["ALL"]) 2개 이상. 한 영역에 5개 넘게 몰지 않는다.` : '과제 전체에 걸리는 조각은 `scope`: ["ALL"]로 적는다.'}
- 조각 하나는 **한 가지 내용만**, ${C.claim - 50}자 이내, 평서문.
- 네 기준이 아니면 나오지 않는 조각이어야 한다. 다른 노드 이름으로 바꿔도 성립하면 버린다. \`only\`에 "다른 노드는 못 보고 이 기준이라서 보이는 것"을 먼저 쓰고 거기서 출발한다.
- **브리프 · 목표 · 이슈의 문장을 되받아 쓰지 않는다.** 과제는 재료이고 조각은 네 말이다.
- 팩트북에 기댄 조각은 \`facts\`에 그 id를 적는다. 팩트북에 없는 사실을 사실처럼 쓰지 않는다. \`goals\`에는 이 조각이 닿는 목표의 id를 적는다.

## 출력 (JSON만)
{"only":"이 기준이라서 보이는 것 한 문장","atoms":[{"type":"관찰","layer":"구조","text":"","scope":["${many ? areas[0].id : 'ALL'}"],"facts":["F1"],"goals":["G1"]}]}`,
    user: `${missionBlock(project, lens.id, { high: true })}
${own.length ? `\n## 네가 이슈마다 낸 판단 — 배경이다. 옮겨 적지 않는다\n${own.map((x) => `- ${cut(x.claim, 120)}`).join('\n')}\n` : ''}
노드 "${lens.name}"의 조각을 JSON으로 낸다.`,
  };
}

/** 관계 — 조각 사이의 지지와 모순을 매긴다. 결론을 내거나 좋은 조각을 고르지 않는다. 두 사람이 따로 매기고 합친다. */
export function courseRelPrompt(project, atoms, areas, lensName, reverse = false) {
  const goals = goalsOf(project); const list = reverse ? [...atoms].reverse() : atoms;
  return {
    system: `${common(project)}

## 너의 역할 — 조각 사이의 관계
노드 여러 개가 한 과제를 각자 읽고 낸 조각(관찰 · 제약 · 해석 · 지렛대)이 있다. 조각끼리의 관계를 매긴다. 결론을 내거나 좋은 조각을 고르는 일이 아니다. **관계만** 본다.

## 매길 것
1. \`edges\` — 조각 쌍의 관계. **서로 다른 노드의 조각끼리만** 잇는다.
   - \`support\`: 한쪽이 맞으면 다른 쪽이 더 설득력을 얻는다(전제 · 근거 · 같은 쪽을 다른 각도에서 받침). 말이 비슷하다는 이유만으로 잇지 않는다.
   - \`contradict\`: 둘을 동시에 그대로 받아들일 수 없다. 한쪽을 따르면 다른 쪽이 깎인다(우선순위가 부딪힘, 보는 틀이 서로 배타적, 한쪽이 지키라는 것을 다른 쪽이 바꾸라 함).
   - \`s\`(세기): 1 약함 · 2 보통 · 3 강함.
   - 조각마다 훑으면서 뚜렷한 관계만 적는다. 조각 하나당 support 0~4개, contradict 0~2개가 보통이다. 모순을 찾는 데 공을 들인다 — 해석끼리, 그리고 해석과 제약 사이에서 주로 나온다. 억지로 만들지는 않는다. 같은 쌍은 한 번만 적는다.
2. \`goalConflicts\` — 목표를 깨는 조각의 id. 특히 우리가 통제할 수 없는 범위(남이 관리하는 구간)의 결과를 전제로 하는 조각, 사람이 쓴 목표 · 제약과 어긋나는 조각.

## 영역
${areaList(areas)}

## 목표 — 사람이 쓴 문장
${goalList(goals)}

## 출력 (JSON만)
{"edges":[{"a":"조각 id","b":"조각 id","kind":"support","s":2}],"goalConflicts":["조각 id"]}`,
    user: `${missionBlock(project, null, { high: true })}

## 조각 ${list.length}개 — id | 노드 | 종류/층 | 범위 | 글
${list.map((x) => atomLine(x, lensName)).join('\n')}

관계를 JSON으로 낸다.`,
  };
}

/** 표현 — 수렴에서 나온 제안(서로 받치는 해석의 연합)을 방향 문장으로 옮긴다. 결론을 새로 정하지 않는다. */
export function coursePrompt(project, run, props, base, lensName, need, areas, high, note = '') {
  const C = COURSE_CAPS; const by = new Map(high.map((x) => [x.id, x]));
  const ids = props.map((_, i) => `D${i + 1}`);
  const line = (id) => { const x = by.get(id); return x ? `[${x.id}] ${lensName(x.lens)} · ${x.type} · ${(x.scopes || [x.scope]).join(',')} — ${x.claim}${x.facts?.length ? ` · ${x.facts.join(' ')}` : ''}` : ''; };
  return {
    system: `${common(project)}

## 너의 역할 — 제안을 방향 문장으로 옮긴다
노드들이 낸 조각을 한꺼번에 수렴시킨 결과, 서로 받치는 해석의 연합이 ${props.length}개 나왔다. 연합 하나가 제안 하나다. **연합마다 방향 하나**를 쓴다(${ids.join(' · ')}).
- **결론을 새로 정하지 않는다.** 그 연합의 해석과 근거가 가리키는 것만 쓴다. 연합에 없는 내용을 보태지 않는다. 다른 연합의 내용을 섞지 않는다.
- 방향은 "무엇을 만드는가"가 아니라 "무엇을 기준으로 삼는가"다. 과제 안의 여러 결정이 같은 쪽을 고르게 한다.
- 제안은 여러 개가 함께 남는다. 하나로 합치려고 서로 닮게 쓰지 않는다. 연합의 크기가 작으면 작은 대로, 겨냥하는 범위가 좁으면 좁은 대로 쓴다.

${levelBlock(areas)}

## 쓰는 법
- **두 번 쓴다.** 먼저 연합이 말하는 것을 그대로 옮기고, 그것을 **비즈니스 이슈 문장으로 다시 정제**해서 낸다: 무엇이 문제인지, 무엇을 바꾸는지, 어떤 사업 성과(수주 · 전환 · 리텐션 · 비용 · 리스크 · 일정 · 품질)에 닿는지가 보여야 한다. 개념 설명이나 감상으로 끝난 문장은 다시 쓴다.
- \`covers\`: 영역마다 한 줄씩, 이 방향이면 그 영역에서 무엇이 달라지는가. 연합의 조각에서 가져온다. 연합이 닿지 않는 영역은 억지로 채우지 않고 비운다.
- \`how\`: 어떤 해석들이 맞물려 이 방향이 됐는가. \`swap\`: 다른 회사가 이 문장을 그대로 쓸 수 없는 이유.
- \`from\` → \`to\`: 이 업계가 당연하게 여기는 관행 → 이 방향이 그것을 다르게 읽은 것. 팩트로 확인되는 것만 쓴다.
- \`keeps\`: 이미 잘하고 있어 그대로 두고 더 키우는 것. \`drops\`: 이 방향을 고르면 하지 않는 것 1~2개.
- \`answer\`: 이 방향이 사람이 쓴 목표 · 목적에 어떻게 닿는가.
- \`signals\`: 이 방향을 만든 조각의 id(그 연합의 것만). \`facts\`: 기댄 팩트의 id. 주어진 id만 쓴다.
- **약속할 수 있는 것만 기준으로 삼는다.** 우리가 정할 수 없는 구간은 기준의 판정 대상이 아니다.

## 글자 수 — 넘기지 않는다
\`name\` ${C.name}자(이름표가 아니라 "수단으로 성과" 꼴 — 예: "프로모션 어셋 표기 일관성으로 신뢰 강화". 명사로 끝낸다) · \`line\` ${C.line}자 · \`standard\` ${C.standard}자 · \`covers\`의 \`line\` ${C.cover}자 · \`how\` ${C.swap}자 · \`swap\` ${C.swap}자 · \`from\`/\`to\` ${C.from}자 · \`keeps\` ${C.keeps}자 · \`drops\` 각 ${C.drop}자 · \`answer\` ${C.answer}자 이내.

## 출력 (JSON만)
{"candidates":[{"id":"D1","name":"","line":"방향 한 줄","standard":"과제 안의 결정을 가르는 기준 한 문장","how":"","swap":"","covers":[{"area":"${areas[0].id}","line":""}],"from":"","to":"","keeps":"","drops":[""],"answer":"","signals":["조각 id"],"facts":["F1"]}]}`,
    user: `${missionBlock(project, null, { high: true })}

## 목표 — 사람이 쓴 문장
${goalList(goalsOf(project))}

${props.map((p, i) => `## 제안 ${ids[i]} — 해석 ${p.readings.length}개 · 받치는 근거 ${p.evidence.length}개 · 노드 ${p.lenses.length}개
### 해석 (수렴에서 활성이 높은 순)
${p.readings.slice(0, 12).map(line).join('\n')}
### 받치는 근거
${p.evidence.slice(0, 14).map(line).join('\n') || '(없음)'}
${p.against.length ? `### 이 제안과 부딪히는 조각 — 하지 않는 것(drops)을 쓸 때 본다\n${p.against.slice(0, 5).map(line).join('\n')}` : ''}`).join('\n\n')}

## 이긴 인사이트 — 전술이다. 방향으로 올리지 않는다
${j(tacticList(run))}

## 기본 방향 — 견주는 기준
${j(base ? { 이름: base.name, 한_줄: base.line, 기준: base.standard } : {})}
${note ? `\n## 다시 쓰는 이유\n${note}\n` : ''}
제안마다 방향 하나씩, ${props.length}개를 JSON으로 낸다.`,
  };
}

/** 방향 판정 — 후보와 기본 방향을 견줘 하나를 고른다. 통과가 기본값이 아니다. */
export function courseJudgePrompt(project, rivals, base, areas, lensName = (x) => x) {
  const C = COURSE_CAPS;
  const name = (id) => areas.find((a) => a.id === id)?.name || id;
  return {
    system: `${common(project)}

## 너의 역할 — 방향 판정
방향 후보 ${rivals.length}개와 기본 방향(BASE) 하나를 견줘 순서를 매긴다.
**통과가 기본값이 아니다.** 시험마다 근거를 쓸 수 있을 때만 통과다. 쓸 수 없으면 떨어뜨린다. 후보 전원이 떨어질 수 있다.

${levelBlock(areas)}

## 시험 — 후보마다 차례로 본다
1. **영역 시험(\`reaches\`)** — 영역마다, 이 기준이 그 영역에서 가르는 **실제 결정 하나**(\`case\`)를 쓴다. 그 영역의 과업에서 나온 결정이어야 한다. 다른 영역의 대상을 빌려 온 결정(예: 보안 영역의 결정을 프로모션의 대상으로 설명)은 쓰지 않는다. 쓸 수 없는 영역은 뺀다. 걸리는 영역이 하나뿐이면 "영역 전략", 장치 이름을 지우면 서지 않으면 "전술"이다.
2. **고유 시험(\`own\`)** — 다른 회사가 이 문장을 그대로 쓸 수 있는가. 쓸 수 있으면 "범용", 이 과제의 팩트와 더프롬의 기준(아이덴티티 노드의 판단)에서만 나오면 "고유". "고객 중심", "여정 기준", "데이터 기반"의 변형은 범용이다.
3. **약속 시험(\`control\`)** — 기준의 판정 대상이 우리가 통제하는 범위 안에 있는가. 남이 관리하는 구간의 결과를 기준으로 삼았으면 "일부 불가".
4. **브리프 시험(\`brief\`)** — 브리프의 목적 · 성공 기준 · 대상 · 제약을 함께 받는가. 이슈 하나만 풀거나 성공 기준의 일부에만 닿으면 "일부", 과제 전체에 닿으면 "전체". 빠진 성공 기준 · 평가 항목은 약점에 쓴다.
5. **기준의 힘** — 과제를 진행하며 부딪히는 결정에서 실제로 한쪽을 고르게 하는가. 무엇을 하지 않는지가 보이는가.
6. **차별** — 기본 방향과 **기준**이 다른가. 표현이 달라도 기준이 같으면 "같음"이다.

## 순서
방향이고, 고유하고, 브리프 전체에 닿고, 약속할 수 있는 후보를 먼저 세운다. 범용이거나 영역 전략이거나 브리프의 일부만 보는 후보는 그 뒤다. 기본 방향이 가장 나으면 그렇게 쓴다.

## 출력 (JSON만)
- \`order\`: 가장 나은 것부터. 후보 id와 "BASE"를 모두 넣는다.
- \`items\`: 후보마다 \`level\`("방향" · "영역 전략" · "전술"), \`reaches\`(영역 id와 \`case\` ${C.casee}자 이내), \`own\`("고유" · "범용"), \`control\`("가능" · "일부 불가"), \`brief\`("전체" · "일부"), \`vsBase\`("다름" · "같음"), 강한 점과 약한 점(각 ${C.note}자 이내).
- \`why\`: 1위를 고른 이유. ${C.why}자 이내. \`borrow\`: 1위가 다른 후보에서 가져오면 좋은 것. 최대 2개, 각 ${C.note}자 이내. \`risk\`: 1위 방향이 실행에서 무너질 수 있는 지점 하나. ${C.note}자 이내.
{"order":["D2","BASE","D1","D3"],"items":[{"id":"D1","level":"방향","reaches":[{"area":"${areas[0].id}","case":"이 영역에서 가르는 결정"}],"own":"고유","control":"가능","brief":"전체","vsBase":"다름","strong":"","weak":""}],"why":"","borrow":[{"from":"D1","what":""}],"risk":""}`,
    user: `${missionBlock(project, null, { high: true })}

## 방향 후보
${j(rivals.map((r) => ({ id: r.id, 이름: r.name, 한_줄: r.line, 기준: r.standard, 영역마다_달라지는_것: Object.fromEntries(r.covers.map((c) => [`${c.area} ${name(c.area)}`, c.line])), 충돌을_푸는_방법: r.how, 경쟁사가_못_쓰는_이유: r.swap, 관행: r.from, 다르게_읽은_것: r.to, 키우는_것: r.keeps, 하지_않는_것: r.drops, 목적과_성공_기준에_닿는_방법: r.answer, 기준을_만든_노드: r.lenses.map(lensName), 근거_넓이: `노드 ${r.breadth.nodes}개(아이덴티티 ${r.breadth.identity}) · 판단 ${r.signals.length}건 · 팩트 ${r.facts.length}건`, ...(r.flags.length ? { 표시: r.flags } : {}) })))}

## 기본 방향 (BASE)
${j(base ? { 이름: base.name, 한_줄: base.line, 기준: base.standard } : {})}

순서를 매겨 JSON으로 낸다.`,
  };
}

/** 아래로 내린다 — 정해진 방향 아래로 영역별 전략과 그 아래의 전술을 단계별로 쓴다. */
export function layersPrompt(project, run, direction, judge, lensName, need, areas, high, note = '') {
  const C = COURSE_CAPS;
  const parts = partsOf(project);
  const byArea = areas.map((a) => `### ${a.id} ${a.name}\n${high.filter((x) => inArea(x, a.id) && (x.act == null || x.act > 0)).map((x) => `- [${x.id}] ${lensName(x.lens)} · ${x.type || '판단'} — ${x.claim}${x.facts?.length ? ` · ${x.facts.join(' ')}` : ''}`).join('\n') || '(조각 없음 — 미션과 팩트북에서 읽는다)'}`).join('\n');
  return {
    system: `${common(project)}

## 너의 역할 — 방향을 아래로 내린다
방향(1층)은 정해졌다. 바꾸지 않는다. 그 아래 두 층을 쓴다. 위에서 아래로 쓴다 — 인사이트를 모아 올리지 않는다.

## 영역
${areaList(areas)}

## 2층 — 영역별 전략
- 영역마다 **전략 하나**를 쓴다(\`name\`, \`line\`). 방향이 그 영역에서 어떤 방침이 되는가다.
- 영역 전략의 이름과 한 줄에 **장치 이름**(화면 · 칸 · 쿠폰 · 버튼 등)을 쓰지 않는다. 그것은 전술이다. 다른 영역의 대상 낱말에 기대지도 않는다 — 그 영역의 과업에서 나온 말로 쓴다.
- **방향 문장에 영역 이름만 바꿔 붙이지 않는다.** 영역 전략은 그 영역의 과업 전체(미션과 팩트북에 적힌 요구)를 덮어야 한다. 아래 "영역별 조각"은 노드들이 그 영역을 읽고 낸 것 가운데 수렴에서 살아남은 것이다. 거기서 출발한다.
- 미션의 성공 기준 · 평가 항목마다 어느 영역 전략이 답하는지 스스로 확인한다. 답하지 못한 항목은 \`gaps\`에 적는다.
- 영역 전략은 전술 하나가 아니다. 그 아래에 서로 다른 전술이 여러 개 달릴 수 있어야 한다. 이긴 인사이트 하나를 이름만 바꿔 영역 전략으로 올리지 않는다.
- 영역마다 근거 판단 2개 이상(영역별 판단 또는 이슈 높이의 판단), 팩트 2개 이상.

## 3층 — 전술
- \`phases\`: 시간 순서 3~4단계. 브리프에 기간이 있으면 그 기간으로, 없으면 일이 진행되는 순서로 나눈다. \`line\`은 그 시기에 이뤄야 하는 상태다.
- 영역마다 \`tactics\`를 쓴다. **영역마다 ${need.tactics}개 이상, 단계마다 1개 이상.** 전술마다 단계(\`phase\`), 할 일(\`move\`, "무엇을 한다" 꼴), 맡는 파트(\`parts\`), 그 전술이 나온 판단의 id(\`from\`)를 적는다.
- 전술은 그 영역의 전략에서 내려온 것이어야 한다. 전략 없이도 할 일이면 쓰지 않는다. 한 영역의 전술이 한 가지 종류로만 채워지지 않게 한다.
- **전술은 노드의 판단에서 나온다.** 아래 "이슈 높이의 판단"이 재료다. 전술마다 \`from\`에 그 판단의 id를 1~2개 적는다. 노드마다 본 것이 다르다 — **서로 다른 노드 ${need.lenses}개 이상**의 판단이 전술에 쓰이게 한다. 한두 노드의 판단으로만 채우지 않는다.${parts.length > 1 ? `\n- 파트 id: ${parts.map((c) => `${c.id}(${c.name})`).join(' · ')}. 모든 파트가 어딘가의 전술을 맡는다.` : ''}
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
영역 전략 \`name\` ${C.name}자(이름표가 아니라 "수단으로 성과" 꼴 — 예: "프로모션 어셋 표기 일관성으로 신뢰 강화". 명사로 끝낸다) · \`line\` ${C.line}자 · 단계 \`when\` ${C.when}자 · \`line\` ${C.phase}자 · \`move\` ${C.move}자 · \`pain\`/\`strength\` ${C.pain}자 · \`answer\` ${C.fix}자 · 인사이트 \`name\` ${C.axis}자 · \`line\` ${C.line}자 이내.

## 출력 (JSON만)
{"phases":[{"id":"P1","when":"","line":""}],"areas":[{"area":"${areas[0].id}","name":"영역 전략의 이름","line":"영역 전략 한 줄","tactics":[{"phase":"P1","move":"","parts":["${parts[0]?.id || 'planning'}"],"from":["판단 id"],"insight":""}],"facts":["F1"],"signals":["판단 id"]}],"insights":[{"id":"N1","name":"","line":"","fit":"맞음"}],"fixes":[{"pain":"","answer":"","facts":["F1"]}],"boosts":[{"strength":"","answer":"","facts":["F1"]}],"gaps":[""]}`,
    user: `${missionBlock({ ...project, heading: null })}

## 방향 (1층) — 바꾸지 않는다
${j({ 이름: direction.name, 한_줄: direction.line, 기준: direction.standard, 영역마다_달라지는_것: Object.fromEntries(direction.covers.map((c) => [c.area, c.line])), 관행: direction.from, 다르게_읽은_것: direction.to, 키우는_것: direction.keeps, 하지_않는_것: direction.drops })}

## 판정이 남긴 것
${j({ 가져올_것: (judge?.borrow || []).map((b) => b.what), 무너질_수_있는_지점: judge?.risk || '' })}

## 영역별 조각 — 수렴에서 살아남은 것. 영역 전략의 출발점
${byArea}

## 이긴 인사이트 — 전술 하나로 놓는다
${j((run.insights || []).map((i) => ({ id: i.id, 제목: i.title, 컨셉: cut(i.concept, 200), 판정: i.from?.verdict || '' })))}

## 이슈 높이의 판단 — 전술의 재료. 노드마다 본 것이 다르다
${signalGroups(run, lensName)}
${note ? `\n## 다시 쓰는 이유\n${note}\n` : ''}
영역별 전략과 전술을 JSON으로 낸다.`,
  };
}
