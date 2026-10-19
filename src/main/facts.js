'use strict';
/**
 * 사실 가드 — 결과물에 들어가는 수치와 문장의 기계적 정리.
 *
 *  1) 수치 가드: 단위가 붙은 수치(900~1200mm, 3~5°, 14일, IP54, 4.5:1 …)가 근거 자료(브리프·첨부·사람의 답·웹 정찰)에
 *     없고, 이름 있는 표준(KS·ISO·WCAG·법령)의 값으로 적히지도 않았으면 '값 미정 · 목업'으로 바꾼다.
 *     지어낸 수치가 사양처럼 남는 것을 막는다. 바꾼 값은 검증 계획으로 넘긴다.
 *  2) 고지 문구 정리: "예비 판정입니다" "판단자는 FREATIVE이며" "출처: 브리프·추론" 같은 문장 끝 고지는 지운다.
 *     예비라는 사실은 보고서 머리에 한 번만 적는다. 근거는 from 칸에 남는다.
 *  3) 비슷한 문장 묶기: 확인할 것·검증 항목처럼 단계마다 다시 나오는 목록을 하나로 모은다.
 */

const UNIT = '(?:mm|㎜|cm|km|m|°|도|%|px|dp|pt|초|분|시간|일|주|개월|년|lux|lx|cd/㎡|cd|GU|kg|W|V|dB|K)';
const NUM = '\\d+(?:[.,]\\d+)?';
const SEP = '(?:~|–|-|～|에서|/)';
const RANGE = `${NUM}(?:\\s*${SEP}\\s*${NUM})*`;
const NUM_RE = new RegExp(`(?<![A-Za-z0-9가-힣\\-/])(${RANGE})\\s*(${UNIT})(?![A-Za-z])`, 'g');
const IP_RE = /\bIP\s?\d{2}\b/g;
const RATIO_RE = new RegExp(`(?<![0-9])(${NUM})\\s*:\\s*1\\b`, 'g');
const STANDARD = /(WCAG|KWCAG|ISO|KS\s?[A-Z]?|IEC|EN\s?\d|ADA|장애인등편의법|편의증진법|소방|건축법|시행규칙|고시|규정|기준서)/;
const PLACEHOLDER = '(값 미정 · 목업)';

/** 근거 자료에서 '수치|단위' 사전을 만든다 — 숫자만 같아서는 근거가 아니다(5·7 같은 작은 수는 어디에나 있다) */
function sourceIndex(texts) {
  const set = new Set();
  for (const t of texts) {
    const s = String(t || '');
    for (const m of s.matchAll(NUM_RE)) for (const n of splitNums(m[1])) set.add(`${norm(n)}|${unitKey(m[2])}`);
    for (const m of s.matchAll(IP_RE)) set.add(`${m[0].replace(/\D/g, '')}|IP`);
    for (const m of s.matchAll(RATIO_RE)) set.add(`${norm(m[1])}|:1`);
  }
  return set;
}
const norm = (x) => String(x).replace(/,/g, '').replace(/^0+(?=\d)/, '');
const splitNums = (range) => range.split(new RegExp(`\\s*${SEP}\\s*`)).filter(Boolean);
const unitKey = (u) => ({ '㎜': 'mm', '도': '°', lx: 'lux' }[u] || u);

function grounded(text, idx, start, numbers, unit) {
  // 표준 이름은 같은 구절 안(앞쪽 쉼표·마침표까지)에 있어야 한다 — 옆 구절의 'WCAG'가 다른 수치를 덮지 않게
  const before = text.slice(Math.max(0, start - 30), start).split(/[,;.·\n]/).pop();
  const after = text.slice(start, start + 30).split(/[,;.·\n]/)[0];
  if (STANDARD.test(before) || STANDARD.test(after)) return true;
  return numbers.every((n) => idx.has(`${norm(n)}|${unitKey(unit)}`));
}

/** 문장 하나의 근거 없는 수치를 바꾼다 — { text, hits:[원문] } */
function guardText(text, idx) {
  if (typeof text !== 'string' || !/\d/.test(text)) return { text, hits: [] };
  const hits = [];
  let out = text.replace(NUM_RE, (m, range, unit, off) => {
    const nums = splitNums(range);
    // 연도는 건너뛴다
    if (/^\d{4}$/.test(nums[0]) && /년/.test(unit)) return m;
    if (grounded(text, idx, off, nums, unit)) return m;
    hits.push(m); return PLACEHOLDER;
  });
  out = out.replace(IP_RE, (m, off) => (grounded(out, idx, off, [m.replace(/\D/g, '')], 'IP') ? m : (hits.push(m), '방수·방진 등급(값 미정 · 목업)')));
  out = out.replace(RATIO_RE, (m, n, off) => (grounded(out, idx, off, [n], ':1') ? m : (hits.push(m), `대비(값 미정 · 목업)`)));
  // 같은 자리 표시가 연달아 나오면 하나로
  out = out.replace(/(\(값 미정 · 목업\))(?:\s*[·/,~]\s*\(값 미정 · 목업\))+/g, '$1');
  return { text: out, hits };
}

