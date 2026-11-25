// THE FROM BRAIN — 기본 노드.
// 노드 하나 = 판단 기준 하나. 기준(criteria)과 이슈에 던지는 질문(ask)을 여기서만 고친다.
// 노드는 한 줄 정의로 생각하지 않는다 — 방법론 원문(text · card)을 읽고 생각한다. 원문은 scripts/sync-knowledge.mjs 가 가져온다.
// 출처: FREATIVE 1.x knowledge/brain.json(렌즈) · 방법론 CORE(core.md) · 05_layer(터널 레이어).
import { ISMS, OPPOSITIONS } from './isms.js';
import { CORE } from './core.js';

export const FAMILIES = {
  identity: { id: 'identity', hub: 'HUB-IDENTITY', name: 'THE FROM 아이덴티티', short: '아이덴티티', role: '판단의 출발점 — 무엇을 지키고 무엇을 새로 볼지 정한다' },
  airplane: { id: 'airplane', hub: 'HUB-AIRPLANE', name: 'Airplane', short: '에어플레인', role: '사조의 원리로 기존의 것을 다르게 다룬다' },
  tunnel: { id: 'tunnel', hub: 'HUB-TUNNEL', name: 'Tunnel', short: '터널', role: '시장·브랜드·타겟·사용 습관을 겹쳐 답의 범위를 좁힌다' },
};

export const IDENTITY = [
  {
    id: 'ID-FROM', family: 'identity', name: '나로부터', source: 'core.md §1',
    criteria: '판단의 출발점이 레퍼런스·트렌드가 아니라 판단하는 사람(우리·디자이너)의 관점인가.',
    ask: '레퍼런스를 보지 않고 이 이슈를 보면, 우리는 무엇이 진짜 문제라고 판단하는가. 관점 한 줄과 그 근거.',
  },
  {
    id: 'ID-JAMAIS', family: 'identity', name: '자메뷰', source: 'core.md §6.2',
    criteria: '익숙한 것을 처음 보는 것처럼 만드는가. 낯선 구조가 아니라 익숙한 구조의 새 해석인가.',
    ask: '이 이슈에서 타겟에게 가장 익숙한 것 하나를 고르고, 그것을 처음 보는 것처럼 만들 해석을 낸다.',
  },
  {
    id: 'ID-INERTIA', family: 'identity', name: '관성은 구조, 새로움은 해석', source: 'core.md §6.1',
    criteria: '지킬 관성(구조)과 바꿀 해석이 분리되어 있는가. 새로움을 구조를 깨서 얻고 있지 않은가.',
    ask: '이 이슈에서 사람들이 이미 몸으로 아는 구조(지킬 것)와, 그 위에서 바꿀 수 있는 해석을 가른다.',
  },
  {
    id: 'ID-ONEU', family: 'identity', name: '1U — 하나에서 파생', source: 'core.md §2.2 · §2.3',
    criteria: '모든 결정이 하나의 출발점(코어)에서 파생되는가. 근거를 설명할 수 없는 결정은 없는가.',
    ask: '이 이슈의 모든 결정이 파생될 수 있는 하나의 출발점(코어) 후보를 낸다. 값이 아니라 파생의 규칙으로.',
  },
  {
    id: 'ID-YELLOW', family: 'identity', name: '노랑 — 전 세대의 태도', source: 'core.md §3',
    criteria: '특정 소수만이 아니라 폭넓은 사람이 즐기고 쓸 수 있는가. 접근성을 실험의 비용으로 내지 않았는가.',
    ask: '이 이슈에서 지금 배제되는 사람이 누구인지, 그 사람까지 쓰게 하려면 무엇이 조건인지 낸다.',
  },
  {
    id: 'ID-BENEFIT', family: 'identity', name: '사람이 얻는 것', source: 'core.md §6.4 ③',
    criteria: '다르기만 하지 않고 사람이 얻는 것이 있는가. 효익이 빈 결정(개살구)은 없는가.',
    ask: '이 이슈가 풀리면 사람이 얻는 것을 효익 지표로 낸다 — 더 잘 이해 · 더 깊이 느낌 · 더 쉽게 행동 중 무엇인가.',
  },
];

