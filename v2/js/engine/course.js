// 운영 방향 — 전략 과제의 전략 한 장. 위에서 아래로 쓴다.
//   컨셉 과제의 전략 한 장(strategy.js)은 이긴 인사이트를 재료로 올려 쓴다. 그래서 전술을 일반화한 문장이 맨 위에 선다.
//   전략 과제는 순서를 뒤집고, 층을 업무 영역으로 가른다.
//     ⓪ 업무 영역 — 과제가 맡는 일의 범위. 미션에 없으면 미션에서 뽑는다
//     ① 방향 높이의 노드 판단 — 모든 노드가 "영역 전부를 어떻게 하나로 운영하는가"와 영역마다의 방침을 따로 본다
//     ② 연결 — 통합 판단끼리 이어 충돌을 찾는다
//     ③ 기본 방향 — 노드 없이 낸 방향. 견주는 기준
//     ④ 방향 후보 3개 — 충돌을 푸는 자리에서 쓴다. 아이덴티티 판단이 뼈대다
//     ⑤ 방향 판정 — 영역 시험 · 고유 시험 · 약속 시험. 통과가 기본값이 아니다
//     ⑥ 아래로 내린다 — 영역별 전략(영역 높이의 판단에서) → 전술 여러 개(이슈 높이의 판단과 인사이트에서)
//   이슈 높이의 분석은 다시 돌리지 않는다. 처음에는 노드 수 + 6회 안팎, 노드 판단이 있으면 4~6회.
import { courseScopePrompt, courseBasePrompt, courseLensPrompt, courseLinkPrompt, coursePrompt, courseJudgePrompt, layersPrompt, COURSE_CAPS, DEVICE_WORDS } from '../../knowledge/prompts-course.js';
import { validFacts } from '../../knowledge/facts.js';
import { categoriesOf, categoryById } from '../../knowledge/tags.js';
import { lensName, activeLenses, signalPrefix } from '../graph/model.js';

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const cap = (v, n) => { const s = text(v); return s.length > n + 6 ? `${s.slice(0, n + 5)}…` : s; };
const uniq = (a) => [...new Set(a)];
const arr = (v) => (Array.isArray(v) ? v : []);

export const LEVELS = [
  { id: 'concept', name: '컨셉', note: '문제를 푸는 안 하나를 낸다 — 캠페인 · 화면 · 크리에이티브' },
  { id: 'strategy', name: '전략', note: '노드가 방향 높이에서 한 번 더 판단하고, 그 충돌을 푸는 통합 운영 방향을 정한 뒤 영역별 전략과 전술로 내린다 — 운영 · 연간 플랜' },
];
/** 과제의 층위 — 고르지 않았으면 분류로 정한다. 통합 · 운영 분류는 전략이다. */
export function levelOf(project) {
  const set = project?.settings?.level;
  if (set === 'concept' || set === 'strategy') return set;
  const cats = categoriesOf(project);
  return cats.includes('integrated') || cats.includes('ops') ? 'strategy' : 'concept';
}
const partCats = (project) => categoriesOf(project).filter((c) => c !== 'integrated');

/** 업무 영역 — 사람이 미션에 적은 것. 이름이 있는 줄만 받고 id를 S1, S2…로 맞춘다. 2개보다 적으면 없는 것으로 본다. */
export function areasOf(project) {
  const list = arr(project?.areas).map((a) => ({ name: cap(a?.name, COURSE_CAPS.area + 6), note: cap(a?.note, COURSE_CAPS.areaNote + 10) })).filter((a) => a.name).slice(0, 5);
  return list.length >= 2 ? list.map((a, i) => ({ id: `S${i + 1}`, ...a })) : null;
}
export function shapeAreas(raw) {
  const C = COURSE_CAPS;
  return arr(raw?.areas).map((a) => ({ name: cap(a?.name, C.area), note: cap(a?.note, C.areaNote) })).filter((a) => a.name).slice(0, 4).map((a, i) => ({ id: `S${i + 1}`, ...a }));
}

/** 모델이 영역을 id 대신 이름으로 적어도 받는다 */
const areaId = (v, areas) => { const t = text(v); return (areas.find((a) => a.id === t.toUpperCase()) || areas.find((a) => a.name === t) || areas.find((a) => t && t.includes(a.name)))?.id || ''; };

