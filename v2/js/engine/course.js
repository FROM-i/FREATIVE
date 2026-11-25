// 운영 방향 — 전략 과제의 전략 한 장. 위에서 아래로 쓴다.
//   컨셉 과제의 전략 한 장(strategy.js)은 이긴 인사이트를 재료로 올려 쓴다. 그래서 전술을 일반화한 문장이 맨 위에 선다.
//   전략 과제는 순서를 뒤집는다.
//     ① 기본 방향 — 노드 없이 낸 방향. 견주는 기준
//     ② 방향 후보 3개 — 전체 판단과 팩트에서. 후보마다 출발하는 충돌이 다르다
//     ③ 방향 판정 — 전술을 방향이라 부른 안은 진다
//     ④ 3층 전개 — 축 · 연간 단계 · 파트별 × 단계별 할 일. 이긴 인사이트는 여기에 전술로 놓인다
//   이미 있는 판단과 연결 위에서 돈다. 앞 단계를 다시 돌리지 않는다. 호출 4~6회.
import { courseBasePrompt, coursePrompt, courseJudgePrompt, layersPrompt, COURSE_CAPS, DEVICE_WORDS } from '../../knowledge/prompts-course.js';
import { validFacts } from '../../knowledge/facts.js';
import { categoriesOf, categoryById } from '../../knowledge/tags.js';
import { lensName } from '../graph/model.js';
import { weaveSpines } from './arena.js';

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const cap = (v, n) => { const s = text(v); return s.length > n + 6 ? `${s.slice(0, n + 5)}…` : s; };
const uniq = (a) => [...new Set(a)];
const arr = (v) => (Array.isArray(v) ? v : []);

export const LEVELS = [
  { id: 'concept', name: '컨셉', note: '문제를 푸는 안 하나를 낸다 — 캠페인 · 화면 · 크리에이티브' },
  { id: 'strategy', name: '전략', note: '운영 방향을 먼저 정하고 축 · 단계 · 파트별 할 일로 내린다 — 운영 · 연간 플랜' },
];
/** 과제의 층위 — 고르지 않았으면 분류로 정한다. 통합 · 운영 분류는 전략이다. */
export function levelOf(project) {
  const set = project?.settings?.level;
  if (set === 'concept' || set === 'strategy') return set;
  const cats = categoriesOf(project);
  return cats.includes('integrated') || cats.includes('ops') ? 'strategy' : 'concept';
}
const partCats = (project) => categoriesOf(project).filter((c) => c !== 'integrated');

function ctx(project, run) {
  const facts = new Set(validFacts(project).facts.map((f) => f.id));
  const sig = new Map(run.signals.filter((s) => !s.muted).map((s) => [s.id, s]));
  const ids = (list, ok) => uniq(arr(list).map((x) => text(x).replace(/^\[|\]$/g, '')).filter((x) => ok.has(x)));
  return { facts, sig, ids, fid: (l) => ids(l, facts), sid: (l) => ids(l, sig) };
}
/** 후보가 채워야 하는 근거의 넓이 — 그래프 크기에 맞춘다 */
export function courseNeed(project, run) {
  const live = run.signals.filter((s) => !s.muted);
  const lenses = uniq(live.map((s) => s.lens)).length;
  const facts = validFacts(project).facts.length;
  const usedByInsights = new Set((run.insights || []).flatMap((i) => i.check?.used || []));
  return {
    nodes: Math.max(2, Math.min(6, Math.ceil(lenses * 0.4))),
    facts: Math.min(5, facts),
    tunnel: live.some((s) => s.family === 'tunnel'),
    total: Math.min(15, Math.max(facts ? 4 : 0, Math.round(facts * 0.3))),
    fresh: Math.min(6, live.filter((s) => !usedByInsights.has(s.id)).length),
  };
}

export function shapeBase(raw) {
  const C = COURSE_CAPS;
  const b = { name: cap(raw?.name, C.name), line: cap(raw?.line, C.line), standard: cap(raw?.standard, C.standard) };
  return b.line || b.standard ? b : null;
}

