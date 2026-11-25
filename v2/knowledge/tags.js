// 태그 라이브러리 · 시드 인풋 · 관점.
// 노드 세팅을 사람마다 다르게 하지 않기 위한 사전이다. 태그와 인풋 칸은 여기서만 고친다.

/** 분류 — 프로젝트와 태그가 속하는 일곱 갈래. 한 프로젝트가 여러 분류에 걸칠 수 있다(예: 마케팅 + 운영). */
export const CATEGORIES = [
  { id: 'marketing', name: '마케팅', role: '누구에게 무엇을 어디서 말해 무엇을 얻는가' },
  { id: 'planning', name: '기획', role: '무엇을 왜 어디까지 만드는가' },
  { id: 'design', name: '디자인', role: '어떻게 보이고 어떻게 쓰이는가' },
  { id: 'dev', name: '개발', role: '무엇으로 어떻게 만들고 굴리는가' },
  { id: 'integrated', name: '통합', role: '여러 파트를 하나의 방향으로 묶는다' },
  { id: 'service', name: '서비스(자사)', role: '우리 서비스를 키우고 운영한다' },
  { id: 'ops', name: '운영', role: '만든 뒤 누가 무엇을 얼마나 자주 굴리고 고치는가' },
];

/** 프로젝트가 고른 분류들 — 예전 프로젝트(category 하나)도 받는다 */
export const categoriesOf = (project) => { const list = Array.isArray(project?.categories) && project.categories.length ? project.categories : (project?.category ? [project.category] : []); return [...new Set(list)].filter((id) => CATEGORIES.some((c) => c.id === id)); };

const T = (id, category, name, keywords) => ({ id, category, name, keywords });
/** 태그 — keywords는 자동 추천에 쓴다. 입력 글에 이 말이 있으면 그 태그를 추천한다. */
export const TAGS = [
  T('mk-campaign', 'marketing', '캠페인', ['캠페인', '런칭 캠페인', '시즌']),
  T('mk-promo', 'marketing', '프로모션', ['프로모션', '이벤트', '쿠폰', '할인', '경품', '오퍼']),
  T('mk-ad', 'marketing', '광고 소재', ['광고', '소재', '배너', '옥외', '영상 광고', 'TVC']),
  T('mk-content', 'marketing', 'SNS · 콘텐츠', ['SNS', '인스타', '쓰레드', '유튜브', '콘텐츠', '숏폼', '채널 운영']),
  T('mk-perf', 'marketing', '전환 · 퍼포먼스', ['전환', 'CTR', 'CPA', 'ROAS', '유입', '퍼널', '가입률', '구매']),
  T('mk-brand', 'marketing', '브랜드 인지', ['인지', '인지도', '브랜딩', '브랜드 캠페인', '이미지']),
  T('mk-crm', 'marketing', 'CRM · 재방문', ['CRM', '리텐션', '재방문', '재구매', '푸시', '멤버십']),
  T('mk-search', 'marketing', '검색 · GEO', ['검색', 'SEO', 'GEO', 'AEM', 'AI 검색', '키워드']),

  T('pl-service', 'planning', '서비스 기획', ['서비스 기획', '기능', '요구사항', '스펙', '정책 정의']),
  T('pl-ia', 'planning', '정보 구조', ['정보 구조', 'IA', '메뉴', '내비게이션', '화면 목록', '분류 체계']),
  T('pl-journey', 'planning', '사용자 여정', ['여정', '플로우', '시나리오', '온보딩', '핵심 순간', '이탈']),
  T('pl-policy', 'planning', '정책 · 제약', ['정책', '제약', '법', '심의', '개인정보', '금지', '약관']),
  T('pl-content', 'planning', '콘텐츠 기획', ['콘텐츠 기획', '문항', '카피', '메시지', '스토리', '구성안']),
  T('pl-data', 'planning', '지표 · 분석', ['KPI', '지표', '대시보드', '분석', '퍼널 설계', '측정']),
  T('pl-proposal', 'planning', '제안 · 입찰', ['제안', '입찰', '나라장터', '경쟁 PT', '제안서', 'RFP']),
  T('pl-research', 'planning', '리서치', ['리서치', '조사', '인터뷰', '리뷰 분석', '경쟁사 분석', '벤치마크']),

  T('ds-ui', 'design', 'UI', ['UI', '화면', '컴포넌트', '레이아웃', '미니앱', '앱 화면']),
  T('ds-ux', 'design', 'UX 흐름', ['UX', '사용성', '흐름', '인터랙션', '조작']),
  T('ds-brand', 'design', '브랜드 시스템', ['브랜드 시스템', 'BI', 'CI', '아이덴티티', '로고', '가이드라인']),
  T('ds-kv', 'design', '키비주얼', ['키비주얼', 'KV', '피처 이미지', '포스터', '메인 이미지']),
  T('ds-motion', 'design', '모션 · 영상', ['모션', '영상', '애니메이션', '트랜지션']),
  T('ds-space', 'design', '공간 · 사이니지', ['사이니지', '공간', '키오스크', '파사드', '웨이파인딩', '전시']),
  T('ds-image', 'design', '이미지 · 일러스트', ['일러스트', '이미지', '사진', '3D', '그래픽']),
  T('ds-system', 'design', '디자인 시스템', ['디자인 시스템', '토큰', '타입 스케일', '그리드', '스타일 가이드']),

  T('dv-front', 'dev', '프런트엔드', ['프런트', '프론트', '웹', 'React', '퍼블리싱', '반응형']),
  T('dv-back', 'dev', '백엔드 · API', ['백엔드', 'API', '서버', '인증', '로그인', '연동']),
  T('dv-data', 'dev', '데이터 · DB', ['DB', '데이터베이스', 'Supabase', '스키마', '로그', '수집']),
  T('dv-platform', 'dev', '플랫폼 제약', ['미니앱', '토스', '앱인토스', '스토어', '플랫폼 규격', '키오스크', 'SDK']),
  T('dv-perf', 'dev', '성능 · 접근성', ['성능', '속도', '접근성', 'WCAG', '보안']),
  T('dv-ai', 'dev', 'AI · 자동화', ['AI', 'LLM', 'GPT', '자동화', '에이전트', '프롬프트']),
  T('dv-ops', 'dev', '배포 · 운영', ['배포', 'Vercel', '운영', '모니터링', '장애', '유지보수']),

  T('in-imc', 'integrated', '통합 캠페인', ['통합', 'IMC', '온오프', '옴니채널']),
  T('in-launch', 'integrated', '런칭', ['런칭', '출시', '오픈', '론칭']),
  T('in-renewal', 'integrated', '리뉴얼', ['리뉴얼', '개편', '고도화', '2.0']),
  T('in-annual', 'integrated', '연간 운영', ['연간', '운영 제안', '운영 대행', '상시 운영']),
  T('in-touch', 'integrated', '접점 설계', ['접점', '터치포인트', '채널 믹스', '동선']),

  T('sv-growth', 'service', '성장 · 재방문', ['성장', '활성', 'MAU', 'DAU', '재방문', '바이럴', '공유']),
  T('sv-revenue', 'service', '수익 모델', ['수익', '매출', '결제', '구독', '광고 수익', '과금']),
  T('sv-ops', 'service', '서비스 운영', ['자사', '사내', '운영 리소스', 'CS', '문의', '커뮤니티 운영']),
  T('sv-roadmap', 'service', '로드맵', ['로드맵', '우선순위', '다음 버전', '백로그']),
  T('sv-tool', 'service', '사내 툴', ['사내 툴', '내부 도구', '업무 자동화', '관리자']),

  T('op-content', 'ops', '콘텐츠 운영', ['콘텐츠 운영', '게시', '업로드', '월간 콘텐츠', '운영 캘린더']),
  T('op-promo', 'ops', '상시 프로모션', ['프로모션 운영', '쿠폰', '이벤트 운영', '상시 프로모션', '혜택 운영']),
  T('op-cs', 'ops', '고객 응대', ['고객 응대', '리뷰 대응', '문의 대응', 'VOC', '민원']),
  T('op-report', 'ops', '모니터링 · 리포트', ['모니터링', '월간 리포트', '주간 리포트', '지표 점검', '대시보드']),
  T('op-process', 'ops', '운영 프로세스', ['운영 프로세스', '검수', '승인 절차', '인수인계', '운영 매뉴얼']),
];