function ctx(project, run) {
  const facts = new Set(validFacts(project).facts.map((f) => f.id));
  const base = new Map(run.signals.filter((s) => !s.muted).map((s) => [s.id, s]));   // 이슈 높이의 판단
  const sig = new Map([...base, ...(run.course?.signals || []).map((s) => [s.id, s])]);   // + 방향 높이의 판단
  const ids = (list, ok) => uniq(arr(list).map((x) => text(x).replace(/^\[|\]$/g, '')).filter((x) => ok.has(x)));
  return { facts, sig, base, ids, fid: (l) => ids(l, facts), sid: (l) => ids(l, sig) };
}
/** 채워야 하는 근거의 넓이 — 방향 높이에서 판단을 낸 노드 수에 맞춘다 */
export function courseNeed(project, run) {
  const live = run.signals.filter((s) => !s.muted);
  const high = (run.course?.signals || []).filter((s) => s.scope === 'ALL');
  const lenses = uniq(high.map((s) => s.lens)).length;
  const facts = validFacts(project).facts.length;
  const usedByInsights = new Set((run.insights || []).flatMap((i) => i.check?.used || []));
  return {
    nodes: Math.max(2, Math.min(5, Math.ceil(lenses * 0.4))),
    identity: Math.min(2, uniq(high.filter((s) => s.family === 'identity').map((s) => s.lens)).length),
    tunnel: high.some((s) => s.family === 'tunnel'),
    facts: Math.min(5, facts),
    total: Math.min(15, Math.max(facts ? 4 : 0, Math.round(facts * 0.3))),
    fresh: Math.min(4, live.filter((s) => !usedByInsights.has(s.id)).length),
    tactics: 4,
  };
}

async function pool(items, limit, worker) {
  let next = 0;
  const run = async () => { while (next < items.length) { const i = next++; await worker(items[i], i); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, run));
}
const STANCES = ['keep', 'change', 'limit', 'open'];
/** 노드 하나가 방향 높이에서 낸 판단을 다듬는다 — 통합 1개, 영역마다 1개까지 */
export function shapeHigh(raw, lens, project, areas) {
  const C = COURSE_CAPS; const facts = new Set(validFacts(project).facts.map((f) => f.id));
  const scopes = new Set(['ALL', ...areas.map((a) => a.id)]); const seen = new Set(); const out = [];
  for (const x of arr(raw?.signals)) {
    const scope = /^(all|통합|전체)$/i.test(text(x.scope)) ? 'ALL' : areaId(x.scope, areas); const claim = cap(x.claim, C.claim);
    if (!scopes.has(scope) || seen.has(scope) || !claim) continue;
    seen.add(scope);
    out.push({ id: `C-${signalPrefix(lens.id)}-${scope}`, lens: lens.id, family: lens.family, scope, claim, basis: cap(x.basis, 90), stance: STANCES.includes(text(x.stance)) ? text(x.stance) : 'change', facts: uniq(arr(x.facts).map((f) => text(f).replace(/^\[|\]$/g, '')).filter((f) => facts.has(f))), against: scope === 'ALL' ? cap(raw?.against, 90) : '' });
  }
  return out;
}
export function shapeHighEdges(raw, signals) {
  const all = new Map(signals.filter((s) => s.scope === 'ALL').map((s) => [s.id, s])); const seen = new Set(); const out = [];
  for (const e of arr(raw?.edges)) {
    const from = text(e.from).replace(/^\[|\]$/g, ''); const to = text(e.to).replace(/^\[|\]$/g, ''); const key = [from, to].sort().join('|');
    if (!all.has(from) || !all.has(to) || all.get(from).lens === all.get(to).lens || seen.has(key) || !text(e.why)) continue;
    seen.add(key);
    out.push({ id: `CE${out.length + 1}`, from, to, type: text(e.type) === 'tension' ? 'tension' : 'reinforce', why: cap(e.why, 46) });
  }
  return out;
}
/** 후보가 출발할 충돌 — 아이덴티티 판단이 낀 충돌을 먼저, 같은 노드가 되풀이되지 않게 고른다 */
export function courseSpines(course, count = 3) {
  const sig = new Map((course?.signals || []).map((s) => [s.id, s]));
  const rest = (course?.edges || []).filter((e) => e.type === 'tension').map((e, i) => ({ edge: e, a: sig.get(e.from), b: sig.get(e.to), i })).filter((x) => x.a && x.b);
  const idn = (x) => (x.a.family === 'identity' ? 1 : 0) + (x.b.family === 'identity' ? 1 : 0);
  const out = []; const seen = new Map();
  while (out.length < count && rest.length) {
    const pen = (x) => (seen.get(x.a.lens) || 0) + (seen.get(x.b.lens) || 0);
    rest.sort((x, y) => (idn(y) * 2 - pen(y)) - (idn(x) * 2 - pen(x)) || x.i - y.i);   // 아이덴티티가 낀 충돌이 되풀이보다 먼저다
    const x = rest.shift(); out.push({ edge: x.edge, a: x.a, b: x.b });
    for (const l of [x.a.lens, x.b.lens]) seen.set(l, (seen.get(l) || 0) + 1);
  }
  return out;
}
const areasKey = (areas) => areas.map((a) => a.name).join('|');

