'use strict';
/**
 * 모델 세팅 프리셋 — 매뉴얼의 세팅 가이드를 다섯 단계로.
 * 프리셋을 고르면 '직접 지정'으로 바꾸고 역할 모델 · 추론 강도 · 단계 지정 · 실행 설정을 한 번에 넣는다.
 * 예상 비용은 실제 실행 한 건의 토큰 사용량에 각 단계의 단가를 넣은 추정이다(컨셉 게이트까지 / Creative 포함).
 */
const settings = require('./settings');

const ASTRA = 'gpt-6-astra', SOL = 'gpt-6.1-sol', LUNA = 'gpt-6-luna';

const PRESETS = [
  {
    id: 1, name: '검토', label: '완전 빠르게 · 추론 없이 검토만', cost: '최소',
    est: { gate: '$1~2', full: '$2~3', time: '10~20분' },
    desc: '방향 확인 · 기존 안 검토 · 앱 연습. 조수와 판단 브레인은 추론 없이 정리만 하고, 화가만 얕게 추론합니다. 웹 정찰 · 이미지 · 교열 · 재작업 없음.',
    models: { director: SOL, brain: LUNA, sub: LUNA, editor: LUNA, image: 'gpt-image-2' },
    efforts: { director: 'low', brain: 'none', sub: 'none', editor: 'none' },
    stages: {},
    autoModel: false,
    run: { brain: 'core', brainRetry: 0, midReview: 'auto', maxRounds: 2, webSearch: false, generateImages: false, imageQuality: 'low', polish: false, budgetUsd: 3 },
  },
  {
    id: 2, name: '가벼운 분석', label: '추론 일부 · 분석 일부', cost: '낮음',
    est: { gate: '$2~3', full: '$3~5', time: '15~25분' },
    desc: '팀 리뷰용 초안. 화가가 중간 강도로 추론하고 판단 브레인이 가볍게 검증합니다. 웹 정찰 · 이미지 자동 생성은 끄고, 필요한 장면만 그립니다.',
    models: { director: SOL, brain: SOL, sub: LUNA, editor: LUNA, image: 'gpt-image-2' },
    efforts: { director: 'medium', brain: 'low', sub: 'low', editor: 'low' },
    stages: {},
    autoModel: false,
    run: { brain: 'core', brainRetry: 0, midReview: 'auto', maxRounds: 2, webSearch: false, generateImages: false, imageQuality: 'low', polish: true, budgetUsd: 5 },
  },
  {
    id: 3, name: '표준', label: '추론 · 분석 · 검증 일반', cost: '중간', recommended: true,
    est: { gate: '$4~5', full: '$7~10', time: '30~50분' },
    desc: '대부분의 실무 과제. 화가는 Sol로 깊게, 방향을 정하는 두 판정(FoR·PoP·PoD · Concept)만 Astra가 검증합니다. 회차마다 사람이 답합니다.',
    models: { director: SOL, brain: SOL, sub: SOL, editor: SOL, image: 'gpt-image-2.5-flare' },
    efforts: { director: 'high', brain: 'medium', sub: 'low', editor: 'low' },
    stages: { forpop: { brain: { model: ASTRA, effort: 'high', why: '프리셋 3 — 방향을 정하는 판정' } }, concept: { brain: { model: ASTRA, effort: 'high', why: '프리셋 3 — 방향을 정하는 판정' } } },
    autoModel: false,
    run: { brain: 'standard', brainRetry: 1, midReview: 'wait', maxRounds: 3, webSearch: true, generateImages: true, imageQuality: 'medium', polish: true, budgetUsd: 10 },
  },
  {
    id: 4, name: '강화', label: '추론 강화 · 분석 보강', cost: '높음',
    est: { gate: '$7~9', full: '$12~16', time: '45~70분' },
    desc: '수주가 걸린 제안. 화가를 Astra로 올리고(중간 강도), 조수의 분석과 Creative 설계 절을 깊게 합니다.',
    models: { director: ASTRA, brain: SOL, sub: SOL, editor: SOL, image: 'gpt-image-2.5-sunburst' },
    efforts: { director: 'medium', brain: 'high', sub: 'medium', editor: 'medium' },
    stages: { forpop: { brain: { model: ASTRA, effort: 'high', why: '프리셋 4 — 방향을 정하는 판정' } }, concept: { brain: { model: ASTRA, effort: 'high', why: '프리셋 4 — 방향을 정하는 판정' } }, creative: { sub: { model: SOL, effort: 'high', why: '프리셋 4 — 설계 절을 깊게' } } },
    autoModel: false,
    run: { brain: 'standard', brainRetry: 1, midReview: 'wait', maxRounds: 3, webSearch: true, generateImages: true, imageQuality: 'medium', polish: true, budgetUsd: 16 },
  },
  {
    id: 5, name: '최고', label: '최고 수준', cost: '최대',
    est: { gate: '$12~16', full: '$20~26', time: '70~100분' },
    desc: '처음 보는 분야 · 컨셉을 처음부터 세우는 과제. 화가와 판단 브레인 모두 Astra 최고 강도, 화가가 단계마다 모델을 고릅니다.',
    models: { director: ASTRA, brain: ASTRA, sub: SOL, editor: SOL, image: 'gpt-image-2.5-sunburst' },
    efforts: { director: 'high', brain: 'high', sub: 'medium', editor: 'medium' },
    stages: { creative: { sub: { model: SOL, effort: 'high', why: '프리셋 5 — 설계 절을 깊게' } } },
    autoModel: true,
    run: { brain: 'standard', brainRetry: 2, midReview: 'wait', maxRounds: 4, webSearch: true, generateImages: true, imageQuality: 'high', polish: true, budgetUsd: 26 },
  },
];

