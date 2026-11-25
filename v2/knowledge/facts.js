// 팩트북 — 실제 자료를 노드로 넣는다.
// 터널(시장 · 브랜드 · 타겟 · 사용 습관)이 모델의 일반 지식이 아니라 실제 자료로 좁혀지게 하는 재료다.
// 출처가 먼저다. 받는 출처는 공식 통계 · 공시 · 브랜드 공식 자료 · 보도자료다. 그 밖의 출처는 받지 않는다.
// AI가 조사해 채울 수 있고, 팩트북은 md 파일로 내보내고 다시 읽는다.

/** 무엇에 대한 사실인가 */
export const FACT_KINDS = [
  { id: 'trend', name: '트렌드', hint: '업계 · 카테고리의 최근 흐름' },
  { id: 'habit', name: '타겟 습성', hint: '타겟이 실제로 하는 행동 · 쓰는 시간 · 쓰는 채널' },
  { id: 'stat', name: '통계', hint: '조사 · 지표 · 수치' },
  { id: 'disclosure', name: '공시', hint: '사업보고서 · IR · 정부 공고' },
  { id: 'notice', name: '브랜드 공지', hint: '클라이언트와 경쟁사의 발표 · 정책 변경' },
  { id: 'issue', name: '이슈', hint: '지금 벌어진 사건 · 논란 · 규제' },
];
export const factKind = (id) => FACT_KINDS.find((k) => k.id === id) || null;

/** 어디서 나온 사실인가 — AI 조사는 앞의 넷만 쓸 수 있다 */
export const SOURCE_TYPES = [
  { id: 'stat', name: '공식 통계', hint: '통계청 · 정부 부처 · 중앙은행 · 국제기구 · 공인 조사기관', ai: true },
  { id: 'disclosure', name: '공시', hint: '전자공시 · 사업보고서 · IR 자료 · 정부 공고', ai: true },
  { id: 'official', name: '브랜드 공식 자료', hint: '공식 홈페이지 · 뉴스룸 · 공식 채널 공지', ai: true },
  { id: 'press', name: '보도자료', hint: '기업 · 기관이 직접 배포한 보도자료 원문', ai: true },
  { id: 'internal', name: '내부 자료', hint: '클라이언트가 준 자료 · 브리프 (직접 입력만)', ai: false },
];
export const sourceType = (id) => SOURCE_TYPES.find((t) => t.id === id) || null;

/** 터널 레이어가 먼저 읽는 팩트 종류 */
export const TUNNEL_FACTS = {
  'TN-MARKET': ['trend', 'stat', 'disclosure', 'issue'],
  'TN-BRAND': ['notice', 'disclosure', 'issue'],
  'TN-TARGET': ['habit', 'stat'],
  'TN-USAGE': ['habit', 'trend'],
};

const byName = (list) => new Map(list.flatMap((k) => [[k.name, k.id], [k.id, k.id]]));
const KIND = byName(FACT_KINDS);
const STYPE = byName(SOURCE_TYPES);
const str = (v) => String(v ?? '').trim();
const isUrl = (v) => /^https?:\/\/[^\s]+\.[^\s]+/i.test(str(v));

/**
 * 팩트 한 건이 받을 수 있는 형태인지 본다. 이유를 돌려준다(빈 문자열이면 통과).
 *   공통  내용 · 출처 이름 · 종류 · 출처 유형
 *   AI 조사  주소(URL)와 날짜가 반드시 있어야 하고, 내부 자료 유형은 쓸 수 없다
 */
export function factProblem(f) {
  if (!str(f?.text)) return '내용이 없다';
  if (!factKind(f.kind)) return '종류가 없다';
  if (!str(f.source)) return '출처가 없다';
  const t = sourceType(f.sourceType);
  if (!t) return '출처 유형이 받는 네 가지(공식 통계 · 공시 · 브랜드 공식 자료 · 보도자료)가 아니다';
  if (f.by === 'ai') {
    if (!t.ai) return 'AI 조사는 내부 자료를 만들 수 없다';
    if (!isUrl(f.url)) return '원문 주소가 없다';
    if (!str(f.date)) return '날짜가 없다';
  }
  return '';
}

/** 쓸 수 있는 팩트만 */
export function validFacts(project) {
  const all = Array.isArray(project?.facts) ? project.facts : [];
  const ok = all.filter((f) => !factProblem(f));
  return { facts: ok, rejected: all.length - ok.length };
}

export function nextFactId(project) {
  const max = (project.facts || []).reduce((m, f) => Math.max(m, +(String(f.id).replace(/\D/g, '')) || 0), 0);
  return `F${max + 1}`;
}

/**
 * AI 조사 결과를 걸러 팩트로 만든다. 받지 못한 항목은 이유와 함께 돌려준다.
 * 같은 주소 · 같은 내용은 한 번만 받는다. 사람이 원문을 확인하기 전에는 checked: false 다.
 */