/** ① ② 방향 높이에서 뉴럴링크를 한 번 더 돈다 — 노드마다 통합 판단과 영역 판단, 그리고 통합 판단끼리의 연결 */
export async function survey({ project, run, call, emit = () => {}, areas }) {
  emit('stage', { stage: 'courseLens' });
  const lenses = activeLenses(project, run.picks || []);
  const signals = []; const failed = [];
  await pool(lenses, project.settings?.concurrency || 4, async (lens) => {
    try {
      const own = run.signals.filter((s) => s.lens === lens.id && !s.muted);
      const raw = await call({ role: 'sub', ...courseLensPrompt(project, lens, areas, own), task: { kind: 'courseLens', project, lens, areas } });
      const got = shapeHigh(raw, lens, project, areas);
      if (!got.some((x) => x.scope === 'ALL')) failed.push({ lens: lens.id, error: '통합 판단을 내지 않았다' });
      signals.push(...got);
    } catch (e) { if (/취소/.test(e.message)) throw e; failed.push({ lens: lens.id, error: e.message }); }
  });
  const order = new Map(lenses.map((l, i) => [l.id, i]));
  signals.sort((a, b) => order.get(a.lens) - order.get(b.lens) || (a.scope === 'ALL' ? -1 : b.scope === 'ALL' ? 1 : a.scope.localeCompare(b.scope)));
  const all = signals.filter((s) => s.scope === 'ALL');
  if (all.length < 3) throw new Error(`방향 높이에서 통합 판단을 낸 노드가 ${all.length}개뿐이다${failed[0] ? ` — ${failed[0].error}` : ''}`);
  emit('stage', { stage: 'courseLink' });
  const edges = shapeHighEdges(await call({ role: 'sub', ...courseLinkPrompt(project, all, lensName), task: { kind: 'courseLink', project, signals: all } }), signals);
  run.course = { key: areasKey(areas), at: new Date().toISOString(), signals, edges, failed };
  return run.course;
}

export function shapeBase(raw) {
  const C = COURSE_CAPS;
  const b = { name: cap(raw?.name, C.name), line: cap(raw?.line, C.line), standard: cap(raw?.standard, C.standard) };
  return b.line || b.standard ? b : null;
}

