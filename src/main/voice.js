'use strict';
/**
 * AI투 검사기 — knowledge/method/writing.md 3장(문장 길이)과 4장(쓰지 않는 표현)을 정규식으로 옮긴 것.
 * writing.md의 표현 목록을 고치면 여기도 같이 고친다.
 *
 * 쓰임은 하나뿐이다: 교열(p_polish)에 보낼 문장을 고르고, 교열 전후의 검출 수를 센다.
 * 표현을 글자 그대로 찾기 때문에 문맥상 괜찮은 표현도 잡는다 — 고칠지는 교열 모델이 판단한다.
 */
const PATTERNS = [
  ['장면 은유', /달라 보[여입이]|자랍니다|자라난|피어나|스며들|녹아들|조용히|천천히|(을|를) 만나(다|고|게|는|면)|의 순간|너머|속에서|작은 [가-힣]+ 하나/g],
  ['감정 선언', /느낀다|느낍니다|느끼게 (한다|합니다|된다|됩니다)|(즐거움|설렘|감동)을 (준다|줍니다|주는|선사)|특별한 경험|선사(하|합|한)/g],
  ['빈 명사', /(새로운|특별한|색다른|차별화된|의미 있는|풍부한) (경험|가치|여정|감성|이야기)/g],
  ['번역투', /에 대한 |(을|를) 통해|에 있어서|(을|를) 제공(하|합|한)|가 가능(하|합|한)|하는 것이다|동일한|[가-힣]{2,}적인 (경험|가치|공간|감성)/g],
  ['칸 채우기', /에서 [^.]{0,30}(을|를) [^.]{0,20}느끼게 (한다|합니다)/g],
  ['주어 없는 서술', /(으로|로) (다르다|다릅니다)|해석으로 [가-힣]+다\b/g],
];

/** 한 문장의 검출 목록 — [{ kind, phrase }] */
function lint(text) {
  const t = String(text || '');
  const hits = [];
  for (const [kind, re] of PATTERNS) for (const m of t.matchAll(re)) hits.push({ kind, phrase: m[0].trim() });
  if (t.length > 100) hits.push({ kind: '긴 문장', phrase: `${t.length}자` });
  for (const sent of t.split(/(?<=[.!?。])\s+/)) { const c = (sent.match(/,/g) || []).length; if (c >= 3) hits.push({ kind: '절이 많은 문장', phrase: `쉼표 ${c}개` }); } // writing.md 3장 6 — 절은 두 개까지
  return hits;
}

/** 여러 문장의 검출 합계 — { total, byKind: { 장면 은유: n, … } } */
function tally(texts) {
  const byKind = {};
  let total = 0;
  for (const t of texts) for (const h of lint(t)) { byKind[h.kind] = (byKind[h.kind] || 0) + 1; total++; }
  return { total, byKind };
}

module.exports = { lint, tally, PATTERNS };