export const tagById = (id) => TAGS.find((t) => t.id === id) || null;
export const categoryById = (id) => CATEGORIES.find((c) => c.id === id) || null;

const F = (id, label, hint, required = false) => ({ id, label, hint, required });
/** 공통 인풋 — 어떤 분류든 이것이 없으면 판단할 수 없다 */
export const COMMON_INPUT = [
  F('what', '무엇을', '만들거나 풀 것 한 문장', true),
  F('purpose', '목적', '끝나면 무엇이 되어야 하나', true),
  F('success', '성공 기준', '무엇이 얼마나 달라지면 성공인가 (예: 한 달에 한 번 이상 앱을 여는 고객이 늘어난다)'),
  F('target', '타겟', '누가, 어떤 순간에', true),
  F('product', '제품·서비스', '대상이 되는 것'),
  F('channel', '채널·매체', '어디서 만나나'),
  F('note', '제약·메모', '반드시 지킬 것, 쓰면 안 되는 것, 비교 대상'),
];

/** 분류별 인풋 — 그 분류에서 최적 판단에 필요한 최소한. required 칸이 비면 그 관점의 디렉션은 "확인 필요"로 남는다. */
export const SEED_INPUT = {
  marketing: [
    F('kpi', '목표 지표', '무엇이 얼마나 달라지면 성공인가', true),
    F('offer', '오퍼 · 메시지', '사람에게 주는 것, 하고 싶은 말', true),
    F('media', '매체 · 기간 · 예산', '쓸 수 있는 매체와 기간, 예산의 크기'),
    F('rival', '경쟁 상황', '같은 사람을 두고 겨루는 것'),
  ],
  planning: [
    F('problem', '문제 정의', '지금 무엇이 안 되고 있나', true),
    F('scope', '범위', '만들 것과 만들지 않을 것', true),
    F('decider', '결정하는 사람', '누가 무엇을 근거로 통과시키나'),
    F('success', '성공 기준', '무엇을 보고 됐다고 하나'),
  ],
  design: [
    F('deliverable', '결과물과 범위', '화면 · 영상 · 공간 등, 몇 개를 어디까지', true),
    F('moment', '핵심 순간', '가장 중요한 한 장면과 그때 사람이 원하는 것', true),
    F('brand', '브랜드 자산 · 금지', '컬러 · 서체 · 톤, 쓰면 안 되는 것'),
    F('spec', '디바이스 · 규격', '기기, 크기, 플랫폼 가이드'),
  ],
  dev: [
    F('stack', '플랫폼 · 스택', '어디에 올리고 무엇으로 만드나', true),
    F('integrate', '연동 · 데이터', '붙여야 하는 것, 다루는 데이터', true),
    F('nonfunc', '성능 · 보안 · 접근성', '지켜야 하는 수준'),
    F('ops', '일정 · 운영 주체', '언제까지, 만든 뒤 누가 굴리나'),
  ],
  integrated: [
    F('parts', '파트와 역할', '참여하는 파트와 각자의 범위', true),
    F('milestone', '일정 · 마일스톤', '큰 날짜들', true),
    F('touch', '접점 목록', '사람이 만나는 모든 자리'),
    F('govern', '의사결정 구조', '누가 최종 결정하나, 충돌하면 누가 정하나'),
  ],
  ops: [
    F('cycle', '운영 주기 · 범위', '상시 · 월간 · 캠페인 단위, 맡는 범위', true),
    F('standard', '응대 · 품질 기준', '무엇을 얼마나 빨리, 어떤 수준으로', true),
    F('team', '운영 인력 · 도구', '누가 무엇으로 굴리나'),
    F('review', '보고 · 개선 주기', '무엇을 언제 보고 고치나'),
  ],
  service: [
    F('status', '지금 상태', '사용자 수 · 재방문 · 매출 등 아는 만큼', true),
    F('segment', '사용자 구분', '누가 쓰고 누가 떠나나', true),
    F('model', '수익 모델', '어디서 돈이 되나'),
    F('resource', '운영 리소스', '만들고 굴릴 사람과 시간'),
  ],
};