/** 방향 후보를 다듬는다 — 없는 id를 걷고, 글자 수를 묶고, 영역마다 달라지는 것을 썼는지와 어느 노드가 기준을 만들었는지 본다 */
export function shapeRivals(raw, project, run, areas, spines = []) {
  const C = COURSE_CAPS; const { sig, fid, sid } = ctx(project, run);
  const need = courseNeed(project, run);
  const rivals = arr(raw?.candidates).map((c, i) => {
    const signals = sid(c.signals); const facts = fid(c.facts);
    const fams = (f) => uniq(signals.filter((id) => sig.get(id).family === f).map((id) => sig.get(id).lens));
    const lenses = uniq([...fams('identity'), ...fams('airplane'), ...fams('tunnel')]);
    const covers = areas.map((a) => ({ area: a.id, line: cap(arr(c.covers).find((x) => areaId(x.area, areas) === a.id)?.line, C.cover) })).filter((x) => x.line);
    const sp = spines[i];
    const r = {
      id: `D${i + 1}`, name: cap(c.name, C.name), line: cap(c.line, C.line), standard: cap(c.standard, C.standard), covers,
      how: cap(c.how, C.swap), swap: cap(c.swap, C.swap),
      from: cap(c.from, C.from), to: cap(c.to, C.to), keeps: cap(c.keeps, C.keeps), drops: arr(c.drops).map((d) => cap(d, C.drop)).filter(Boolean).slice(0, 2),
      answer: cap(c.answer, C.answer), signals, facts, lenses,
      spine: sp ? { edge: sp.edge.id, a: sp.a.lens, b: sp.b.lens, why: sp.edge.why } : null,
      breadth: { nodes: lenses.length, identity: fams('identity').length, tunnel: fams('tunnel').length > 0 },
      flags: [],
    };
    const miss = areas.filter((a) => !covers.some((x) => x.area === a.id));
    if (miss.length) r.flags.push(`달라지는 것을 쓰지 않은 영역: ${miss.map((a) => a.name).join(', ')}`);
    const hit = DEVICE_WORDS.filter((w) => `${r.name} ${r.line}`.includes(w));
    if (hit.length) r.flags.push(`장치 이름이 들어 있다: ${hit.join(', ')}`);
    if (r.breadth.identity < need.identity) r.flags.push(`아이덴티티 판단을 ${r.breadth.identity}개 노드에서만 받았다`);
    if (!r.swap) r.flags.push('경쟁사가 그대로 쓸 수 없는 이유를 쓰지 않았다');
    if (!r.drops.length) r.flags.push('하지 않는 것을 쓰지 않았다');
    if (lenses.length < need.nodes) r.flags.push(`노드 ${lenses.length}개의 판단만 썼다`);
    if (need.tunnel && !r.breadth.tunnel) r.flags.push('터널 판단이 없다 — 이 클라이언트에 맞는지를 받치지 않았다');
    if (facts.length < need.facts) r.flags.push(`팩트 ${facts.length}건만 썼다`);
    return r;
  }).filter((r) => r.name && r.line && r.standard).slice(0, 3);
  const problems = [];
  if (rivals.length < 2) problems.push(`방향 후보가 ${rivals.length}개뿐이다. 서로 다른 기준의 후보를 2개 이상 쓴다`);
  const pick = (re) => rivals.filter((r) => r.flags.some((f) => re.test(f)));
  const list = (rs, re) => rs.map((r) => `${r.id}(${r.flags.filter((f) => re.test(f)).join(', ')})`).join(' / ');
  const gap = pick(/^달라지는 것/);
  if (gap.length) problems.push(`영역 전부에 걸리지 않은 후보: ${list(gap, /^달라지는 것/)}. 영역마다 달라지는 것을 한 줄씩 쓴다. 쓸 수 없으면 방향이 아니다`);
  const idn = pick(/^아이덴티티|^경쟁사가/);
  if (idn.length) problems.push(`더프롬의 기준에서 나오지 않은 후보: ${list(idn, /^아이덴티티|^경쟁사가/)}. 아이덴티티 판단 ${need.identity}개 이상을 뼈대로 삼고 바꿔치기 시험을 쓴다`);
  const thin = pick(/^노드|^팩트|^터널/);
  if (thin.length) problems.push(`근거가 좁은 후보: ${list(thin, /^노드|^팩트|^터널/)}. 후보마다 노드 ${need.nodes}개 이상의 판단과 팩트 ${need.facts}개 이상을 쓴다`);
  const device = pick(/^장치/);
  if (device.length) problems.push(`방향 문장에 장치 이름을 쓴 후보: ${device.map((r) => r.id).join(', ')}. 장치를 지우고 운영의 기준으로 다시 쓴다`);
  return { rivals, problems };
}

