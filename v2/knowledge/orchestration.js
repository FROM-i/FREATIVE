// 오케스트레이션 — 어느 호출을 어느 급의 모델에게 맡기는가.
//
//   lead     방향을 정하는 호출. 틀리면 뒤 단계가 전부 틀린다. 가장 좋은 모델에게 맡긴다.
//   support  정해진 방향 안에서 정리 · 대조 · 연결하는 호출. 빠르고 싼 모델로 충분하다.
//
// 근거 (docs/EVALUATION.md 12절): 결선 판정 30건을 두 모델에게 똑같이 줬더니 27건이 같았다. 판정은 모델 차이가 작았다.
// 그래서 좋은 모델은 판정이 아니라 출발(근본 이슈 · 문제 정의), 판단 도출, 충돌 교배, 기조와 보완에 쓴다.
// 기본안도 lead다 — 기본안을 약한 모델로 내면 "기본안과 다름"이 방법론이 아니라 모델 차이로 생긴다.
export const TIERS = {
  lead: { name: '주 모델', note: '방향을 정한다 — 근본 이슈, 문제 정의, 판단 도출, 충돌 교배, 기조, 보완, 최종 판정' },
  support: { name: '보조 모델', note: '정리하고 대조한다 — 팩트 연결, 묶음 정리, 기본안 대조, 대결 판정, 공격, 디렉션, 기획 · 디자인 틀' },
};

export const KIND_TIER = {
  issues: 'lead',      // 근본 이슈 후보
  baseline: 'lead',    // 기본안 — 비교 기준은 가장 좋은 모델로 낸다
  reframe: 'lead',     // 문제 다시 정의
  route: 'lead',       // 사조 훑기
  activate: 'lead',    // 판단 도출 (터널 노드만 support — 아래 tierOf)
  link: 'lead',        // 연결 — 어느 판단끼리 충돌하는지가 교배할 짝을 정한다
  weave: 'lead',       // 그래프 통합안 — 전체 노드의 판단을 읽고 원리 하나로 묶는다. 후보의 질이 여기서 정해진다
  cross: 'lead',       // 충돌 교배 — 두 번의 실행 모두 1위 안이 여기서 나왔다
  stance: 'lead',      // 기조 세우기
  revise: 'lead',      // 기조를 지킨 보완
  verdict: 'lead',     // 더프롬 판정
  strategy: 'lead',    // 전략 한 장 — 인사이트 위의 층. 전체 판단과 팩트를 다시 훑어 과제를 관통하는 전략으로 올린다
  courseScope: 'lead', // 업무 영역 — 방향인지 가르는 시험대. 틀리면 층이 전부 틀린다
  courseLens: 'lead', // 방향 높이의 노드 판단 (터널 노드만 support — 아래 tierOf)
  courseLink: 'lead', // 통합 판단끼리의 충돌 — 방향 후보의 출발점이 된다
  courseObjects: 'lead', // 영역마다의 대상 낱말 — 방향이 한 영역에 붙었는지를 낱말로 대조한다
  courseBase: 'lead', // 기본 방향 — 견주는 기준은 가장 좋은 모델로 낸다
  course: 'lead',     // 운영 방향 후보 — 전략 과제의 맨 위 층
  courseJudge: 'lead', // 방향 판정 — 여기서 고른 방향 아래로 전부 내려 쓴다
  layers: 'lead',     // 영역별 전략과 그 아래 전술
  integrate: 'support', // 묶음 정리
  screen: 'support',   // 기본안 대조
  duel: 'support',     // 대결 판정 (두 번 판정해 갈림을 잡는다)
  distinct: 'support', // 같은 해법 묶기
  attack: 'support',   // 공격 — 정해진 일곱 방향에서 약점을 찾는다
  hold: 'support',     // 기조 확인
  direct: 'support',   // 관점별 디렉션
  plan: 'support', pull: 'support', creative: 'support', // 기획 · 디자인 틀
  research: 'support', // 팩트북 조사
};

/** 터널 노드의 판단은 팩트에 묶는 일이라 support다. 아이덴티티 · 에어플레인 노드의 판단은 lead다. */
export const tierOf = (task) => ((task?.kind === 'activate' || task?.kind === 'courseLens') && task.lens?.family === 'tunnel' ? 'support' : KIND_TIER[task?.kind] || 'support');
