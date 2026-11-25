// 전략 한 장 — 인사이트를 뽑은 뒤의 단계.
//   경쟁은 안을 날카롭게 만들지만 좁힌다. 이긴 인사이트는 판단 몇 개에서 나온 장치 하나다.
//   이 단계는 전체 판단과 팩트를 다시 훑어 과제 전체를 관통하는 전략으로 올리고, 얼마나 넓게 썼는지를 숫자로 남긴다.
import { strategyPrompt, STRATEGY_CAPS } from '../../knowledge/prompts.js';
import { validFacts } from '../../knowledge/facts.js';
import { categoriesOf, categoryById } from '../../knowledge/tags.js';
import { lensName } from '../graph/model.js';

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const cap = (v, n) => { const s = text(v); return s.length > n + 6 ? `${s.slice(0, n + 5)}…` : s; };   // 조금 넘긴 것은 두고, 크게 넘긴 것만 자른다
const uniq = (a) => [...new Set(a)];

/** 모델이 낸 전략을 다듬는다 — 없는 id를 걷어 내고, 글자 수를 묶고, 얼마나 넓게 썼는지 센다 */
export function shapeStrategy(raw, project, run) {
  const C = STRATEGY_CAPS;
  const facts = new Set(validFacts(project).facts.map((f) => f.id));
  const sig = new Map(run.signals.filter((s) => !s.muted).map((s) => [s.id, s]));
  const ins = new Set((run.insights || []).map((i) => i.id));
  const cats = categoriesOf(project);
  const ids = (list, ok) => uniq((Array.isArray(list) ? list : []).map((x) => text(x).replace(/^\[|\]$/g, '')).filter((x) => ok.has(x)));
  const pillars = (Array.isArray(raw?.pillars) ? raw.pillars : []).map((p, i) => ({
    part: text(p.part) || `a${i + 1}`,
    label: categoryById(text(p.part))?.name || '',
    name: cap(p.name, C.name), guide: cap(p.guide, C.guide),
    moves: (Array.isArray(p.moves) ? p.moves : []).map((m) => cap(m, C.move)).filter(Boolean).slice(0, 3),
    facts: ids(p.facts, facts), signals: ids(p.signals, sig), insights: ids(p.insights, ins),
  })).filter((p) => p.name);
  const partIds = new Set(pillars.map((p) => p.part));
  const row = (x, a, b) => ({ [a]: cap(x[a], C.pain), [b]: cap(x[b], C.answer), facts: ids(x.facts, facts) });
  const strategy = {
    concept: { name: cap(raw?.concept?.name, C.name), line: cap(raw?.concept?.line, C.line) },
    principle: cap(raw?.principle, C.principle),
    pillars,
    phases: (Array.isArray(raw?.phases) ? raw.phases : []).map((p) => ({ when: cap(p.when, 12), line: cap(p.line, C.phase), pillars: (Array.isArray(p.pillars) ? p.pillars : []).map(text).filter((x) => partIds.has(x)) })).filter((p) => p.line).slice(0, 4),
    fixes: (Array.isArray(raw?.fixes) ? raw.fixes : []).map((x) => row(x, 'pain', 'answer')).filter((x) => x.pain && x.answer).slice(0, 4),
    boosts: (Array.isArray(raw?.boosts) ? raw.boosts : []).map((x) => row(x, 'strength', 'answer')).filter((x) => x.strength && x.answer && x.facts.length).slice(0, 3),
    insights: (Array.isArray(raw?.insights) ? raw.insights : []).filter((x) => ins.has(text(x.id))).map((x) => ({ id: text(x.id), name: cap(x.name, C.name), line: cap(x.line, C.line), part: partIds.has(text(x.part)) ? text(x.part) : '' })),
    gaps: (Array.isArray(raw?.gaps) ? raw.gaps : []).map((g) => cap(g, 44)).filter(Boolean).slice(0, 3),
  };
  // 얼마나 넓게 썼는가 — 인사이트만 봤을 때와 견준다
  const usedByInsights = new Set((run.insights || []).flatMap((i) => i.check?.used || []));
  const sigUsed = uniq(pillars.flatMap((p) => p.signals));
  const factUsed = uniq([...pillars.flatMap((p) => p.facts), ...strategy.fixes.flatMap((x) => x.facts), ...strategy.boosts.flatMap((x) => x.facts)]);
  const lensesAll = uniq([...sig.values()].map((s) => s.lens));
  const lensesByInsights = uniq([...usedByInsights].map((id) => sig.get(id)?.lens).filter(Boolean));
  const lensesUsed = uniq(sigUsed.map((id) => sig.get(id).lens));
  strategy.coverage = {
    facts: { used: factUsed.length, total: facts.size, byInsights: uniq((run.insights || []).flatMap((i) => i.facts || [])).filter((f) => facts.has(f)).length },
    signals: { used: sigUsed.length, total: sig.size, fresh: sigUsed.filter((id) => !usedByInsights.has(id)).length, byInsights: usedByInsights.size },
    nodes: { used: lensesUsed.length, total: lensesAll.length, fresh: lensesUsed.filter((l) => !lensesByInsights.includes(l)).length, byInsights: lensesByInsights.length },
  };
  const problems = [];
  if (!strategy.concept.name || !strategy.concept.line) problems.push('컨셉의 이름과 한 줄이 없다');
  if (cats.length > 1) { const miss = cats.filter((c) => !partIds.has(c)); if (miss.length) problems.push(`축이 빠진 파트: ${miss.map((c) => categoryById(c).name).join(', ')}`); }
  else if (pillars.length < 3) problems.push('축이 3개보다 적다');
  const thin = pillars.filter((p) => p.facts.length < 2 && facts.size >= 6);
  if (thin.length) problems.push(`팩트가 2개보다 적은 축: ${thin.map((p) => p.label || p.name).join(', ')}`);
  const needFacts = Math.min(15, Math.max(4, Math.round(facts.size * 0.3)));
  if (facts.size >= 6 && factUsed.length < needFacts) problems.push(`팩트를 ${factUsed.length}건만 썼다. ${needFacts}건 이상 쓴다`);
  const needFresh = Math.min(6, sig.size - usedByInsights.size);
  if (strategy.coverage.signals.fresh < needFresh) problems.push(`인사이트에 쓰이지 않은 판단을 ${strategy.coverage.signals.fresh}개만 끌어왔다. ${needFresh}개 이상 쓴다`);
  strategy.check = { ok: problems.length === 0, problems };
  return strategy;
}

/** 전략 한 장을 만든다. 조건을 못 채우면 무엇이 모자란지 알려 주고 한 번 더 쓰게 한다. */
export async function strategize({ project, run, call, emit = () => {} }) {
  if (!run.insights?.length) return null;
  emit('stage', { stage: 'strategy' });
  let best = null; let note = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await call({ role: 'director', ...strategyPrompt(project, run, lensName, note), task: { kind: 'strategy', project, run, attempt } });
    const shaped = shapeStrategy(raw, project, run);
    shaped.attempts = attempt + 1;
    if (!best || shaped.check.problems.length < best.check.problems.length) best = shaped;
    if (shaped.check.ok) break;
    note = `앞서 쓴 전략은 조건을 채우지 못했다: ${shaped.check.problems.join(' / ')}. 모자란 것을 채워 다시 쓴다. 글자 수 제한은 그대로다.`;
  }
  run.strategy = best;
  emit('strategy');
  return best;
}