/** 방향 후보를 다듬는다 — 없는 id를 걷고, 글자 수를 묶고, 근거의 넓이를 세고, 장치 이름이 들어간 문장에 표시를 단다 */
export function shapeRivals(raw, project, run, spines = []) {
  const C = COURSE_CAPS; const { sig, fid, sid } = ctx(project, run);
  const need = courseNeed(project, run);
  const rivals = arr(raw?.candidates).map((c, i) => {
    const signals = sid(c.signals); const facts = fid(c.facts);
    const lenses = uniq(signals.map((id) => sig.get(id).lens));
    const r = {
      id: `D${i + 1}`, name: cap(c.name, C.name), line: cap(c.line, C.line), standard: cap(c.standard, C.standard),
      from: cap(c.from, C.from), to: cap(c.to, C.to), keeps: cap(c.keeps, C.keeps), drops: arr(c.drops).map((d) => cap(d, C.drop)).filter(Boolean).slice(0, 2),
      answer: cap(c.answer, C.answer), signals, facts, seed: spines[i]?.edge?.id || '',
      breadth: { nodes: lenses.length, tunnel: signals.some((id) => sig.get(id).family === 'tunnel') },
      flags: [],
    };
    const hit = DEVICE_WORDS.filter((w) => `${r.name} ${r.line}`.includes(w));
    if (hit.length) r.flags.push(`장치 이름이 들어 있다: ${hit.join(', ')}`);
    if (!r.drops.length) r.flags.push('하지 않는 것을 쓰지 않았다');
    if (lenses.length < need.nodes) r.flags.push(`노드 ${lenses.length}개의 판단만 썼다`);
    if (facts.length < need.facts) r.flags.push(`팩트 ${facts.length}건만 썼다`);
    if (need.tunnel && !r.breadth.tunnel) r.flags.push('터널 판단이 없다');
    return r;
  }).filter((r) => r.name && r.line && r.standard).slice(0, 3);
  const problems = [];
  if (rivals.length < 2) problems.push(`방향 후보가 ${rivals.length}개뿐이다. 서로 다른 기준의 후보를 2개 이상 쓴다`);
  const thin = rivals.filter((r) => r.flags.some((f) => /노드|팩트|터널/.test(f)));
  if (thin.length) problems.push(`근거가 좁은 후보: ${thin.map((r) => `${r.id}(${r.flags.filter((f) => /노드|팩트|터널/.test(f)).join(', ')})`).join(' / ')}. 후보마다 노드 ${need.nodes}개 이상의 판단과 팩트 ${need.facts}개 이상을 쓴다`);
  const device = rivals.filter((r) => r.flags.some((f) => f.startsWith('장치')));
  if (device.length) problems.push(`방향 문장에 장치 이름을 쓴 후보: ${device.map((r) => r.id).join(', ')}. 장치를 지우고 운영의 기준으로 다시 쓴다`);
  return { rivals, problems };
}

/** 판정을 다듬는다 — 순서에서 기본 방향을 뺀 맨 앞이 이긴 방향이다 */
export function shapeJudge(raw, rivals) {
  const C = COURSE_CAPS; const ok = new Set(rivals.map((r) => r.id));
  const order = uniq(arr(raw?.order).map(text).filter((x) => ok.has(x) || x === 'BASE'));
  for (const r of rivals) if (!order.includes(r.id)) order.push(r.id);
  if (!order.includes('BASE')) order.push('BASE');
  const items = rivals.map((r) => { const x = arr(raw?.items).find((it) => text(it.id) === r.id) || {}; return { id: r.id, level: text(x.level) === '전술' ? '전술' : '방향', vsBase: text(x.vsBase) === '같음' ? '같음' : '다름', strong: cap(x.strong, C.note), weak: cap(x.weak, C.note) }; });
  const level = (id) => items.find((x) => x.id === id)?.level;
  // 전술로 판정받은 후보는 순서가 앞이어도 방향으로 올리지 않는다
  const winner = order.find((id) => id !== 'BASE' && level(id) === '방향') || order.find((id) => id !== 'BASE');
  return {
    order, items, winner,
    beatsBase: order.indexOf(winner) < order.indexOf('BASE'),
    why: cap(raw?.why, C.why), risk: cap(raw?.risk, C.note),
    borrow: arr(raw?.borrow).map((b) => ({ from: ok.has(text(b.from)) ? text(b.from) : '', what: cap(b.what, C.note) })).filter((b) => b.what).slice(0, 2),
  };
}