export function acceptResearch(raw, project) {
  const have = new Set((project.facts || []).map((f) => `${str(f.url)}|${str(f.text)}`));
  let n = +(nextFactId(project).slice(1));
  const facts = []; const rejected = [];
  for (const r of Array.isArray(raw?.facts) ? raw.facts : []) {
    const f = { id: `F${n}`, kind: KIND.get(str(r.kind)) || '', text: str(r.text), sourceType: STYPE.get(str(r.sourceType)) || '', source: str(r.source), date: str(r.date), url: str(r.url), quote: str(r.quote).slice(0, 120), by: 'ai', checked: false };
    const why = factProblem(f);
    const key = `${f.url}|${f.text}`;
    if (why) { rejected.push({ text: f.text || '(내용 없음)', why }); continue; }
    if (have.has(key)) { rejected.push({ text: f.text, why: '이미 있는 항목' }); continue; }
    have.add(key); facts.push(f); n++;
  }
  return { facts, rejected, missing: (Array.isArray(raw?.missing) ? raw.missing : []).map(str).filter(Boolean) };
}

/** 프롬프트에 넣을 팩트북 — 노드가 터널이면 그 레이어의 종류를 앞에 둔다 */
export function factsFor(facts, lensId) {
  const first = new Set(TUNNEL_FACTS[lensId] || []);
  return [...facts].sort((a, b) => (first.has(b.kind) ? 1 : 0) - (first.has(a.kind) ? 1 : 0))
    .map((f) => ({ id: f.id, 종류: factKind(f.kind).name, 내용: f.text, 출처: `${sourceType(f.sourceType).name} — ${f.source}`, ...(f.date ? { 날짜: f.date } : {}), ...(f.by === 'ai' && !f.checked ? { 확인: '사람이 원문을 확인하기 전' } : {}) }));
}

// ---------- md ----------
// # 팩트북 — 프로젝트
// ## 통계
// - [F1] 내용 한 문장
//   - 출처: 공식 통계 — 통계청 「…」
//   - 날짜: 2026-03
//   - 주소: https://…
//   - 근거 구절: "…"
//   - 확인: 사람 확인 / AI 조사 · 확인 전 / 직접 입력

export function factsToMarkdown(project) {
  const all = Array.isArray(project?.facts) ? project.facts : [];
  const L = [`# 팩트북 — ${project.title || ''}`.trim(), '', `받는 출처: ${SOURCE_TYPES.map((t) => t.name).join(' · ')}. 출처가 없거나 다른 출처에서 온 항목은 분석에 쓰지 않는다.`, ''];
  for (const k of FACT_KINDS) {
    const list = all.filter((f) => f.kind === k.id);
    if (!list.length) continue;
    L.push(`## ${k.name}`, '');
    for (const f of list) {
      L.push(`- [${f.id}] ${f.text}`, `  - 출처: ${sourceType(f.sourceType)?.name || '?'} — ${f.source}`);
      if (f.date) L.push(`  - 날짜: ${f.date}`);
      if (f.url) L.push(`  - 주소: ${f.url}`);
      if (f.quote) L.push(`  - 근거 구절: "${f.quote}"`);
      L.push(`  - 확인: ${f.by === 'ai' ? (f.checked ? 'AI 조사 · 사람 확인' : 'AI 조사 · 확인 전') : '직접 입력'}`);
      const why = factProblem(f);
      if (why) L.push(`  - 제외: ${why}`);
    }
    L.push('');
  }
  return L.join('\n');
}

/** md → 팩트. factsToMarkdown 이 쓴 형식과, 사람이 같은 형식으로 고친 파일을 읽는다. */
export function parseFactbook(md) {
  const facts = []; let kind = ''; let cur = null; let n = 1;
  const push = () => { if (cur) facts.push(cur); cur = null; };
  for (const line of String(md || '').split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) { push(); kind = KIND.get(h[1]) || ''; continue; }
    const item = line.match(/^-\s+(?:\[(F\d+)\]\s*)?(.+?)\s*$/);
    if (item && !/^\s/.test(line)) { push(); cur = { id: item[1] || '', kind, text: item[2], sourceType: '', source: '', date: '', url: '', quote: '', by: 'human', checked: true }; continue; }
    const sub = line.match(/^\s+-\s+(출처|날짜|주소|근거 구절|확인)\s*:\s*(.*?)\s*$/);
    if (!sub || !cur) continue;
    const [, key, val] = sub;
    if (key === '출처') { const m = val.match(/^(.+?)\s+—\s+(.+)$/); if (m && STYPE.has(m[1])) { cur.sourceType = STYPE.get(m[1]); cur.source = m[2]; } else cur.source = val; }
    else if (key === '날짜') cur.date = val;
    else if (key === '주소') cur.url = val;
    else if (key === '근거 구절') cur.quote = val.replace(/^"|"$/g, '');
    else if (key === '확인') { cur.by = val.startsWith('AI') ? 'ai' : 'human'; cur.checked = !val.includes('확인 전'); }
  }
  push();
  const used = new Set(facts.map((f) => f.id).filter(Boolean));
  for (const f of facts) { if (!f.id) { while (used.has(`F${n}`)) n++; f.id = `F${n}`; used.add(f.id); } }
  return facts;
}