/** 문(gate) — 이슈에 발화하지 않고 통합 인사이트를 막아선다. */
export const GATES = [
  {
    id: 'ID-N7', family: 'identity', name: '방법이 결과물에 새지 않는다', source: 'core.md §1.1 · N7',
    criteria: '더프롬의 로고 형상·컬러·1U 모양·"나로부터" 서사가 클라이언트 결과물의 소재가 되지 않았는가.',
  },
];

export const TUNNEL = [
  {
    id: 'TN-MARKET', family: 'tunnel', name: '시장', source: 'core.md §5 · 터널 레이어',
    criteria: '이 카테고리가 지금 어떻게 말하는지, 무엇이 흔한지 확인했는가.',
    ask: '이 카테고리의 통상적 해석(다들 그렇게 하는 것)과 비어 있는 자리를 낸다. 실례는 지어내지 않는다.',
  },
  {
    id: 'TN-BRAND', family: 'tunnel', name: '브랜드', source: 'core.md §5 ②',
    criteria: '무엇이 이 클라이언트(서비스)만의 것인지 확인했는가. 더프롬의 브랜드가 아니다.',
    ask: '이 클라이언트만 말할 수 있는 것, 말하면 안 되는 것(금지)을 낸다.',
  },
  {
    id: 'TN-TARGET', family: 'tunnel', name: '타겟', source: 'core.md §5 ①',
    criteria: '누가 어떤 순간에 보는지 확인했는가.',
    ask: '타겟이 이 이슈를 만나는 순간(언제·어디서·어떤 상태로)과 그때의 한계(정보량·가독성·톤)를 낸다.',
  },
  {
    id: 'TN-USAGE', family: 'tunnel', name: '사용 습관', source: 'core.md §5 ③',
    criteria: '실제로 어떻게 만나고 쓰는지, 그 순간 무엇을 원하는지 확인했는가.',
    ask: '사람들이 지금 실제로 하는 행동(관성)과 그 순간의 동기·감정을 낸다. 이탈하는 지점이 있으면 함께.',
  },
];

export const AIRPLANE = ISMS.map((i) => ({
  ...i, source: 'catalog-ism.md', rules: CORE.airplane,
  criteria: '사조를 원리 층위에서 가져왔는가. 두고 올 것을 적었는가. 형태·색·서체를 빌리면 코스튬이다.',
  ask: '이 사조가 당대에 겨눈 것과 같은 구조가 이 이슈 안 어디에 있는가. 그 자리에 이 사조의 원리를 넣으면 기존의 것(관습·정해진 전술)을 어떻게 다루게 되는가 — 지킨다 · 다시 읽는다 · 옮긴다 · 잇는다 · 덜어낸다.',
}));

export { OPPOSITIONS };

export const HUBS = Object.values(FAMILIES).map((f) => ({ id: f.hub, type: 'hub', family: f.id, name: f.name, role: f.role }));

for (const l of IDENTITY) l.text = CORE[l.id];
for (const g of GATES) g.text = CORE[g.id];
for (const l of TUNNEL) l.text = CORE.tunnel;

/** 발화하는 기본 노드 전체 (문 제외) */
export const LENSES = [...IDENTITY, ...AIRPLANE, ...TUNNEL];

export const lensById = (id) => LENSES.find((n) => n.id === id) || GATES.find((n) => n.id === id) || null;

/** 기본 설정 — 한 번의 사고에 쓰는 양 */
export const DEFAULTS = {
  ismCount: 4,          // Airplane에서 발화시킬 사조 수 (대립 쌍 1개 포함)
  signalsPerLens: 1,    // 노드 하나가 이슈 하나에 내는 신호의 최대 수 — 얕은 둘보다 깊은 하나
  insightCount: 3,      // 통합 인사이트 수 N
  concurrency: 4,       // 동시 호출 수
  minFamilies: 2,       // 통합 인사이트가 반드시 걸쳐야 하는 기본 노드군 수 (3이면 모두)
  minLenses: 3,         // 통합 인사이트가 근거로 삼아야 하는 서로 다른 노드 수
};