/** 3층 전개를 다듬고, 전략 한 장의 모양으로 맞춘다 */
export function shapeLayers(raw, project, run, direction, extra = {}) {
  const C = COURSE_CAPS; const { facts, sig, fid, sid } = ctx(project, run);
  const need = courseNeed(project, run);
  const ins = new Set((run.insights || []).map((i) => i.id));
  const axes = arr(raw?.axes).map((a, i) => ({ id: `A${i + 1}`, was: text(a.id), name: cap(a.name, C.axis), rule: cap(a.rule, C.rule), signals: sid(a.signals), facts: fid(a.facts) })).filter((a) => a.name && a.rule).slice(0, 4);
  const axisId = (v) => axes.find((a) => a.was === text(v) || a.id === text(v))?.id || '';
  const phases = arr(raw?.phases).map((p, i) => ({ id: `P${i + 1}`, was: text(p.id), when: cap(p.when, C.when), line: cap(p.line, C.phase), pillars: [] })).filter((p) => p.line).slice(0, 4);
  const phaseId = (v) => phases.find((p) => p.was === text(v) || p.id === text(v))?.id || '';
  const pillars = arr(raw?.parts).map((p, i) => {
    const part = text(p.part) || `a${i + 1}`;
    const cells = phases.map((ph) => { const c = arr(p.cells).find((x) => phaseId(x.phase) === ph.id); return c && text(c.move) ? { phase: ph.id, move: cap(c.move, C.move), axis: axisId(c.axis) } : null; }).filter(Boolean);
    return { part, label: categoryById(part)?.name || cap(p.label, 10), name: categoryById(part)?.name || cap(p.label, 10) || part, guide: cap(p.guide, C.guide), cells, moves: cells.map((c) => c.move), facts: fid(p.facts), signals: sid(p.signals), insights: [] };
  }).filter((p) => p.guide || p.cells.length);
  const partIds = new Set(pillars.map((p) => p.part));
  const placed = arr(raw?.insights).filter((x) => ins.has(text(x.id))).map((x) => ({ id: text(x.id), name: cap(x.name, C.axis), line: cap(x.line, C.line), part: partIds.has(text(x.part)) ? text(x.part) : '', phase: phaseId(x.phase), axis: axisId(x.axis), fit: text(x.fit) === '맞지 않음' ? '맞지 않음' : '맞음' }));
  for (const x of placed) if (x.fit === '맞음' && x.part) pillars.find((p) => p.part === x.part).insights.push(x.id);
  for (const a of axes) delete a.was; for (const p of phases) delete p.was;
  const row = (x, a) => ({ [a]: cap(x[a], C.pain), answer: cap(x.answer, C.fix), facts: fid(x.facts) });
  const st = {
    v: 2, level: 'strategy',
    direction, concept: { name: direction.name, line: direction.line }, principle: direction.standard,
    ...extra,
    axes, phases, pillars,
    fixes: arr(raw?.fixes).map((x) => row(x, 'pain')).filter((x) => x.pain && x.answer).slice(0, 4),
    boosts: arr(raw?.boosts).map((x) => row(x, 'strength')).filter((x) => x.strength && x.answer && x.facts.length).slice(0, 3),
    insights: placed,
    gaps: arr(raw?.gaps).map((g) => cap(g, 44)).filter(Boolean).slice(0, 3),
  };
  // 얼마나 넓게 썼는가 — 방향 · 축 · 파트가 기댄 것을 모두 센다
  const usedByInsights = new Set((run.insights || []).flatMap((i) => i.check?.used || []));
  const sigUsed = uniq([...direction.signals, ...axes.flatMap((a) => a.signals), ...pillars.flatMap((p) => p.signals)]);
  const factUsed = uniq([...direction.facts, ...axes.flatMap((a) => a.facts), ...pillars.flatMap((p) => p.facts), ...st.fixes.flatMap((x) => x.facts), ...st.boosts.flatMap((x) => x.facts)]);
  const lensesAll = uniq([...sig.values()].map((s) => s.lens));
  const lensesByInsights = uniq([...usedByInsights].map((id) => sig.get(id)?.lens).filter(Boolean));
  const lensesUsed = uniq(sigUsed.map((id) => sig.get(id).lens));
  st.coverage = {
    facts: { used: factUsed.length, total: facts.size, byInsights: uniq((run.insights || []).flatMap((i) => i.facts || [])).filter((f) => facts.has(f)).length },
    signals: { used: sigUsed.length, total: sig.size, fresh: sigUsed.filter((id) => !usedByInsights.has(id)).length, byInsights: usedByInsights.size },
    nodes: { used: lensesUsed.length, total: lensesAll.length, fresh: lensesUsed.filter((l) => !lensesByInsights.includes(l)).length, byInsights: lensesByInsights.length },
  };
  const problems = [];
  if (axes.length < 3) problems.push(`축이 ${axes.length}개다. 3~4개를 쓴다`);
  if (phases.length < 3) problems.push(`단계가 ${phases.length}개다. 3~4개를 쓴다`);
  const cats = partCats(project);
  if (cats.length > 1) { const miss = cats.filter((c) => !partIds.has(c)); if (miss.length) problems.push(`빠진 파트: ${miss.map((c) => categoryById(c).name).join(', ')}`); }
  else if (pillars.length < 3) problems.push('파트가 3개보다 적다');
  const holes = pillars.filter((p) => p.cells.length < phases.length);
  if (phases.length && holes.length) problems.push(`단계별 할 일이 빈 파트: ${holes.map((p) => `${p.label || p.part}(${p.cells.length}/${phases.length})`).join(', ')}`);
  const loose = pillars.reduce((n, p) => n + p.cells.filter((c) => !c.axis).length, 0);
  if (loose) problems.push(`축에 묶이지 않은 할 일 ${loose}건. 할 일마다 따르는 축을 적는다`);
  if (facts.size >= 6 && factUsed.length < need.total) problems.push(`팩트를 ${factUsed.length}건만 썼다. ${need.total}건 이상 쓴다`);
  if (st.coverage.signals.fresh < need.fresh) problems.push(`인사이트에 쓰이지 않은 판단을 ${st.coverage.signals.fresh}개만 끌어왔다. ${need.fresh}개 이상 쓴다`);
  const unplaced = (run.insights || []).filter((i) => !placed.some((x) => x.id === i.id));
  if (unplaced.length) problems.push(`배치하지 않은 인사이트: ${unplaced.map((i) => i.id).join(', ')}`);
  st.check = { ok: problems.length === 0, problems };
  return st;
}