const LEVELS_OF = ['방향', '영역 전략', '전술'];
/** 판정을 다듬는다 — 방향이고, 고유하고, 약속할 수 있는 후보가 먼저다. 기본 방향은 순서에만 남는다 */
export function shapeJudge(raw, rivals, areas = []) {
  const C = COURSE_CAPS; const ok = new Set(rivals.map((r) => r.id)); const aid = new Set(areas.map((a) => a.id));
  const order = uniq(arr(raw?.order).map(text).filter((x) => ok.has(x) || x === 'BASE'));
  for (const r of rivals) if (!order.includes(r.id)) order.push(r.id);
  if (!order.includes('BASE')) order.push('BASE');
  const items = rivals.map((r) => {
    const x = arr(raw?.items).find((it) => text(it.id) === r.id) || {};
    // 영역 시험 — 그 영역에서 가르는 실제 결정을 쓴 영역만 걸린 것으로 센다
    const told = arr(x.reaches).length > 0;
    const reaches = []; for (const v of arr(x.reaches)) { const area = areaId(typeof v === 'string' ? v : v?.area, areas); const kase = typeof v === 'string' ? '' : cap(v?.case, C.casee); if (aid.has(area) && !reaches.some((q) => q.area === area) && (typeof v === 'string' || kase)) reaches.push({ area, case: kase }); }
    let level = LEVELS_OF.includes(text(x.level)) ? text(x.level) : '방향';
    if (level === '방향' && areas.length > 1 && told && reaches.length <= 1) level = '영역 전략';
    return { id: r.id, level, reaches, own: text(x.own) === '범용' ? '범용' : '고유', control: /불가/.test(text(x.control)) ? '일부 불가' : '가능', vsBase: text(x.vsBase) === '같음' ? '같음' : '다름', strong: cap(x.strong, C.note), weak: cap(x.weak, C.note) };
  });
  const it = (id) => items.find((x) => x.id === id);
  const cands = order.filter((id) => id !== 'BASE');
  const winner = cands.find((id) => it(id).level === '방향' && it(id).own === '고유' && it(id).control === '가능')
    || cands.find((id) => it(id).level === '방향' && it(id).own === '고유') || cands.find((id) => it(id).level === '방향') || cands[0];
  return {
    order, items, winner,
    beatsBase: order.indexOf(winner) < order.indexOf('BASE'),
    why: cap(raw?.why, C.why), risk: cap(raw?.risk, C.note),
    borrow: arr(raw?.borrow).map((b) => ({ from: ok.has(text(b.from)) ? text(b.from) : '', what: cap(b.what, C.note) })).filter((b) => b.what).slice(0, 2),
  };
}