const BOILER = [
  /\s*(?:FREATIVE의\s*)?예비\s*판정(?:입니다|이며|이고|으로)[^.。]*?[.。](?=\s|$)/g,
  /\s*(?:모두\s*)?예비\s*판정입니다[.。]?/g,
  /\s*판단(?:\s*주체|자)는\s*FREATIVE(?:이며|이고|입니다)[^.。]*[.。]?/g,
  /\s*FREATIVE의\s*예비\s*판정[:：]\s*/g,
  /\s*(?:선택\s*근거의\s*)?출처(?:는|:|：)\s*(?:브리프|추론|첨부|일반 관찰)[^.。]*[.。]?/g,
  /\s*컨셉\s*방향과\s*완성도는\s*사람이\s*최종\s*판정합니다[.。]?/g,
];

/** 고지 문구를 지운다 — 문장이 비면 원문을 남긴다 */
function stripBoiler(text) {
  if (typeof text !== 'string') return text;
  let t = text;
  for (const re of BOILER) t = t.replace(re, '');
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t || text;
}

// 이 칸들은 원문 그대로 둔다 — 근거 표기 · ID · URL · 이미지 프롬프트 · 사람의 말
const SKIP_KEYS = new Set(['from', 'source', 'url', 'id', 'ids', 'scope_ids', 'image_prompt', 'image', 'imageFile', 'citations', 'answer', 'human', 'quote', 'at', 'pod', 'key']);

/** 객체 전체에 수치 가드 + 고지 정리 — 바뀐 수 · 바뀐 수치 표본을 돌려준다 */
function guard(obj, sourceTexts, { numbers = true, boiler = true } = {}) {
  const idx = sourceIndex(sourceTexts);
  const stat = { numbers: 0, samples: [], boiler: 0 };
  const walk = (x, key) => {
    if (Array.isArray(x)) return x.map((v) => walk(v, key));
    if (x && typeof x === 'object') { for (const k of Object.keys(x)) if (!SKIP_KEYS.has(k)) x[k] = walk(x[k], k); return x; }
    if (typeof x !== 'string') return x;
    let t = x;
    if (boiler) { const b = stripBoiler(t); if (b !== t) stat.boiler++; t = b; }
    if (numbers) { const g = guardText(t, idx); if (g.hits.length) { stat.numbers += g.hits.length; if (stat.samples.length < 12) stat.samples.push(...g.hits.slice(0, 12 - stat.samples.length)); } t = g.text; }
    return t;
  };
  walk(obj, '');
  return stat;
}

/* ---------- 비슷한 문장 묶기 ---------- */
// 낱말 겹침(조사를 떼고) — 바꿔 쓴 같은 내용(주소 띠 규칙 ↔ 주소 코어 블록)을 잡는다. 글자 2-gram보다 판별이 낫다
const STOP = new Set(['이', '그', '저', '것', '수', '등', '및', '더', '한', '두', '세', '각', '모든', '같은', '위해', '대한', '있는', '없는', '한다', '합니다', '둔다', '둡니다', '효익', '검증', '근거', '추론', '브리프', '확인', '필요', '무엇입니까', '있습니까', '누구입니까', '어디입니까']);
const JOSA = /(으로는|으로|에서|에게|까지|부터|처럼|보다|이라|이며|이고|하고|에는|로는|은|는|이|가|을|를|에|의|로|와|과|도|만|합니다|한다|하며|해|된다|됩니다|입니다)$/;
function words(s) {
  return new Set(String(s || '').replace(/[^가-힣A-Za-z0-9 ]/g, ' ').split(/\s+/).map((w) => w.replace(JOSA, '')).filter((w) => w.length >= 2 && !STOP.has(w)));
}
function similar(a, b) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0; for (const x of A) if (B.has(x)) n++;
  return n / Math.min(A.size, B.size);
}

/** 비슷한 항목을 하나로 — 먼저 나온 것을 남긴다. key로 문자열을 꺼낼 수 있다 */
function dedupe(list, { key = (x) => x, threshold = 0.6, max = Infinity } = {}) {
  const out = [];
  for (const item of list || []) {
    const s = key(item);
    if (!s || !String(s).trim()) continue;
    if (out.some((o) => similar(key(o), s) >= threshold)) continue;
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

module.exports = { guard, guardText, stripBoiler, sourceIndex, dedupe, similar, PLACEHOLDER };
