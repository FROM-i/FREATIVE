// 운영 방향 — 전략 과제의 전략 한 장. 위에서 아래로 쓴다.
//   컨셉 과제의 전략 한 장(strategy.js)은 이긴 인사이트를 재료로 올려 쓴다. 그래서 전술을 일반화한 문장이 맨 위에 선다.
//   전략 과제는 순서를 뒤집고, 층을 업무 영역으로 가른다.
//     ⓪ 업무 영역 — 과제가 맡는 일의 범위. 미션에 없으면 미션에서 뽑는다
//     ① 기본 방향 — 노드 없이 낸 방향. 견주는 기준
//     ② 방향 후보 3개 — 영역 전부를 하나로 운영하는 기준. 영역마다 무엇이 달라지는지 쓴다
//     ③ 방향 판정 — 영역 전략이나 전술을 방향이라 부른 안은 진다
//     ④ 아래로 내린다 — 영역별 전략 → 그 아래 전술 여러 개(단계별). 이긴 인사이트는 전술 하나로 놓인다
//   이미 있는 판단과 연결 위에서 돈다. 앞 단계를 다시 돌리지 않는다. 호출 4~7회.
import { courseScopePrompt, courseBasePrompt, coursePrompt, courseJudgePrompt, layersPrompt, COURSE_CAPS, DEVICE_WORDS } from '../../knowledge/prompts-course.js';
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
  { id: 'strategy', name: '전략', note: '업무 영역 전부를 하나로 운영하는 방향을 먼저 정하고, 영역별 전략과 그 아래 전술로 내린다 — 운영 · 연간 플랜' },
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

function ctx(project, run) {
  const facts = new Set(validFacts(project).facts.map((f) => f.id));
  const sig = new Map(run.signals.filter((s) => !s.muted).map((s) => [s.id, s]));
  const ids = (list, ok) => uniq(arr(list).map((x) => text(x).replace(/^\[|\]$/g, '')).filter((x) => ok.has(x)));
  return { facts, sig, ids, fid: (l) => ids(l, facts), sid: (l) => ids(l, sig) };
}
/** 채워야 하는 근거의 넓이 — 그래프 크기에 맞춘다 */
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
    tactics: 4,
  };
}

export function shapeBase(raw) {
  const C = COURSE_CAPS;
  const b = { name: cap(raw?.name, C.name), line: cap(raw?.line, C.line), standard: cap(raw?.standard, C.standard) };
  return b.line || b.standard ? b : null;
}