/** 아래 두 층을 다듬고, 전략 한 장의 모양으로 맞춘다. 줄(pillars)은 업무 영역이다. */
export function shapeLayers(raw, project, run, direction, areas, extra = {}) {
  const C = COURSE_CAPS; const { facts, sig, base, fid, sid } = ctx(project, run);
  const need = courseNeed(project, run);
  const ins = new Set((run.insights || []).map((i) => i.id));
  const cats = partCats(project); const catOk = new Set(cats);
  const phases = arr(raw?.phases).map((p, i) => ({ id: `P${i + 1}`, was: text(p.id), when: cap(p.when, C.when), line: cap(p.line, C.phase), pillars: [] })).filter((p) => p.line).slice(0, 4);
  const phaseId = (v) => phases.find((p) => p.was === text(v) || p.id === text(v))?.id || '';
  const placedAt = new Map();
  const pillars = areas.map((a) => {
    const x = arr(raw?.areas).find((r) => areaId(r.area, areas) === a.id) || {};
    const tactics = arr(x.tactics).map((t) => ({ phase: phaseId(t.phase), move: cap(t.move, C.move), parts: uniq(arr(t.parts).map(text).filter((c) => catOk.has(c))), insight: ins.has(text(t.insight)) ? text(t.insight) : '' })).filter((t) => t.move && t.phase).slice(0, 10);
    for (const t of tactics) { if (!t.insight) continue; if (placedAt.has(t.insight)) t.insight = ''; else placedAt.set(t.insight, { area: a.id, phase: t.phase }); }   // 인사이트 하나는 한 자리에만 놓인다
    const signals = sid(x.signals);
    return { part: a.id, label: a.name, note: a.note, name: cap(x.name, C.name), guide: cap(x.line, C.line), tactics, moves: tactics.map((t) => t.move), facts: fid(x.facts), signals, insights: tactics.map((t) => t.insight).filter(Boolean), thin: signals.length < 2 };
  });
  for (const p of phases) delete p.was;
  const placed = (run.insights || []).map((i) => { const x = arr(raw?.insights).find((r) => text(r.id) === i.id) || {}; const at = placedAt.get(i.id); return { id: i.id, name: cap(x.name, C.axis), line: cap(x.line, C.line), part: at?.area || '', phase: at?.phase || '', fit: at ? '맞음' : '맞지 않음', said: text(x.fit) }; });
  const row = (x, a) => ({ [a]: cap(x[a], C.pain), answer: cap(x.answer, C.fix), facts: fid(x.facts) });
  const st = {
    v: 3, level: 'strategy', areas,
    direction, concept: { name: direction.name, line: direction.line }, principle: direction.standard,
    ...extra,
    axes: [], phases, pillars,
    fixes: arr(raw?.fixes).map((x) => row(x, 'pain')).filter((x) => x.pain && x.answer).slice(0, 4),
    boosts: arr(raw?.boosts).map((x) => row(x, 'strength')).filter((x) => x.strength && x.answer && x.facts.length).slice(0, 3),
    insights: placed,
    gaps: arr(raw?.gaps).map((g) => cap(g, 44)).filter(Boolean).slice(0, 3),
  };
  // 얼마나 넓게 썼는가 — 방향과 영역 전략이 기댄 것을 모두 센다. 이슈 높이의 판단과 방향 높이의 판단을 따로 센다
  const usedByInsights = new Set((run.insights || []).flatMap((i) => i.check?.used || []));
  const cited = uniq([...direction.signals, ...pillars.flatMap((p) => p.signals)]).filter((id) => sig.has(id));
  const sigUsed = cited.filter((id) => base.has(id));
  const high = run.course?.signals || [];
  const factUsed = uniq([...direction.facts, ...pillars.flatMap((p) => p.facts), ...st.fixes.flatMap((x) => x.facts), ...st.boosts.flatMap((x) => x.facts)]);
  const lensesAll = uniq([...sig.values()].map((s) => s.lens));
  const lensesByInsights = uniq([...usedByInsights].map((id) => base.get(id)?.lens).filter(Boolean));
  const lensesUsed = uniq(cited.map((id) => sig.get(id).lens));
  st.coverage = {
    facts: { used: factUsed.length, total: facts.size, byInsights: uniq((run.insights || []).flatMap((i) => i.facts || [])).filter((f) => facts.has(f)).length },
    signals: { used: sigUsed.length, total: base.size, fresh: sigUsed.filter((id) => !usedByInsights.has(id)).length, byInsights: usedByInsights.size },
    nodes: { used: lensesUsed.length, total: lensesAll.length, fresh: lensesUsed.filter((l) => !lensesByInsights.includes(l)).length, byInsights: lensesByInsights.length },
    high: { used: cited.filter((id) => !base.has(id)).length, total: high.length, tensions: (run.course?.edges || []).filter((e) => e.type === 'tension').length },
  };
  const problems = [];
  if (phases.length < 3) problems.push(`단계가 ${phases.length}개다. 3~4개를 쓴다`);
  const bare = pillars.filter((p) => !p.name || !p.guide);
  if (bare.length) problems.push(`전략이 없는 영역: ${bare.map((p) => p.label).join(', ')}`);
  const few = pillars.filter((p) => p.tactics.length < need.tactics);
  if (few.length) problems.push(`전술이 ${need.tactics}개보다 적은 영역: ${few.map((p) => `${p.label}(${p.tactics.length}개)`).join(', ')}. 영역 전략 아래에 서로 다른 전술을 여러 개 쓴다`);
  const holes = pillars.map((p) => ({ p, miss: phases.filter((ph) => !p.tactics.some((t) => t.phase === ph.id)) })).filter((x) => x.miss.length);
  if (phases.length && holes.length) problems.push(`전술이 빈 단계: ${holes.map((x) => `${x.p.label}(${x.miss.map((ph) => ph.when).join(', ')})`).join(' / ')}`);
  if (cats.length > 1) { const seen = new Set(pillars.flatMap((p) => p.tactics.flatMap((t) => t.parts))); const miss = cats.filter((c) => !seen.has(c)); if (miss.length) problems.push(`전술을 맡지 않은 파트: ${miss.map((c) => categoryById(c).name).join(', ')}`); }
  const clone = pillars.filter((p) => p.guide && direction.line && p.guide.replace(/\s/g, '') === direction.line.replace(/\s/g, ''));
  if (clone.length) problems.push(`방향 문장을 그대로 옮긴 영역 전략: ${clone.map((p) => p.label).join(', ')}`);
  const weak = pillars.filter((p) => p.thin && (run.course?.signals || []).some((x) => x.scope === p.part));
  if (weak.length) problems.push(`근거 판단이 2개보다 적은 영역: ${weak.map((p) => p.label).join(', ')}. 영역별 판단에서 출발한다`);
  const poor = pillars.filter((p) => p.facts.length < 2 && facts.size >= 6);
  if (poor.length) problems.push(`팩트가 2개보다 적은 영역: ${poor.map((p) => p.label).join(', ')}`);
  if (facts.size >= 6 && factUsed.length < need.total) problems.push(`팩트를 ${factUsed.length}건만 썼다. ${need.total}건 이상 쓴다`);
  if (st.coverage.signals.fresh < need.fresh) problems.push(`인사이트에 쓰이지 않은 판단을 ${st.coverage.signals.fresh}개만 끌어왔다. ${need.fresh}개 이상 쓴다`);
  const lost = placed.filter((x) => x.fit === '맞지 않음' && x.said !== '맞지 않음');
  if (lost.length) problems.push(`전술로 놓지 않은 인사이트: ${lost.map((x) => x.id).join(', ')}. 맞는 영역의 전술로 놓거나 "맞지 않음"으로 적는다`);
  for (const x of placed) delete x.said;
  st.check = { ok: problems.length === 0, problems };
  return st;
}