/** 운영 방향부터 3층으로 내려 쓴다. 결과는 run.strategy(v2)에 담는다. */
export async function chart({ project, run, call, emit = () => {} }) {
  if (!run.signals?.some((s) => !s.muted)) return null;
  const need = courseNeed(project, run);
  const spines = weaveSpines(run, 3);

  emit('stage', { stage: 'courseBase' });
  const base = shapeBase(await call({ role: 'sub', ...courseBasePrompt(project), task: { kind: 'courseBase', project } }));

  emit('stage', { stage: 'course' });
  let best = null; let note = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await call({ role: 'director', ...coursePrompt(project, run, spines, base, lensName, need, note), task: { kind: 'course', project, run, spines, need, attempt } });
    const shaped = shapeRivals(raw, project, run, spines);
    if (!best || shaped.rivals.length > best.rivals.length || (shaped.rivals.length === best.rivals.length && shaped.problems.length < best.problems.length)) best = shaped;
    if (!shaped.problems.length) break;
    note = `앞서 쓴 후보는 조건을 채우지 못했다: ${shaped.problems.join(' / ')}. 글자 수 제한은 그대로다.`;
  }
  const rivals = best.rivals;
  if (!rivals.length) throw new Error('운영 방향 후보를 쓰지 못했다');

  emit('stage', { stage: 'courseJudge' });
  const judge = shapeJudge(rivals.length > 1 || base ? await call({ role: 'judge', ...courseJudgePrompt(project, rivals, base), task: { kind: 'courseJudge', project, rivals, base } }) : {}, rivals);
  const won = rivals.find((r) => r.id === judge.winner) || rivals[0];
  const direction = { id: won.id, name: won.name, line: won.line, standard: won.standard, from: won.from, to: won.to, keeps: won.keeps, drops: won.drops, answer: won.answer, signals: won.signals, facts: won.facts };

  emit('stage', { stage: 'layers' });
  let st = null; note = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await call({ role: 'director', ...layersPrompt(project, run, direction, judge, lensName, need, note), task: { kind: 'layers', project, run, direction, attempt } });
    const shaped = shapeLayers(raw, project, run, direction, { base, rivals, judge });
    shaped.attempts = attempt + 1;
    if (!st || shaped.check.problems.length < st.check.problems.length) st = shaped;
    if (shaped.check.ok) break;
    note = `앞서 쓴 전개는 조건을 채우지 못했다: ${shaped.check.problems.join(' / ')}. 모자란 것을 채워 다시 쓴다. 글자 수 제한은 그대로다.`;
  }
  // 방향 자체에 대한 경고는 전개의 문제와 따로 남긴다 — 사람이 봐야 하는 것이다
  const warn = [];
  const item = judge.items.find((x) => x.id === won.id);
  if (item?.level === '전술') warn.push('판정이 이긴 방향을 전술로 봤다 — 방향 후보가 모두 전술 수준이었다');
  if (base && !judge.beatsBase) warn.push('판정이 기본 방향을 더 낫게 봤다');
  if (item?.vsBase === '같음') warn.push('기본 방향과 운영의 기준이 같다고 판정받았다');
  if (won.flags.some((f) => f.startsWith('장치'))) warn.push(won.flags.find((f) => f.startsWith('장치')));
  st.check = { ok: st.check.ok && !warn.length, problems: [...warn, ...st.check.problems] };
  run.strategy = st;
  emit('strategy');
  return st;
}