/** 방향 후보를 다듬는다 — 없는 id를 걷고, 글자 수를 묶고, 영역마다 달라지는 것을 썼는지 보고, 근거의 넓이를 센다 */
export function shapeRivals(raw, project, run, areas) {
  const C = COURSE_CAPS; const { sig, fid, sid } = ctx(project, run);
  const need = courseNeed(project, run);
  const rivals = arr(raw?.candidates).map((c, i) => {
    const signals = sid(c.signals); const facts = fid(c.facts);
    const lenses = uniq(signals.map((id) => sig.get(id).lens));
    const covers = areas.map((a) => ({ area: a.id, line: cap(arr(c.covers).find((x) => text(x.area) === a.id)?.line, C.cover) })).filter((x) => x.line);
    const r = {
      id: `D${i + 1}`, name: cap(c.name, C.name), line: cap(c.line, C.line), standard: cap(c.standard, C.standard), covers,
      from: cap(c.from, C.from), to: cap(c.to, C.to), keeps: cap(c.keeps, C.keeps), drops: arr(c.drops).map((d) => cap(d, C.drop)).filter(Boolean).slice(0, 2),
      answer: cap(c.answer, C.answer), signals, facts,
      breadth: { nodes: lenses.length, tunnel: signals.some((id) => sig.get(id).family === 'tunnel') },
      flags: [],
    };
    const miss = areas.filter((a) => !covers.some((x) => x.area === a.id));
    if (miss.length) r.flags.push(`달라지는 것을 쓰지 않은 영역: ${miss.map((a) => a.name).join(', ')}`);
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
  const pick = (re) => rivals.filter((r) => r.flags.some((f) => re.test(f)));
  const gap = pick(/^달라지는 것/);
  if (gap.length) problems.push(`영역 전부에 걸리지 않은 후보: ${gap.map((r) => `${r.id}(${r.flags.find((f) => /^달라지는 것/.test(f))})`).join(' / ')}. 영역마다 달라지는 것을 한 줄씩 쓴다. 쓸 수 없으면 방향이 아니다`);
  const thin = pick(/노드|팩트|터널/);
  if (thin.length) problems.push(`근거가 좁은 후보: ${thin.map((r) => `${r.id}(${r.flags.filter((f) => /노드|팩트|터널/.test(f)).join(', ')})`).join(' / ')}. 후보마다 노드 ${need.nodes}개 이상의 판단과 팩트 ${need.facts}개 이상을 쓴다`);
  const device = pick(/^장치/);
  if (device.length) problems.push(`방향 문장에 장치 이름을 쓴 후보: ${device.map((r) => r.id).join(', ')}. 장치를 지우고 운영의 기준으로 다시 쓴다`);
  return { rivals, problems };
}

const LEVELS_OF = ['방향', '영역 전략', '전술'];
/** 판정을 다듬는다 — 순서에서 기본 방향을 빼고, 방향으로 판정받은 맨 앞이 이긴 방향이다 */
export function shapeJudge(raw, rivals, areas = []) {
  const C = COURSE_CAPS; const ok = new Set(rivals.map((r) => r.id)); const aid = new Set(areas.map((a) => a.id));
  const order = uniq(arr(raw?.order).map(text).filter((x) => ok.has(x) || x === 'BASE'));
  for (const r of rivals) if (!order.includes(r.id)) order.push(r.id);
  if (!order.includes('BASE')) order.push('BASE');
  const items = rivals.map((r) => {
    const x = arr(raw?.items).find((it) => text(it.id) === r.id) || {};
    const reaches = uniq(arr(x.reaches).map(text).filter((a) => aid.has(a)));
    let level = LEVELS_OF.includes(text(x.level)) ? text(x.level) : '방향';
    // 방향이라 했어도 진짜로 걸리는 영역이 하나뿐이면 그 영역의 전략이다
    if (level === '방향' && areas.length > 1 && arr(x.reaches).length && reaches.length <= 1) level = '영역 전략';
    return { id: r.id, level, reaches, vsBase: text(x.vsBase) === '같음' ? '같음' : '다름', strong: cap(x.strong, C.note), weak: cap(x.weak, C.note) };
  });
  const level = (id) => items.find((x) => x.id === id)?.level;
  // 영역 전략이나 전술로 판정받은 후보는 순서가 앞이어도 방향으로 올리지 않는다
  const winner = order.find((id) => id !== 'BASE' && level(id) === '방향') || order.find((id) => id !== 'BASE');
  return {
    order, items, winner,
    beatsBase: order.indexOf(winner) < order.indexOf('BASE'),
    why: cap(raw?.why, C.why), risk: cap(raw?.risk, C.note),
    borrow: arr(raw?.borrow).map((b) => ({ from: ok.has(text(b.from)) ? text(b.from) : '', what: cap(b.what, C.note) })).filter((b) => b.what).slice(0, 2),
  };
}

/** 아래 두 층을 다듬고, 전략 한 장의 모양으로 맞춘다. 줄(pillars)은 업무 영역이다. */
export function shapeLayers(raw, project, run, direction, areas, extra = {}) {
  const C = COURSE_CAPS; const { facts, sig, fid, sid } = ctx(project, run);
  const need = courseNeed(project, run);
  const ins = new Set((run.insights || []).map((i) => i.id));
  const cats = partCats(project); const catOk = new Set(cats);
  const phases = arr(raw?.phases).map((p, i) => ({ id: `P${i + 1}`, was: text(p.id), when: cap(p.when, C.when), line: cap(p.line, C.phase), pillars: [] })).filter((p) => p.line).slice(0, 4);
  const phaseId = (v) => phases.find((p) => p.was === text(v) || p.id === text(v))?.id || '';
  const placedAt = new Map();
  const pillars = areas.map((a) => {
    const x = arr(raw?.areas).find((r) => text(r.area) === a.id) || {};
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
  // 얼마나 넓게 썼는가 — 방향과 영역 전략이 기댄 것을 모두 센다
  const usedByInsights = new Set((run.insights || []).flatMap((i) => i.check?.used || []));
  const sigUsed = uniq([...direction.signals, ...pillars.flatMap((p) => p.signals)]);
  const factUsed = uniq([...direction.facts, ...pillars.flatMap((p) => p.facts), ...st.fixes.flatMap((x) => x.facts), ...st.boosts.flatMap((x) => x.facts)]);
  const lensesAll = uniq([...sig.values()].map((s) => s.lens));
  const lensesByInsights = uniq([...usedByInsights].map((id) => sig.get(id)?.lens).filter(Boolean));
  const lensesUsed = uniq(sigUsed.map((id) => sig.get(id).lens));
  st.coverage = {
    facts: { used: factUsed.length, total: facts.size, byInsights: uniq((run.insights || []).flatMap((i) => i.facts || [])).filter((f) => facts.has(f)).length },
    signals: { used: sigUsed.length, total: sig.size, fresh: sigUsed.filter((id) => !usedByInsights.has(id)).length, byInsights: usedByInsights.size },
    nodes: { used: lensesUsed.length, total: lensesAll.length, fresh: lensesUsed.filter((l) => !lensesByInsights.includes(l)).length, byInsights: lensesByInsights.length },
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

/** 통합 운영 방향부터 아래로 내려 쓴다. 결과는 run.strategy(v3)에 담는다. */
export async function chart({ project, run, call, emit = () => {} }) {
  if (!run.signals?.some((s) => !s.muted)) return null;
  const need = courseNeed(project, run);
  const spines = weaveSpines(run, 3);

  // ⓪ 업무 영역 — 사람이 적었으면 그대로, 없으면 미션에서 뽑는다
  let areas = areasOf(project); let auto = false;
  if (!areas) {
    emit('stage', { stage: 'courseScope' });
    areas = shapeAreas(await call({ role: 'sub', ...courseScopePrompt(project), task: { kind: 'courseScope', project } }));
    auto = true;
    if (areas.length < 2) throw new Error('업무 영역을 2개 이상 뽑지 못했다. 미션 탭의 "업무 영역"에 직접 적는다');
  }

  emit('stage', { stage: 'courseBase' });
  const base = shapeBase(await call({ role: 'sub', ...courseBasePrompt(project, areas), task: { kind: 'courseBase', project, areas } }));

  emit('stage', { stage: 'course' });
  let best = null; let note = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await call({ role: 'director', ...coursePrompt(project, run, spines, base, lensName, need, areas, note), task: { kind: 'course', project, run, spines, need, areas, attempt } });
    const shaped = shapeRivals(raw, project, run, areas);
    if (!best || shaped.rivals.length > best.rivals.length || (shaped.rivals.length === best.rivals.length && shaped.problems.length < best.problems.length)) best = shaped;
    if (!shaped.problems.length) break;
    note = `앞서 쓴 후보는 조건을 채우지 못했다: ${shaped.problems.join(' / ')}. 글자 수 제한은 그대로다.`;
  }
  const rivals = best.rivals;
  if (!rivals.length) throw new Error('운영 방향 후보를 쓰지 못했다');

  emit('stage', { stage: 'courseJudge' });
  const judge = shapeJudge(await call({ role: 'judge', ...courseJudgePrompt(project, rivals, base, areas), task: { kind: 'courseJudge', project, rivals, base, areas } }), rivals, areas);
  const won = rivals.find((r) => r.id === judge.winner) || rivals[0];
  const direction = { id: won.id, name: won.name, line: won.line, standard: won.standard, covers: won.covers, from: won.from, to: won.to, keeps: won.keeps, drops: won.drops, answer: won.answer, signals: won.signals, facts: won.facts };

  emit('stage', { stage: 'layers' });
  let st = null; note = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await call({ role: 'director', ...layersPrompt(project, run, direction, judge, lensName, need, areas, note), task: { kind: 'layers', project, run, direction, areas, need, attempt } });
    const shaped = shapeLayers(raw, project, run, direction, areas, { areasAuto: auto, base, rivals, judge });
    shaped.attempts = attempt + 1;
    if (!st || shaped.check.problems.length < st.check.problems.length) st = shaped;
    if (shaped.check.ok) break;
    note = `앞서 쓴 것은 조건을 채우지 못했다: ${shaped.check.problems.join(' / ')}. 모자란 것을 채워 다시 쓴다. 글자 수 제한은 그대로다.`;
  }
  // 방향 자체에 대한 경고는 아래 층의 문제와 따로 남긴다 — 사람이 봐야 하는 것이다
  const warn = [];
  const item = judge.items.find((x) => x.id === won.id);
  if (item && item.level !== '방향') warn.push(`판정이 이긴 방향을 ${item.level}${item.level === '전술' ? '로' : '으로'} 봤다 — 후보 가운데 영역 전부에 걸리는 방향이 없었다`);
  if (base && !judge.beatsBase) warn.push('판정이 기본 방향을 더 낫게 봤다');
  if (item?.vsBase === '같음') warn.push('기본 방향과 운영의 기준이 같다고 판정받았다');
  for (const f of won.flags.filter((x) => /^장치|^달라지는 것/.test(x))) warn.push(f);
  const thin = st.pillars.filter((p) => p.thin);
  if (thin.length) st.thin = thin.map((p) => p.label);   // 판단이 거의 없는 영역 — 문제가 아니라 재료의 한계라 따로 보인다
  st.check = { ok: st.check.ok && !warn.length, problems: [...warn, ...st.check.problems] };
  run.strategy = st;
  emit('strategy');
  return st;
}