/** 한 칸에 놓이는 것 — 영역(줄) × 단계(칸). 예전 모양(v2: 파트 × 단계, 칸마다 할 일 하나)도 같은 꼴로 돌려준다 */
export function cellItems(st, p, ph) {
  if (st.v >= 3) return p.tactics.filter((t) => t.phase === ph.id).map((t) => ({ move: t.move, parts: t.parts, insight: t.insight }));
  const c = (p.cells || []).find((x) => x.phase === ph.id);
  return [...(c ? [{ move: c.move, axis: c.axis, parts: [], insight: '' }] : []), ...st.insights.filter((x) => x.fit === '맞음' && x.part === p.part && x.phase === ph.id).map((x) => ({ move: x.name || x.id, parts: [], insight: x.id }))];
}

/** 통합 운영 방향부터 아래로 내려 쓴다. 결과는 run.strategy(v4)에 담는다.
 *  fresh: 방향 높이의 노드 판단이 이미 있어도 다시 받는다. 없으면 영역이 같을 때 있는 것을 쓴다. */
export async function chart({ project, run, call, emit = () => {}, fresh = false }) {
  if (!run.signals?.some((s) => !s.muted)) return null;

  // ⓪ 업무 영역 — 사람이 적었으면 그대로, 없으면 미션에서 뽑는다
  let areas = areasOf(project); let auto = false;
  if (!areas && !fresh && run.strategy?.areasAuto && run.strategy.areas?.length >= 2) { areas = run.strategy.areas; auto = true; }
  if (!areas) {
    emit('stage', { stage: 'courseScope' });
    areas = shapeAreas(await call({ role: 'sub', ...courseScopePrompt(project), task: { kind: 'courseScope', project } }));
    auto = true;
    if (areas.length < 2) throw new Error('업무 영역을 2개 이상 뽑지 못했다. 미션 탭의 "업무 영역"에 직접 적는다');
  }

  // ① ② 방향 높이의 노드 판단과 연결 — 영역이 그대로면 있는 것을 쓴다
  const reused = !fresh && run.course?.key === areasKey(areas) && run.course.signals?.some((x) => x.scope === 'ALL');
  if (!reused) await survey({ project, run, call, emit, areas });
  const high = run.course.signals;
  const need = courseNeed(project, run);
  const spines = courseSpines(run.course, 3);

  emit('stage', { stage: 'courseBase' });
  const base = shapeBase(await call({ role: 'sub', ...courseBasePrompt(project, areas), task: { kind: 'courseBase', project, areas } }));

  emit('stage', { stage: 'course' });
  let best = null; let note = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await call({ role: 'director', ...coursePrompt(project, run, spines, base, lensName, need, areas, high, note), task: { kind: 'course', project, run, spines, need, areas, high, attempt } });
    const shaped = shapeRivals(raw, project, run, areas, spines);
    if (!best || shaped.rivals.length > best.rivals.length || (shaped.rivals.length === best.rivals.length && shaped.problems.length < best.problems.length)) best = shaped;
    if (!shaped.problems.length) break;
    note = `앞서 쓴 후보는 조건을 채우지 못했다: ${shaped.problems.join(' / ')}. 글자 수 제한은 그대로다.`;
  }
  const rivals = best.rivals;
  if (!rivals.length) throw new Error('운영 방향 후보를 쓰지 못했다');

  emit('stage', { stage: 'courseJudge' });
  const judge = shapeJudge(await call({ role: 'judge', ...courseJudgePrompt(project, rivals, base, areas, lensName), task: { kind: 'courseJudge', project, rivals, base, areas } }), rivals, areas);
  const won = rivals.find((r) => r.id === judge.winner) || rivals[0];
  const direction = { id: won.id, name: won.name, line: won.line, standard: won.standard, covers: won.covers, how: won.how, swap: won.swap, lenses: won.lenses, spine: won.spine, from: won.from, to: won.to, keeps: won.keeps, drops: won.drops, answer: won.answer, signals: won.signals, facts: won.facts };

  emit('stage', { stage: 'layers' });
  let st = null; note = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await call({ role: 'director', ...layersPrompt(project, run, direction, judge, lensName, need, areas, high, note), task: { kind: 'layers', project, run, direction, areas, need, high, attempt } });
    const shaped = shapeLayers(raw, project, run, direction, areas, { areasAuto: auto, base, rivals, judge });
    shaped.attempts = attempt + 1;
    if (!st || shaped.check.problems.length < st.check.problems.length) st = shaped;
    if (shaped.check.ok) break;
    note = `앞서 쓴 것은 조건을 채우지 못했다: ${shaped.check.problems.join(' / ')}. 모자란 것을 채워 다시 쓴다. 글자 수 제한은 그대로다.`;
  }
  st.v = 4; st.reusedHigh = reused;
  // 방향 자체에 대한 경고는 아래 층의 문제와 따로 남긴다 — 사람이 봐야 하는 것이다
  const warn = [];
  const item = judge.items.find((x) => x.id === won.id);
  if (item && item.level !== '방향') warn.push(`판정이 이긴 방향을 ${item.level}${item.level === '전술' ? '로' : '으로'} 봤다 — 후보 가운데 영역 전부에 걸리는 방향이 없었다`);
  if (item?.own === '범용') warn.push('판정이 이긴 방향을 범용 문장으로 봤다 — 경쟁 대행사도 그대로 쓸 수 있다');
  if (item?.control === '일부 불가') warn.push('기준의 판정 대상에 우리가 통제할 수 없는 구간이 들어 있다');
  if (base && !judge.beatsBase) warn.push('판정이 기본 방향을 더 낫게 봤다');
  if (item?.vsBase === '같음') warn.push('기본 방향과 운영의 기준이 같다고 판정받았다');
  for (const f of won.flags.filter((x) => /^장치|^달라지는 것|^아이덴티티/.test(x))) warn.push(f);
  if (!spines.length) warn.push('통합 판단 사이에서 충돌을 찾지 못했다 — 방향이 충돌을 푼 것이 아니다');
  const thin = st.pillars.filter((p) => p.thin);
  if (thin.length) st.thin = thin.map((p) => p.label);
  st.check = { ok: st.check.ok && !warn.length, problems: [...warn, ...st.check.problems] };
  run.strategy = st;
  emit('strategy');
  return st;
}
