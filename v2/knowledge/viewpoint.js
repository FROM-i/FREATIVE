// 더프롬의 관점 — 이 시스템이 판단할 때의 무게중심
// 판단은 폭넓은 평균이 아니라 더프롬의 관점에서 출발한다.
// 1) 기준별 가중치  2) 판정 사례(대표와 디렉터가 실제로 내린 판정)  3) 모든 호출에 들어가는 관점 글
import { IDENTITY } from './nodes.js';

/** 기준별 가중치 — 합 1. 설정에서 바꾼다. */
export const WEIGHTS = { 'ID-JAMAIS': 0.25, 'ID-FROM': 0.2, 'ID-BENEFIT': 0.2, 'ID-ONEU': 0.15, 'ID-INERTIA': 0.1, 'ID-YELLOW': 0.1 };

export const VERDICTS = ['채택', '보완', '기각'];

/**
 * 판정 사례 — 사람이 내린 판정과 이유. 쌓일수록 판단이 더프롬에 가까워진다.
 * 아래는 2026-11-25 대표 판정에서 옮긴 것이다. 화면에서 채택 · 기각을 누르면 사례가 추가된다.
 */
export const SEED_PRECEDENTS = [
  { id: 'PR-1', verdict: '기각', what: '노드를 1U 사각형으로 그린 브레인 화면', why: '아이덴티티를 모양으로 드러내면 화면이 지저분해진다. 형상이 먼저다.' },
  { id: 'PR-2', verdict: '기각', what: '"제도의 이름을 바꿔 말 건넨다" 같은 제목', why: '낯선 표현에 뜻을 눌러 담았다. "친근한 표현으로 습관화 유도"처럼 수단과 효과로 쓴다.' },
  { id: 'PR-3', verdict: '기각', what: '조사는 많은데 결론은 누구나 내는 안', why: '과정이 길어도 결론이 평범하면 그 과정을 거칠 이유가 없다.' },
  { id: 'PR-4', verdict: '기각', what: '사조를 "해도 되는 것 / 하면 안 되는 것"으로 나눈 해석', why: '사조는 깊이, 표현의 자율, 시대 배경을 읽어야 성립한다.' },
  { id: 'PR-5', verdict: '기각', what: '많은 사람이 무난하다고 할 기준으로 고른 안', why: '이 시스템의 판단은 더프롬의 관점에 무게중심이 있어야 한다.' },
];

const lens = (id) => IDENTITY.find((l) => l.id === id);

/** 가중치 정리 — 모르는 키는 버리고 합이 1이 되게 맞춘다 */
export function normalizeWeights(w = WEIGHTS) {
  const out = {};
  let sum = 0;
  for (const id of Object.keys(WEIGHTS)) { const v = Math.max(0, +w[id] || 0); out[id] = v; sum += v; }
  if (!sum) return { ...WEIGHTS };
  for (const id of Object.keys(out)) out[id] = +(out[id] / sum).toFixed(4);
  return out;
}

/** 모든 호출의 맨 앞에 들어가는 관점 글 */
export function viewpointBlock(precedents = SEED_PRECEDENTS, weights = WEIGHTS) {
  const w = normalizeWeights(weights);
  const order = Object.keys(w).sort((a, b) => w[b] - w[a]);
  const cases = precedents.slice(-12);
  return `## 관점 — 더프롬의 눈으로 본다
너는 중립 심사자가 아니다. 더프롬의 디렉터로서 보고 판단한다.
많은 사람이 무난하다고 할 안과 더프롬이 내보낼 안이 다르면 더프롬의 안을 고른다. 무난하다는 것은 고를 이유가 아니다.

기준과 무게 (무거운 순)
${order.map((id) => `- ${lens(id).name} (${Math.round(w[id] * 100)}%) — ${lens(id).criteria}`).join('\n')}
${cases.length ? `
판정 사례 — 더프롬에서 실제로 내린 판정이다. 같은 이유에 걸리는 안은 같은 판정을 받는다.
${cases.map((c) => `- [${c.verdict}] ${c.what} — ${c.why}`).join('\n')}` : ''}`;
}

/** 가중 합계 (1~5점 척도 → 0~100) */
export function weightedScore(scores, weights = WEIGHTS) {
  const w = normalizeWeights(weights);
  let total = 0;
  for (const id of Object.keys(w)) total += w[id] * Math.min(5, Math.max(1, +scores?.[id] || 1));
  return Math.round(((total - 1) / 4) * 100);
}