/** 프리셋 적용 — 직접 지정으로 바꾸고 역할·강도·단계 지정·실행 설정을 한 번에 */
function apply(id) {
  const p = PRESETS.find((x) => x.id === Number(id));
  if (!p) throw new Error('알 수 없는 프리셋');
  const cur = settings.get();
  settings.set({
    preset: p.id,
    openai: { followRecommended: false, models: { ...p.models }, roleEfforts: { ...p.efforts }, stages: JSON.parse(JSON.stringify(p.stages)), autoModel: p.autoModel },
    run: { ...cur.run, ...p.run },
  });
  return { ok: true, preset: summary(p) };
}

/** 지금 설정이 어느 프리셋과 같은가 — 프리셋을 고른 뒤 손으로 바꿨으면 null */
function current() {
  const s = settings.get();
  if (s.openai.followRecommended !== false) return null;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const p of PRESETS) {
    const m = s.openai.models || {}, e = s.openai.roleEfforts || {};
    if (!['director', 'brain', 'sub', 'editor', 'image'].every((k) => m[k] === p.models[k])) continue;
    if (!['director', 'brain', 'sub', 'editor'].every((k) => (e[k] || '') === (p.efforts[k] || ''))) continue;
    if (!same(stripWhy(s.openai.stages || {}), stripWhy(p.stages))) continue;
    if (!!s.openai.autoModel !== p.autoModel) continue;
    if (!Object.entries(p.run).every(([k, v]) => k === 'budgetUsd' || s.run[k] === v)) continue;
    return p.id;
  }
  return null;
}
function stripWhy(st) { const o = {}; for (const [k, v] of Object.entries(st || {})) for (const [r, x] of Object.entries(v || {})) if (x) (o[k] = o[k] || {})[r] = { model: x.model, effort: x.effort || '' }; return o; }

function summary(p) { return { id: p.id, name: p.name, label: p.label, cost: p.cost, est: p.est, desc: p.desc, recommended: !!p.recommended, models: p.models, efforts: p.efforts, stages: stripWhy(p.stages), autoModel: p.autoModel, run: p.run }; }
function list() { return { presets: PRESETS.map(summary), current: current() }; }

module.exports = { PRESETS, apply, current, list };
