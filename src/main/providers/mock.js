'use strict';
/**
 * 목업 프로바이더 — API 키 없이 화면·흐름·시각화를 확인하기 위한 것.
 * 실제 추론을 하지 않는다. 결과는 예시 문장이며 판단 근거로 쓰지 않는다.
 * 실행: npm run mock
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mockSeen = new Set();
const speed = parseFloat(process.env.CT_MOCK_SPEED || '1');
const wait = (min, max) => sleep((min + Math.random() * (max - min)) * speed);

function pick(ctx, k, d) { return (ctx && ctx[k]) || d; }

function m(ctx) {
  const mission = ctx.mission || {};
  return {
    P: mission.product || '신제품',
    T: mission.target || '타겟',
    D: mission.deliverable || '결과물',
  };
}

const builders = {
  '01_brief': (ctx) => {
    const brief = ctx.brief || '';
    const get = (label) => { const r = new RegExp(`\\*\\*${label}[^*]*\\*\\*: (.+)`); return ((brief.match(r) || [])[1] || '').trim(); };
    const product = get('★1 제품/서비스') || '제주 로컬 커피 브랜드의 겨울 시즌 원두';
    const target = get('★2 타겟') || '주말에 성수동을 걷는 20~30대';
    const hasKey = !/비어 있음/.test(get('★3 핵심 순간'));
    const answered = !/\(없음\)/.test(ctx.answers || '(없음)');
    const ask = !hasKey && !answered;
    return {
      gate: ask ? '질문부터' : '통과',
      gate_reason: ask ? '★3 핵심 순간이 비어 있어, 전혀 다른 두 결과물이 가능하다' : '★1~3이 판단에 충분하다',
      missing: ask ? ['★3 핵심 순간'] : [],
      questions: ask ? [
        { id: 'Q1', star: '★3', q: '이 결과물을 만난 사람이 가장 얻고 싶은 것은?', options: ['지금 들어가 볼 이유', '제품을 직접 맛볼 기회', '사진으로 남길 장면', '브랜드 이야기를 아는 것'] },
        { id: 'Q2', star: '★2', q: '주로 언제 마주치나요?', options: ['걷다가 지나치며 (3초)', '줄을 서서 기다리며 (3분)', '매장 안에서 머물며'] },
      ] : [],
      mission: {
        title: get('프로젝트명') || '겨울 원두 팝업',
        one_line: `${target}에게 ${product}를 처음 만나는 순간을 만든다`,
        deliverable: get('★1 만들 것') || '오프라인 사이니지 · 프로모션',
        objective: get('★6 목적') || '인지 · 참여',
        target, product,
        channel: get('★2 채널') || '오프라인',
        device: get('★2 주 노출 디바이스') || '옥외·사이니지',
        key_moment: hasKey ? get('★3 핵심 순간') : '지나가다 멈춰 서서 한 모금 맛볼 이유를 얻는 순간 (가정)',
        brand: get('★4 브랜드').replace('(비어 있음)', '') || '없음 — 서비스 약속과 타겟에서 새로 정한다',
        constraints: ['브랜드 로고는 원본만 사용', '조명 설치는 3m 이하'],
        success: '팝업 앞 체류 · 시음 참여',
      },
      assumptions: [
        { item: '주 노출은 보행 동선 위 3초 체류', basis: '추론 — 성수 보행 상권' },
        { item: '★4 브랜드 톤은 첨부 자료에서 읽는다', basis: '첨부' },
      ],
      attachment_insights: [{ file: '브리프.md', takeaway: '로컬 원두의 "산지 거리"가 강점으로 적혀 있음' }],
      plan: {
        isms: [
          { id: 'ISM-JP', why: '완결을 유보해 지나가는 사람의 참여를 끌어내는 원리' },
          { id: 'ISM-SWISS', why: '3초 안에 읽히는 위계 — 그리드는 결정 비용을 줄인다' },
          { id: 'ISM-ARTCRAFT', why: '장식은 구조에서 — 원두의 공정이 곧 이야기' },
          { id: 'ISM-POSTMOD', why: '성격도 기능과 동등한 설계 대상' },
          { id: 'ISM-KR', why: '변수를 결과로 받아들이는 설계 — 날씨·계절' },
        ],
        layers: [
          { key: 'market', label: '시장', question: '팝업 사이니지는 지금 어떻게 말하는가' },
          { key: 'brand', label: '브랜드', question: '무엇이 이 원두만의 것인가' },
          { key: 'target', label: '타겟', question: '누가 어떤 걸음으로 지나가는가' },
          { key: 'usage', label: '사용 습관', question: '사람들은 팝업을 실제로 어떻게 만나는가' },
        ],
        assistants: [{ role: '시간 여행자', task: '사조별 원리 채집' }, { role: '레이어 분석가', task: '시장·브랜드·타겟·습관' }],
        example_count: 3,
        model_plan: [
          { stage: 'airplane', role: 'sub', model: 'gpt-5-mini', effort: 'low', why: '사조 카드 원문이 충분 — 빠른 채집' },
          { stage: 'concept', role: 'director', model: 'gpt-5', effort: 'high', why: '컨셉은 깊은 판단이 필요' },
          { stage: 'positioning', role: 'director', model: 'gpt-5-mini', effort: 'medium', why: '터널 결과가 명확해 구조화 위주' },
        ],
        note: '좋아, 미션을 받았어. 캔버스부터 펼쳐 보자.',
      },
    };
  },
  '02_canvas': (ctx) => {
    const { T, P } = m(ctx);
    return {
      from_me: '우리는 이 원두를 "빠른 소비재"가 아니라 "천천히 알아가는 거리"로 본다',
      concept_draft: `${T}이 걷다가 멈춘 3초에서 ${P}의 계절을 서두르지 않는 온기로 느끼게 한다`,
      thinking: ['멈춤', '산지의 거리', '겨울 온기', '한 모금', '지나가는 사람', '향'],
      tension: '팝업은 "지금 여기"를 외쳐야 하지만, 이 원두는 천천히 알아가야 맛있다',
      inertia: ['멀리서 보이는 큰 이름', '오픈 시간·위치 정보', '들어갈 수 있는 입구'],
      oppositions: [
        { layer: 'CAT', norm: '팝업 사이니지는 할인·오픈 정보를 크게 쓴다', violation: '정보를 줄이고 "멈춰야 보이는 것"을 둔다', strength: '역전', evidence: '확인 필요', confidence: 'low' },
      ],
      painter_line: '음… 외치지 않고 멈추게 하려면?',
    };
  },
  '03_ism': (ctx) => {
    const id = ctx.ismId;
    const lib = {
      'ISM-JP': { take: ['완결을 유보해 보는 사람이 마지막 한 조각을 채우게 한다', '여백을 비어 있음이 아니라 기다림으로 쓴다'], leave: ['와비사비 텍스처·크라프트지 클리셰'], core: '비워 둔 한 조각', postcard: '여기선 다 말하지 않아. 그래서 다가가게 돼.' },
      'ISM-SWISS': { take: ['그리드는 결정 비용을 줄인다 — 3초 안에 위계를 끝낸다', '정보의 순서를 크기 하나로 말한다'], leave: ['그리드를 감옥으로 만들기'], core: '크기 하나의 위계', postcard: '정리는 차가운 게 아니라 친절한 거야.' },
      'ISM-ARTCRAFT': { take: ['장식은 공정에서 발생한다 — 원두가 온 길이 곧 그래픽', '만드는 과정을 숨기지 않는다'], leave: ['손글씨 폰트로 만든 수공예 룩'], core: '공정이 곧 장식', postcard: '어디서 왔는지 보여주면 장식은 저절로 생겨.' },
      'ISM-POSTMOD': { take: ['성격도 기능과 동등한 설계 대상이다'], leave: ['반대할 대상 없이 빌린 형태'], core: '성격 있는 사물', postcard: '진지함에도 웃음이 필요해.' },
      'ISM-KR': { take: ['변수(날씨·시간)를 결과로 받아들이는 설계'], leave: ['무맥락 오방색'], core: '날씨가 완성한다', postcard: '바람이 그려 주는 그림도 그림이야.' },
    };
    const d = lib[id] || { take: ['원리를 이 미션의 언어로 옮긴다'], leave: ['형태 인용'], core: '원리 한 줄', postcard: '이 시대는 당연함에 반대했다.' };
    return { id, name: ctx.ismBody ? ctx.ismBody.split('·')[1].trim().split('(')[0].trim() : id, era: '', postcard: d.postcard, take: d.take, leave: d.leave, apply: `${d.core} — 사이니지의 첫 3초에 적용`, a3: { pass: true, check: d.take[0] }, core: d.core, fit: 0.6 + Math.random() * 0.35 };
  },
  '04_airplane_synth': () => ({
    selected: ['ISM-JP', 'ISM-SWISS', 'ISM-ARTCRAFT'],
    dropped: [{ id: 'ISM-POSTMOD', why: '성격은 브랜드 레이어에서 다시 본다' }, { id: 'ISM-KR', why: '설치 제약상 날씨 변수 반영이 어렵다' }],
    hybrid: '일본 미학의 "유보된 완결" × 스위스의 "크기 하나의 위계" × 미술공예의 "공정이 곧 장식"',
    suitcase: ['비워 둔 한 조각', '크기 하나의 위계', '공정이 곧 장식', '다가가야 완성된다'],
    leave_together: ['크라프트·손글씨 룩', '정보를 지우다 입구까지 지우기'],
    painter_line: '가방이 꽤 묵직해졌어. 이제 차로 갈아타자.',
  }),
  '05_layer': (ctx) => {
    const k = ctx.layerKey;
    const lib = {
      market: { headline: '팝업은 모두 "크게, 지금, 할인"을 외친다', insights: [{ title: '정보 과밀', detail: '오픈일·혜택·SNS 계정을 한 판에 넣는다', source: '일반 관찰' }, { title: '포토존 의존', detail: '경험이 사진 한 장으로 끝난다', source: '일반 관찰' }], keep: ['멀리서 읽히는 브랜드명'], change: ['혜택 나열 대신 하나의 장면'] },
      brand: { headline: '이 원두의 고유함은 "산지까지의 거리"', insights: [{ title: '거리의 서사', detail: '농장→로스터리 이동 거리가 짧다', source: '첨부:브리프.md' }, { title: '확인 필요', detail: '브랜드 컬러 가이드는 없음', source: '추론' }], keep: ['원본 로고'], change: ['거리를 숫자가 아닌 감각으로'] },
      target: { headline: '걷는 속도 그대로 3초, 멈추면 30초', insights: [{ title: '두 개의 시간', detail: '지나치는 3초와 멈춘 30초가 다른 정보를 원한다', source: '추론' }, { title: '향에 반응', detail: '시각보다 향이 먼저 멈춰 세운다', source: '일반 관찰' }], keep: ['보행 동선을 막지 않는다'], change: ['가까이 와야 보이는 두 번째 층'] },
      usage: { headline: '사람들은 팝업을 "구경"하고, 줄은 "확인"한다', insights: [{ title: '구경→확인→입장', detail: '대기열 길이로 가치를 판단', source: '일반 관찰' }, { title: '대기의 지루함', detail: '줄 선 3분이 비어 있다', source: '추론' }], keep: ['입구가 어디인지 즉시'], change: ['대기 3분을 이야기의 시간으로'] },
    };
    const d = lib[k] || lib.market;
    return { key: k, label: ctx.layerLabel, ...d, boundary: '5m 거리에서 1순위가 읽혀야 한다', need_evidence: ['인근 팝업 사이니지 사진 2건'], light: 0.5 + Math.random() * 0.4 };
  },
  '06_tunnel_synth': () => ({
    narrowed: '멀리서는 하나만 크게, 가까이 오면 두 번째 층이 열리는 사이니지',
    keep: ['5m에서 읽히는 브랜드명', '입구의 위치', '보행 동선'],
    change: ['혜택 나열 → 하나의 장면', '대기 3분 → 원두가 온 길', '포토존 → 다가가야 완성되는 그림'],
    conflicts: ['시장은 "크게"를, 브랜드는 "천천히"를 원한다 → 거리별로 층을 나눈다'],
    exit_light: '거리에 따라 다르게 말하는 사이니지',
    painter_line: '보인다! 저기 밝은 데로.',
  }),
  '07_positioning': () => ({
    axes: { x: { name: '말하는 방식', low: '설명한다', high: '체험하게 한다', basis: '사용 습관' }, y: { name: '정보의 밀도', low: '하나만', high: '많이', basis: '시장' } },
    players: [
      { label: '혜택 나열형 팝업', x: -0.7, y: 0.8, kind: '관습', evidence: '일반 관찰' },
      { label: '포토존 중심 팝업', x: 0.4, y: 0.35, kind: '관습', evidence: '일반 관찰' },
      { label: '브랜드 로고 월', x: -0.5, y: -0.4, kind: '관습', evidence: '일반 관찰' },
      { label: '시음 부스형', x: 0.7, y: 0.55, kind: '경쟁', evidence: '확인 필요' },
    ],
    whitespace: { x: 0.55, y: -0.6, label: '하나만, 체험으로', why: '정보를 줄이고 다가가는 행동으로 완성 — 보행자의 3초와 30초를 함께 설계' },
    territories: [
      { id: 'T1', name: '거리의 지도', desc: '농장에서 이곳까지의 거리를 동선으로', x: 0.3, y: -0.2, scores: { inertia: 0.7, novelty: 0.6, benefit: 0.6, brand: 0.9, cost: 0.5 } },
      { id: 'T2', name: '다가가는 그림', desc: '멀리선 한 점, 가까이 오면 원두가 보이는 사이니지', x: 0.6, y: -0.6, scores: { inertia: 0.8, novelty: 0.8, benefit: 0.8, brand: 0.7, cost: 0.6 } },
      { id: 'T3', name: '향의 문', desc: '향이 먼저 나오는 입구', x: 0.8, y: 0.1, scores: { inertia: 0.5, novelty: 0.7, benefit: 0.6, brand: 0.5, cost: 0.3 } },
      { id: 'T4', name: '겨울 온도계', desc: '기온에 따라 바뀌는 추천 원두', x: 0.2, y: 0.4, scores: { inertia: 0.6, novelty: 0.5, benefit: 0.5, brand: 0.4, cost: 0.4 } },
      { id: 'T5', name: '빈 잔 갤러리', desc: '마신 잔이 쌓여 그림이 되는 벽', x: 0.5, y: 0.6, scores: { inertia: 0.4, novelty: 0.7, benefit: 0.4, brand: 0.5, cost: 0.4 } },
    ],
    rounds: [
      { from: 5, to: 4, cut: 'T5', criterion: '효익', reason: '참여 결과가 개인에게 남지 않는다' },
      { from: 4, to: 3, cut: 'T4', criterion: '브랜드 고유성', reason: '어느 카페나 할 수 있다' },
      { from: 3, to: 1, cut: ['T3', 'T1'], criterion: '실행 비용', reason: '향 장치는 운영 비용이 크고, 지도는 3초에 읽히지 않는다' },
    ],
    final: { id: 'T2', reason: '관성(멀리서 읽히는 이름)을 지키면서 다가가는 행동에 새 해석을 준다 — 예비 판정' },
    painter_line: '지도 위에 빈자리가 하나 있네.',
  }),

  '08_forpop': () => ({
    audit: [
      { stage: '캔버스', core: '멈춘 3초의 온기', verdict: '유지', note: '나로부터의 관점이 끝까지 살아 있다', link: '터널의 "두 개의 시간"으로 이어짐' },
      { stage: 'Airplane', core: '유보된 완결 × 크기 하나의 위계', verdict: '유지', note: '원리 층위로 정리됨', link: '거리별 정보 층의 근거' },
      { stage: 'Tunnel', core: '거리에 따라 다르게 말하는 사이니지', verdict: '보정', note: '사용 습관 레이어의 대기 3분이 약하게 반영', link: 'PoD 후보 D3로 보강' },
      { stage: 'Positioning', core: '다가가는 그림 (하나만, 체험으로)', verdict: '유지', note: '빈자리 근거 충분', link: 'PoD의 출발점' },
    ],
    coherence: '나로부터(천천히 알아가는 거리) → 유보된 완결 → 거리별 층 → 다가가는 그림으로 하나의 코어가 이어진다',
    for: { frame: '성수동 주말 팝업 스토어', category: '로컬 F&B 팝업', inertia_source: '멀리서 보이는 이름, 줄, 포토 스팟' },
    pop: [{ item: '5m에서 읽히는 브랜드명', why: '무엇의 팝업인지 모른다', from: '시장' }, { item: '입구·운영 시간', why: '들어갈 수 없다', from: '사용 습관' }, { item: '시음 가능', why: 'F&B 팝업의 기본 기대', from: '타겟' }],
    pod_candidates: [
      { id: 'D1', item: '다가가야 완성되는 그래픽', gain: '멈춘 사람만 보는 두 번째 층', from: 'Positioning T2', desirable: 0.8, deliverable: 0.8, defensible: 0.6 },
      { id: 'D2', item: '산지까지의 거리', gain: '원두가 온 길을 안다', from: '브랜드 레이어', desirable: 0.6, deliverable: 0.5, defensible: 0.9 },
      { id: 'D3', item: '대기 3분의 이야기', gain: '줄 선 시간이 지루하지 않다', from: '사용 습관 레이어', desirable: 0.7, deliverable: 0.7, defensible: 0.5 },
      { id: 'D4', item: '향의 입구', gain: '먼저 맡고 들어간다', from: '타겟 레이어', desirable: 0.6, deliverable: 0.4, defensible: 0.4 },
      { id: 'D5', item: '날씨 추천', gain: '오늘에 맞는 한 잔', from: 'Airplane ISM-KR', desirable: 0.5, deliverable: 0.6, defensible: 0.3 },
    ],
    painter_line: '먼저 지나온 길을 다시 걸어 봤어. 끊긴 데는 없어.',
  }),
  b_direct: (ctx) => ({
    direction: `${(ctx.stageLabel || '').split(' — ')[0]} — "천천히 알아가는 거리"라는 우리의 시선을 놓치지 말 것. 팝업의 관성(크게·지금)은 구조로 지키고, 해석은 거리에서 만든다.`,
    lens_guides: [{ lens: 'FROM', guide: '레퍼런스 팝업 사진에서 출발하지 말고 "거리"라는 우리 관점에서 출발' }, { lens: 'JAMAIS', guide: '외벽 사인이라는 익숙한 형식을 버리지 않는다' }],
    must: ['5m 가독성', '보행 동선 유지'], avoid: ['포토존으로 끝나는 경험', '크라프트지 클리셰'],
    knowhow: [{ id: 'EMP-SIZE', use: '거리별 위계를 크기 하나로 설계' }, { id: 'CON-SIZE', use: '멀리/가까이 두 층의 대비' }, { id: 'RATIO-73', use: '외벽 사인의 정보 대 여백' }],
    shift_hint: '보는 사람의 거리(스케일)를 바꾸면 같은 사인이 다른 말을 한다',
    plan_adjust: { add_isms: [], remove_isms: [], reason: '' },
    line: '방향은 하나 — 거리.',
  }),
  b_verify: (ctx) => {
    const st = (ctx.stageLabel || '').split(' — ')[0];
    const key = `${st}`;
    const redo = st === 'Positioning Map' && !mockSeen.has(key);
    mockSeen.add(key);
    return {
      verdict: redo ? '재작업' : st === 'Tunnel' ? '보완' : '통과',
      scores: [{ lens: 'FROM', score: redo ? 1 : 4, note: redo ? '축이 일반 팝업 비교 축이다 — 우리의 관점이 없다' : '거리의 관점이 유지됨' }, { lens: 'JAMAIS', score: 4, note: '익숙한 형식 유지' }, { lens: 'BENEFIT', score: 3, note: '효익 지표가 다소 추상적' }],
      strengths: ['관성과 해석이 분리됨'],
      issues: redo ? ['포지셔닝 축이 카테고리 일반 축(가격·트렌디)에 가깝다'] : st === 'Tunnel' ? ['사용 습관 레이어의 대기 3분이 출구에 반영되지 않음'] : [],
      fixes: redo ? ['축 하나를 "거리(멀리↔가까이)"처럼 우리의 관점에서 다시 세울 것'] : st === 'Tunnel' ? ['FoR/PoP/PoD에서 대기 3분 후보를 포함할 것'] : [],
      line: redo ? '다시. 이 축은 남의 지도야.' : '좋아, 다음으로.',
    };
  },
  b_shift: (ctx) => (ctx.round === 1 ? {
    round: 1,
    shift: { type: 'SCALE', name: '거리의 스케일', question: '보는 사람과의 거리를 바꾸면 차별점은 무엇이 되나?', from: '차별점을 "무엇을 보여줄까"로 찾았다', to: '차별점을 "얼마나 가까이서 무엇이 보일까"로 본다', reasoning: '자메뷰 — 사인이라는 익숙한 형식은 그대로, 거리에 따라 해석이 바뀐다. 나로부터 — 우리의 관점(천천히 알아가는 거리)과 일치', lenses: ['JAMAIS', 'FROM'] },
    result: [
      { id: 'P1', item: '거리마다 다른 층의 그래픽', gain: '멈출수록 더 알게 된다', from_ids: ['D1', 'D2'], transformed: true, why: '다가감과 산지 거리를 하나의 원리로' },
      { id: 'P2', item: '줄 선 3분의 원두 지도', gain: '기다림이 이야기가 된다', from_ids: ['D3'], transformed: true, why: '대기 시간을 0.3~1m 거리의 경험으로' },
      { id: 'P3', item: '향이 먼저 닿는 거리', gain: '보기 전에 멈춘다', from_ids: ['D4'], transformed: true, why: '감각 거리' },
    ],
    cut: [{ id: 'D5', reason: '브랜드 근거 없음(방어 불가)' }],
    line: '줌을 바꿔 봤어. 다섯이 셋으로 모였어.',
  } : {
    round: 2,
    shift: { type: 'SUBTRACT', name: '하나만 남기기', question: '셋 중 둘을 빼도 성립하는 하나는?', from: '여러 감각·층을 더해 차별화', to: '"다가가면 완성된다" 하나만 남긴다', reasoning: '1U — 하나의 코어에서 사인·대기 패널·컵 슬리브가 모두 파생된다', lenses: ['ONEU', 'BENEFIT'] },
    core: { id: 'CORE', item: '다가가면 완성되는 그림', gain: '멈춘 사람만 원두가 온 먼 길을 본다', from_ids: ['P1', 'P2'], statement: '성수 주말 팝업이라는 틀 안에서, 이름·입구·시음은 지키며, 다가갈수록 완성되는 그림으로 다르다', why: 'P3는 운영 비용이 크고, P1·P2는 같은 원리로 묶인다' },
    cut: [{ id: 'P3', reason: '향 장치 운영 비용 — 실행 비용' }],
    rtb: [{ fact: '농장→로스터리 이동 거리가 짧다', source: '첨부:브리프.md' }, { fact: '실제 이동 거리 수치', source: '확인 필요' }],
    final_check: [{ lens: 'FROM', ok: true, note: '우리의 관점(거리)이 코어' }, { lens: 'JAMAIS', ok: true, note: '사인 형식 유지' }, { lens: 'TUNNEL', ok: true, note: '네 레이어 모두 반영' }, { lens: 'ONEU', ok: true, note: '모든 접점이 하나에서 파생' }],
    verdict: '통과',
    line: '하나만 남겼어. 나머지는 다 여기서 나와.',
  }),
  '09_concepts': (ctx) => {
    const { T } = m(ctx);
    return {
      proposals: [
        { id: 'C1', concept: `${T}이 걷다 멈춘 순간 원두가 온 먼 길을 서두르지 않는 온기로 느끼게 한다`, theme: '한 걸음 가까이, 한 모금 멀리', metaphor: '가까이 갈수록 초점이 맞는 사진 (타겟)', from_me: '천천히 알아가는 거리', jamais: '사인은 그대로, 거리에 따라 다른 말', derive: '사인·대기 패널·슬리브가 모두 "거리"의 단계', for_all: '읽기 쉬운 큰 이름 + 다가가면 보이는 이야기', boldness: 0.6 },
        { id: 'C2', concept: `${T}이 줄을 선 3분에 원두의 여정을 함께 걷는 즐거움으로 느끼게 한다`, theme: '여기까지 온 맛', metaphor: '산지에서 온 편지 (브랜드)', from_me: '거리는 시간이다', jamais: '대기열은 그대로, 대기의 의미가 바뀜', derive: '대기 동선 = 원두의 여정', for_all: '아이도 따라 걷는 동선', boldness: 0.5 },
        { id: 'C3', concept: `${T}이 지나치는 3초에 겨울의 고요를 발견하는 반가움으로 느끼게 한다`, theme: '멈추면 보이는 겨울', metaphor: '눈 위의 발자국 (타겟)', from_me: '멈춤의 가치', jamais: '외벽은 그대로, 빈자리가 말함', derive: '여백의 단계', for_all: '정보를 줄여 누구나', boldness: 0.4 },
        { id: 'C4', concept: `${T}이 팝업 앞에서 향을 먼저 마주치는 놀라움으로 느끼게 한다`, theme: '보기 전에, 향', metaphor: '향의 문 (사용 습관)', from_me: '감각이 먼저', jamais: '입구는 그대로, 감각 순서가 바뀜', derive: '향 → 시각 → 맛', for_all: '시각 약자에게도', boldness: 0.8 },
        { id: 'C5', concept: `${T}이 빈 잔을 들고 나가며 자신의 거리 기록을 갖는 뿌듯함으로 느끼게 한다`, theme: '당신의 거리 412km', metaphor: '여권 도장 (사용 습관)', from_me: '거리를 소유하게', jamais: '컵은 그대로, 기록이 됨', derive: '슬리브 = 기록', for_all: '참여 장벽 낮음', boldness: 0.7 },
      ],
      first_round: { picked: ['C1', 'C2', 'C5'], cut: [{ id: 'C3', lens: 'BENEFIT', reason: '발견 외에 얻는 것이 약함' }, { id: 'C4', lens: 'YELLOW', reason: '향 장치는 운영 위험 · 일부만 경험' }] },
      painter_line: '다섯 장을 그렸어. 셋을 벽에 붙여 볼게.',
    };
  },
  b_concept: () => ({
    evaluations: [
      { id: 'C1', scores: [{ lens: 'FROM', score: 5, note: '거리의 관점이 코어' }, { lens: 'JAMAIS', score: 5, note: '사인 형식 유지 + 거리 해석' }, { lens: 'INERTIA', score: 4, note: '' }, { lens: 'ONEU', score: 5, note: '모든 접점이 파생' }, { lens: 'YELLOW', score: 4, note: '' }, { lens: 'BENEFIT', score: 4, note: '' }], total: 27, risk: '렌티큘러 제작 단가' },
      { id: 'C2', scores: [{ lens: 'FROM', score: 4, note: '' }, { lens: 'JAMAIS', score: 3, note: '대기 동선 연출은 흔함' }, { lens: 'INERTIA', score: 4, note: '' }, { lens: 'ONEU', score: 3, note: '외벽과 연결 약함' }, { lens: 'YELLOW', score: 5, note: '' }, { lens: 'BENEFIT', score: 4, note: '' }], total: 23, risk: '줄이 없으면 작동 안 함' },
      { id: 'C5', scores: [{ lens: 'FROM', score: 3, note: '' }, { lens: 'JAMAIS', score: 4, note: '' }, { lens: 'INERTIA', score: 4, note: '' }, { lens: 'ONEU', score: 3, note: '' }, { lens: 'YELLOW', score: 4, note: '' }, { lens: 'BENEFIT', score: 5, note: '기록을 가져감' }], total: 23, risk: '숫자가 확인 필요' },
    ],
    final: { id: 'C1', why: '나로부터·자메뷰·1U가 모두 가장 강하다. C2의 대기 3분과 C5의 기록은 C1에서 파생 가능', refine: ['C2의 대기 3분을 1m 층으로 흡수', 'C5의 슬리브 기록을 0.3m 층으로 흡수', '거리 수치는 확인 전까지 쓰지 않기'] },
    line: 'C1. 나머지 둘은 C1 안에 들어갈 수 있어.',
  }),
  '09_concept_kit': (ctx) => {
    const { T } = m(ctx);
    const rev = !/첫 판정/.test(ctx.feedback || '');
    return {
      concept: `${T}이 걷다 멈춘 순간 원두가 온 먼 길을 서두르지 않는 온기로 느끼게 한다`,
      theme: rev ? '가까이, 더 가까이' : '한 걸음 가까이, 한 모금 멀리',
      keywords: ['다가감', '두 번째 층', '먼 길', '온기'],
      metaphor: { metaphor: '가까이 갈수록 초점이 맞는 사진', source: '타겟 레이어', tone: '조용한 발견' },
      philosophy_core: [
        { lens: '나로부터', how: '"천천히 알아가는 거리"라는 우리의 시선이 컨셉의 출발점' },
        { lens: '자메뷰', how: '외벽 사인·대기 패널·컵이라는 익숙한 형식을 그대로 두고, 거리에 따라 다르게 읽히는 해석' },
        { lens: '관성·해석', how: '5m 이름·입구·시음(구조)은 지키고 두 번째 층(해석)에서 새로움' },
        { lens: '1U', how: '"거리" 하나에서 세 접점이 모두 파생' },
        { lens: '노랑', how: '멀리서는 누구나 읽고, 다가가면 더 알 수 있는 두 층' },
      ],
      tone_manner: { color: { desc: '웜 뉴트럴 60 · 원두 브라운 30 · 원본 로고 10', ids: ['COLOR-60310'] }, mood: { desc: '고요하고 따뜻한', ids: [] }, visual_style: { desc: '사진 + 얇은 선', ids: [] }, typography: { desc: '큰 산세리프 한 단어 + 작은 본문', ids: [] } },
      interpretation: [
        { touchpoint: '5m — 외벽 사인', keep: '크게 읽히는 브랜드명', change: '나머지는 흐릿한 한 점으로', gain: '무엇의 팝업인지 3초에 안다' },
        { touchpoint: '1m — 대기열 패널', keep: '줄의 방향', change: '가까이 오면 원두의 길이 선명해진다', gain: '기다리는 3분에 원두를 알게 된다' },
        { touchpoint: '0.3m — 컵 슬리브', keep: '시음 동선', change: '슬리브에 남은 마지막 한 조각', gain: '마신 뒤 이야기를 가져간다' },
      ],
      benefit: [{ touchpoint: '외벽 사인', task: '이해', visible: '무엇·어디', format: '크기 위계', metric: '5m에서 3초 안에 브랜드명을 말한다' }, { touchpoint: '대기열 패널', task: '기억', visible: '산지→여기의 길', format: 'VIZ-TRACE', metric: '줄을 선 사람이 "어디서 왔대"를 말한다' }],
      rough: { touchpoint: '외벽 사인', zones: [{ name: '브랜드명', position: '상단', size: '40%', content: '로고' }, { name: '흐린 점', position: '중앙', size: '45%', content: '가까이 가야 보이는 원두 사진' }, { name: '입구', position: '하단', size: '15%', content: '입구·시간' }] },
      gate_questions: ['맞는 방향인가?', '지나가는 사람에게 무엇을 주는가?', '사이니지 3종 제작 비용을 쓸 가치가 있는가?'],
      next_cost: 'Creative 가이드 3종 + 콘셉트 비주얼 3장',
      revision_note: rev ? '판정 의견을 반영해 테마를 더 짧게 줄였다' : '',
      painter_line: '새 캔버스야. 이번엔 다가가야 보이게.',
    };
  },
  '10_creative': () => {
    const g = (direction, title, headline, method, img, extra = {}) => ({
      direction, title, one_liner: extra.one || '', derived_from_core: extra.derive || '"다가가면 완성된다"를 거리 단계로 나눔', headline, subcopy: extra.sub || '가까이 오세요. 원두가 온 길이 보입니다.', cta: '한 모금 시음',
      visual: { composition: 'COMP-CIR 원형 집중', grid_layout: 'GRID-COL · LAY-HIER', color: '웜 뉴트럴 60 · 브라운 30 · 로고 10', type: '큰 한 단어', elements: '망점 사진', motion: '보는 거리에 따라 변화' },
      detail: { angle: 'ANG-EYE 눈높이 — 보행자 시선', view: 'VIEW-CU 클로즈업 — 원두 결', light: 'LIGHT-RMATTE 무광 반사 — 겨울 오후', texture: 'TEX-MATTE 무광 종이' },
      knowhow_used: ['EMP-SIZE', 'CON-SIZE', 'RATIO-73'],
      structure: [{ unit: '위치', name: '외벽 5m', content: '브랜드명 + 흐린 점', note: '3초' }, { unit: '위치', name: '대기열 1m', content: '선명해지는 원두 사진과 산지 이야기', note: '3분' }, { unit: '위치', name: '카운터 0.3m', content: '컵 슬리브의 마지막 조각', note: '가져감' }],
      method_shows_in: method,
      rationale: [{ decision: '거리별 해상도', reason: '일본 미학 — 유보된 완결', gain: '멈춘 사람만 보는 두 번째 층' }, ...(extra.empty ? [{ decision: '거리 눈금 반복', reason: '규칙의 일관성', gain: '' }] : [])],
      do: ['5m 거리에서 브랜드명 높이 600mm 이상', '두 번째 층은 1m 안에서만 읽히게'], dont: ['할인 문구', '크라프트지 텍스처'],
      image_prompt: img, image_size: '1536x1024',
    });
    return {
      examples: [
        g('A · 시스템 주도', '거리의 그리드', '한 걸음 가까이', '구조', 'Minimal pop-up store facade in Seoul, strict three-band grid, thin brown distance lines, warm neutral wall, winter afternoon side light, eye-level architectural photography', { one: '12열 그리드가 거리별 정보 층을 정확히 나눈다', empty: true }),
        g('B · 경험 주도', '다가가는 그림', '멈추면 보이는 겨울', '포인트', 'Pop-up coffee store facade, a large softly blurred halftone photo of coffee beans that becomes sharp up close, warm neutral tones, people pausing on a winter street, editorial photography', { one: '멀리선 흐린 한 점, 가까이 오면 원두와 산지가 선명해진다' }),
        g('B · 경험 주도', '기다림의 지도', '여기까지 온 맛', '구조', 'Queue line wall panels at a coffee pop-up showing an abstract hand-drawn route from farm to city, close-up matte paper texture, soft side light, eye level', { one: '대기 동선이 원두의 여정이 된다', derive: '"다가가면 완성된다"를 1m 대기 층으로', sub: '줄을 따라 걸으면, 원두가 걸어온 길을 걷습니다.' }),
      ],
      selection: { recommended: '다가가는 그림', why: 'A의 거리 눈금 반복은 효익이 비어 있다(개살구). "다가가는 그림"은 결정마다 사람이 얻는 것이 있고, "기다림의 지도"를 1m 층으로 품는다' },
      prelim_review: [{ gate: 'G4', status: '예비 통과', note: '익숙한 외벽 사인에 거리별 해석' }, { gate: 'G7', status: '보완 필요', note: '대기열 패널의 본문 크기 검증 필요' }],
      human_todo: ['C 게이트 확정 (사람)', '실제 산지 거리 수치 확인', '현장 조도 확인'],
      painter_line: '다 그렸어. 이제 네가 판정해 줘.',
    };
  },
  '11_report': () => ({
    title: '겨울 원두 팝업 — 다가가면 완성되는 그림',
    subtitle: '한 걸음 가까이, 한 모금 멀리',
    exec_summary: ['팝업은 모두 "크게, 지금"을 외친다 — 지나가는 사람은 멈출 이유가 없다', '우리는 이 원두를 "천천히 알아가는 거리"로 보고, 거리에 따라 다르게 말하는 사이니지로 판단했다', '외벽·대기열·컵 세 접점이 "다가가면 완성된다" 하나에서 파생되는 Creative를 제안한다'],
    slides: [
      { key: 'mission', headline: '지나가는 3초를 멈춰 선 30초로', bullets: [] },
      { key: 'from_me', headline: '우리는 이 원두를 "거리"로 본다', bullets: ['빠른 소비재가 아니라 천천히 알아가는 맛', '레퍼런스가 아니라 우리의 시선에서 출발'] },
      { key: 'airplane', headline: '유보된 완결 × 크기 하나의 위계', bullets: [] },
      { key: 'tunnel', headline: '멀리서는 하나만, 가까이 오면 두 번째 층', bullets: [] },
      { key: 'positioning', headline: '빈자리 — 하나만, 체험으로', bullets: [] },
      { key: 'forpop', headline: '틀은 지키고, 차이는 하나만', bullets: [] },
      { key: 'concept', headline: '다섯 갈래에서 하나의 코어로', bullets: [] },
      { key: 'creative', headline: '세 접점, 하나의 거리', bullets: [] },
      { key: 'brain', headline: '판단 브레인이 지킨 것', bullets: ['포지셔닝 축을 우리의 관점으로 재작업', '모든 접점이 하나의 코어에서 파생되는지 점검'] },
      { key: 'next', headline: '사람이 판정할 것', bullets: ['C 게이트 확정', '산지 거리 수치 확인'] },
    ],
  }),
  lib_ism: () => ({ items: [{ id: 'ISM-ZEN', name: '선(禪) 미학', original: 'Zen aesthetics', era: '12C– · 동아시아', people: [], principles: ['비움은 결핍이 아니라 집중이다', '반복 수행으로 형식을 지운다'], visual: ['여백', '단색'], works: [], take: ['정보를 하나만 남겨 집중을 만든다', '반복 사용에서 형식이 사라지게 설계한다'], leave: ['무조건적 미니멀 — 필요한 정보까지 지우기'], summary: '비움으로 집중을 만든다.', inferred: false }], note: '자료에서 사조 1개를 추출했다' }),
  lib_knowhow: () => ({ items: [{ id: 'KH-HEROCUT', category: '디테일·이미지', name: '히어로 컷 3분할', desc: '주인공 오브젝트를 화면 1/3 지점에 두고 나머지 2/3를 여백으로 남긴다', effect: '집중과 카피 공간 확보', stages: ['구조화', '이미지 생성'], how: '이미지 생성 시 negative space 2/3 지정' }], note: '노하우 1개를 추출했다' }),
};

function svgPlaceholder(title, w, h) {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#EDEAE2"/><g fill="none" stroke="#111" stroke-width="2"><rect x="40" y="40" width="${w - 80}" height="${h - 80}"/><line x1="40" y1="40" x2="${w - 40}" y2="${h - 40}" stroke-opacity=".15"/><line x1="${w - 40}" y1="40" x2="40" y2="${h - 40}" stroke-opacity=".15"/><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 6}"/></g><text x="${w / 2}" y="${h - 70}" font-family="sans-serif" font-size="28" text-anchor="middle" fill="#111">MOCK · ${String(title || '').replace(/[<&]/g, '')}</text></svg>`;
  return Buffer.from(s, 'utf8');
}

async function chat({ meta }) {
  const name = meta.prompt;
  await wait(name.startsWith('b_') ? 700 : name === '03_ism' || name === '05_layer' ? 1400 : 900, name === '10_creative' ? 3200 : 2200);
  const b = builders[name];
  if (!b) throw new Error('mock: unknown prompt ' + name);
  return { json: b(meta.ctx || {}), model: 'mock', usage: { prompt_tokens: 3000 + Math.round(Math.random() * 4000), completion_tokens: 600 + Math.round(Math.random() * 900) } };
}

async function image({ size = '1536x1024', meta }) {
  await wait(1500, 2500);
  const [w, h] = size.split('x').map((n) => parseInt(n, 10) / 2);
  return { buffer: svgPlaceholder(meta && meta.example && meta.example.title, w, h), usage: null, model: 'gpt-image-1', quality: 'medium' };
}

module.exports = { chat, image, listModels: async () => ['mock'], test: async () => ({ ok: true, count: 1 }), name: 'mock' };
void pick;