/** 관점 — 어떤 분류로 시작하든 통합 디렉션은 이 넷으로 정리된다. 개발은 필요 없는 과제면 뺀다. */
export const PERSPECTIVES = [
  { id: 'planning', name: '기획', asks: '무엇을 어디까지 만들고, 무엇으로 성공을 재나' },
  { id: 'design', name: '디자인', asks: '어떻게 보이고 어떻게 쓰이게 하나' },
  { id: 'development', name: '개발', asks: '무엇을 만들어야 하고, 무엇이 구현을 막나', optional: true },
  { id: 'service', name: '서비스', asks: '출시 뒤 어떻게 굴리고 키우나' },
];

/**
 * 자동 태그 추천 — 규칙 기반. 같은 글이면 누구에게나 같은 태그가 나온다.
 * 점수 = 글에 나온 키워드 수(태그 이름이 그대로 나오면 2점). 프로젝트 분류의 태그는 0.5점을 더 준다.
 */
export function recommendTags(text, { category = null, limit = 5 } = {}) {
  const hay = String(text || '').toLowerCase();
  if (!hay.trim()) return [];
  const scored = TAGS.map((t) => {
    const hits = t.keywords.filter((k) => hay.includes(k.toLowerCase()));
    const score = hits.length + (hay.includes(t.name.toLowerCase()) ? 1 : 0);
    return { tag: t, hits, score: score ? score + (t.category === category ? 0.5 : 0) : 0 };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score || (a.tag.id < b.tag.id ? -1 : 1));
  return scored.slice(0, limit).map((x) => ({ id: x.tag.id, name: x.tag.name, category: x.tag.category, score: x.score, because: x.hits }));
}

/** 글에서 분류를 짚는다 — 태그 점수를 분류별로 더해 가장 큰 것 */
export function recommendCategory(text) {
  const sum = {};
  for (const r of recommendTags(text, { limit: 99 })) sum[r.category] = (sum[r.category] || 0) + r.score;
  const ranked = Object.entries(sum).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return ranked.length ? ranked[0][0] : null;
}

/** 기본 노드의 태그 — 노드가 어느 갈래의 판단인지 */
export const LENS_TAGS = {
  'ID-FROM': ['integrated'], 'ID-JAMAIS': ['design', 'planning'], 'ID-INERTIA': ['design', 'planning'], 'ID-ONEU': ['design', 'integrated'],
  'ID-YELLOW': ['design', 'service'], 'ID-BENEFIT': ['planning', 'service'], 'ID-N7': ['design'],
  'TN-MARKET': ['marketing'], 'TN-BRAND': ['marketing', 'design'], 'TN-TARGET': ['marketing', 'planning'], 'TN-USAGE': ['planning', 'service'],
  airplane: ['design'],
};
