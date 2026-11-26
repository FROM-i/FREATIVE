// 방향 — 모든 과제가 같은 길을 간다. 과제의 종류에 따라 길이 달라지지 않는다.
//   head()    이슈를 보기 전에 방향을 정한다
//     ⓪ 영역 — 과제가 맡는 일의 범위. 미션에 없으면 브리프에서 뽑는다
//     ① 구성 — 모든 노드가 과제 전체를 읽고 조각(관찰 · 제약 · 해석 · 지렛대)을 낸다. 결론이 아니다
//     ② 관계 — 조각 사이의 지지와 모순을 두 번 따로 매겨 합친다
//     ③ 수렴 — 조각을 한꺼번에 수렴시킨다(graph/cohere.js, AI를 부르지 않는다). 서로 받치는 해석의 연합이 제안이다. 하나로 모으지 않는다
//     ④ 기본 방향 — 노드 없이 낸 방향. 견주는 기준
//     ⑤ 표현 — 제안마다 방향 문장으로 옮긴다. 결론을 새로 정하지 않는다
//     ⑥ 방향 판정 — 영역 · 고유 · 약속 · 브리프 시험. 순서를 매길 뿐 제안은 모두 남는다
//   (그 뒤 think()가 이슈 높이의 노드 판단 · 연결 · 경쟁 · 판정을 돈다. 모든 호출이 정해진 방향을 받는다)
//   descend() 방향 아래로 내려 쓴다
//     ⑦ 영역별 전략(영역의 조각에서) → 전술 여러 개(이슈 높이의 판단과 인사이트에서). 전술마다 나온 노드를 남긴다
//   chart()   이미 있는 분석 위에서 head와 descend만 돈다. 이슈 높이의 분석은 다시 돌리지 않는다.
import { courseScopePrompt, courseObjectsPrompt, courseBasePrompt, courseLensPrompt, courseRelPrompt, coursePrompt, courseJudgePrompt, layersPrompt, goalsOf, COURSE_CAPS, DEVICE_WORDS } from '../../knowledge/prompts-course.js';
import { validFacts } from '../../knowledge/facts.js';
import { categoriesOf, categoryById } from '../../knowledge/tags.js';
import { lensName, activeLenses, signalPrefix } from '../graph/model.js';
import { mergeRelations, buildNet, settle, harmony, proposals } from '../graph/cohere.js';

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const cap = (v, n) => { const s = text(v); return s.length > n + 6 ? `${s.slice(0, n + 5)}…` : s; };
const uniq = (a) => [...new Set(a)];
const arr = (v) => (Array.isArray(v) ? v : []);

const partCats = (project) => categoriesOf(project).filter((c) => c !== 'integrated');

/** 낱말 목록을 다듬는다 — 쉼표로 적은 글도 받는다. 두 글자 이상, 6개까지 */
const words = (v) => uniq((Array.isArray(v) ? v : String(v || '').split(/[,，、·\/\n]/)).map((w) => text(w).replace(/\s+/g, ' ')).filter((w) => w.length >= 2 && w.length <= COURSE_CAPS.object + 4)).slice(0, 6);
/** 두 영역 이상에 적힌 낱말은 어느 영역의 대상도 아니다 — 걷는다 */
const ownWords = (areas) => { const n = new Map(); for (const a of areas) for (const w of a.objects || []) n.set(w, (n.get(w) || 0) + 1); return areas.map((a) => ({ ...a, objects: (a.objects || []).filter((w) => n.get(w) === 1) })); };

/** 영역 — 사람이 미션에 적은 것. 이름이 있는 줄만 받고 id를 S1, S2…로 맞춘다. 하나여도 받는다(결과물이 하나인 과제). */
export function areasOf(project) {
  const list = arr(project?.areas).map((a) => ({ name: cap(a?.name, COURSE_CAPS.area + 6), note: cap(a?.note, COURSE_CAPS.areaNote + 10), objects: words(a?.objects) })).filter((a) => a.name).slice(0, 5);
  return list.length ? ownWords(list.map((a, i) => ({ id: `S${i + 1}`, ...a }))) : null;
}
export function shapeAreas(raw) {
  const C = COURSE_CAPS;
  return ownWords(arr(raw?.areas).map((a) => ({ name: cap(a?.name, C.area), note: cap(a?.note, C.areaNote), objects: words(a?.objects) })).filter((a) => a.name).slice(0, 4).map((a, i) => ({ id: `S${i + 1}`, ...a })));
}
/** 글에 어느 영역의 대상 낱말이 들어 있는가 — [{ area, name, words }] */
export function objectHits(str, areas) {
  const t = String(str || '');
  return areas.map((a) => ({ area: a.id, name: a.name, words: (a.objects || []).filter((w) => t.includes(w)) })).filter((x) => x.words.length);
}
/** 한 영역의 대상에만 붙은 글인가 — 영역이 둘 이상이고, 대상 낱말이 한 영역 것만 들어 있을 때 */
const pinned = (str, areas) => { if (areas.length < 2) return null; const hits = objectHits(str, areas); return hits.length === 1 ? hits[0] : null; };
/** 다른 영역의 대상을 빌려 쓴 글인가 — 제 영역의 낱말은 없고 남의 영역 낱말만 있을 때 */
const borrowed = (str, own, areas) => { if (areas.length < 2) return null; const hits = objectHits(str, areas); return hits.some((x) => x.area === own) ? null : hits[0] || null; };

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
  const high = run.course?.signals || [];
  const lenses = uniq(high.map((s) => s.lens)).length;
  const facts = validFacts(project).facts.length;
  const usedByInsights = new Set((run.insights || []).flatMap((i) => i.check?.used || []));
  return {
    nodes: Math.max(2, Math.min(4, Math.ceil(lenses * 0.3))),
    identity: Math.min(2, uniq(high.filter((s) => s.family === 'identity').map((s) => s.lens)).length),
    tunnel: high.some((s) => s.family === 'tunnel'),
    facts: Math.min(5, facts),
    total: Math.min(15, Math.max(facts ? 4 : 0, Math.round(facts * 0.3))),
    fresh: Math.min(4, live.filter((s) => !usedByInsights.has(s.id)).length),
    tactics: 4,
    lenses: Math.min(6, uniq(live.map((s) => s.lens)).length),
  };
}

async function pool(items, limit, worker) {
  let next = 0;
  const run = async () => { while (next < items.length) { const i = next++; await worker(items[i], i); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, run));
}
const TYPES = ['관찰', '제약', '해석', '지렛대'];
/** 노드 하나가 낸 조각을 다듬는다 — 한 가지 내용의 짧은 글, 종류 · 층 · 범위, 기댄 팩트와 닿는 목표 */
export function shapeAtoms(raw, lens, project, areas) {
  const C = COURSE_CAPS; const facts = new Set(validFacts(project).facts.map((f) => f.id)); const goals = new Set(goalsOf(project).map((g) => g.id));
  const ids = (list, ok) => uniq(arr(list).map((f) => text(f).replace(/^\[|\]$/g, '')).filter((f) => ok.has(f)));
  const out = []; const seen = new Set();
  for (const x of arr(raw?.atoms)) {
    const claim = cap(x?.text ?? x?.claim, C.claim - 40); if (!claim || seen.has(claim)) continue; seen.add(claim);
    let scopes = uniq(arr(Array.isArray(x.scope) ? x.scope : [x.scope]).map((v) => (/^(all|통합|전체)$/i.test(text(v)) ? 'ALL' : areaId(v, areas))).filter(Boolean));
    if (!scopes.length || areas.length < 2) scopes = ['ALL'];
    const type = TYPES.includes(text(x.type)) ? text(x.type) : '관찰';
    out.push({ id: `C-${signalPrefix(lens.id)}-${out.length + 1}`, lens: lens.id, family: lens.family, type, layer: text(x.layer) === '구조' ? '구조' : '해석', claim,
      scope: scopes.includes('ALL') || scopes.length > 1 ? 'ALL' : scopes[0], scopes, facts: ids(x.facts, facts), goals: ids(x.goals, goals), ...(out.length === 0 && text(raw?.only) ? { only: cap(raw.only, 90) } : {}) });
    if (out.length >= 10) break;
  }
  return out;
}
const areasKey = (areas) => areas.map((a) => a.name).join('|');
const grams = (t) => { const x = String(t || '').replace(/[^가-힣a-zA-Z0-9]/g, ''); const g = new Set(); for (let i = 0; i < x.length - 1; i++) g.add(x.slice(i, i + 2)); return g; };
/** 두 글이 얼마나 같은 말인가 (0~1) — 두 글자 조각이 겹치는 비율. 실제 실행에서 거의 같은 문장은 0.3~0.5, 다른 문장은 0.2 아래였다 */
export function overlap(a, b) { const A = grams(a); const B = grams(b); if (!A.size || !B.size) return 0; let n = 0; for (const x of A) if (B.has(x)) n++; return n / Math.min(A.size, B.size); }
export const OVERLAP = 0.3;

/** 수렴 — 조각과 관계로 네트워크를 짓고 한꺼번에 수렴시킨다. 사람이 고정하거나 뺀 조각(pins)이 있으면 그대로 둔 채 나머지가 다시 맞춰진다. AI를 부르지 않는다 */
export function cohere(course, { pins = {}, count = 3, weights = {} } = {}) {
  const atoms = course.signals; const net = buildNet(atoms, course.rel, weights);
  const clamp = new Map(Object.entries(pins).filter(([id]) => net.idx.has(id)).map(([id, v]) => [id, v > 0 ? 1 : -1]));
  const r = settle(net, clamp);
  atoms.forEach((a, i) => { a.act = +r.act[i].toFixed(3); });
  course.net = { rounds: r.rounds, settled: r.settled, harmony: +harmony(net, r.act).toFixed(2), on: atoms.filter((a) => a.act > 0.3).length, off: atoms.filter((a) => a.act < 0).length, pins };
  course.proposals = proposals(net, course.rel, r.act, { count, clamp, ...(weights.grain ? { grain: weights.grain } : {}) });
  return course;
}

/** ① ② ③ 구성 · 관계 · 수렴 */
export async function survey({ project, run, call, emit = () => {}, areas }) {
  emit('stage', { stage: 'courseLens' });
  const lenses = activeLenses(project, run.picks || []);
  const signals = []; const failed = [];
  await pool(lenses, project.settings?.concurrency || 4, async (lens) => {
    try {
      const own = run.signals.filter((s) => s.lens === lens.id && !s.muted);
      const got = shapeAtoms(await call({ role: 'sub', ...courseLensPrompt(project, lens, areas, own), task: { kind: 'courseLens', project, lens, areas } }), lens, project, areas);
      if (got.length < 3) failed.push({ lens: lens.id, error: `조각을 ${got.length}개만 냈다` });
      signals.push(...got);
    } catch (e) { if (/취소/.test(e.message)) throw e; failed.push({ lens: lens.id, error: e.message }); }
  });
  const order = new Map(lenses.map((l, i) => [l.id, i]));
  signals.sort((a, b) => order.get(a.lens) - order.get(b.lens) || (a.id < b.id ? -1 : 1));
  if (uniq(signals.map((s) => s.lens)).length < 3) throw new Error(`조각을 낸 노드가 ${uniq(signals.map((s) => s.lens)).length}개뿐이다${failed[0] ? ` — ${failed[0].error}` : ''}`);
  // 관계는 두 번 따로 매긴다(순서를 뒤집어서) — 한 사람의 취향이 결론이 되지 않게. 둘 다 본 관계는 온전히, 한쪽만 본 관계는 절반으로 센다
  emit('stage', { stage: 'courseRel' });
  const reads = await Promise.all([false, true].map(async (reverse) => { try { return await call({ role: 'sub', ...courseRelPrompt(project, signals, areas, lensName, reverse), task: { kind: 'courseRel', project, atoms: signals, areas, reverse } }); } catch (e) { if (/취소/.test(e.message)) throw e; return null; } }));
  const got = reads.filter(Boolean);
  if (!got.length) throw new Error('조각 사이의 관계를 매기지 못했다');
  const rel = mergeRelations(got, signals);
  // 같은 말을 한 조각이 얼마나 되는가 — 노드가 병렬로 다르게 읽었는지의 지표
  let pairs = 0; let dup = 0;
  for (let i = 0; i < signals.length; i++) for (let k = i + 1; k < signals.length; k++) if (signals[i].lens !== signals[k].lens) { pairs++; if (overlap(signals[i].claim, signals[k].claim) >= OVERLAP) dup++; }
  run.course = { v: 6, key: areasKey(areas), at: new Date().toISOString(), signals, rel, failed, readers: got.length, dup: { pairs, dup } };
  emit('stage', { stage: 'cohere' });
  cohere(run.course, { count: project.settings?.proposalCount || 3, pins: project.pins || {}, weights: project.settings?.cohere || {} });
  return run.course;
}

export function shapeBase(raw) {
  const C = COURSE_CAPS;
  const b = { name: cap(raw?.name, C.name), line: cap(raw?.line, C.line), standard: cap(raw?.standard, C.standard) };
  return b.line || b.standard ? b : null;
}

/** 방향 후보를 다듬는다 — 없는 id를 걷고, 글자 수를 묶고, 영역마다 달라지는 것을 썼는지와 어느 노드가 기준을 만들었는지 본다 */
export function shapeRivals(raw, project, run, areas, props = []) {
  const C = COURSE_CAPS; const { sig, fid, sid } = ctx(project, run);
  const need = courseNeed(project, run);
  const rivals = arr(raw?.candidates).map((c, i) => {
    const pr = props[i]; const mine = pr ? new Set([...pr.readings, ...pr.evidence]) : null;
    // 근거는 그 연합의 조각이어야 한다. 다른 연합의 조각은 걷는다. 적지 않았으면 연합의 해석을 근거로 친다
    let signals = sid(c.signals).filter((id) => !mine || mine.has(id)); if (!signals.length && pr) signals = pr.readings.slice(0, 8);
    const facts = fid(c.facts);
    const fams = (f) => uniq(signals.filter((id) => sig.get(id).family === f).map((id) => sig.get(id).lens));
    const lenses = uniq([...fams('identity'), ...fams('airplane'), ...fams('tunnel')]);
    const covers = areas.map((a) => ({ area: a.id, line: cap(arr(c.covers).find((x) => areaId(x.area, areas) === a.id)?.line, C.cover) })).filter((x) => x.line);
    const r = {
      id: `D${i + 1}`, name: cap(c.name, C.name), line: cap(c.line, C.line), standard: cap(c.standard, C.standard), covers,
      how: cap(c.how, C.swap), swap: cap(c.swap, C.swap),
      from: cap(c.from, C.from), to: cap(c.to, C.to), keeps: cap(c.keeps, C.keeps), drops: arr(c.drops).map((d) => cap(d, C.drop)).filter(Boolean).slice(0, 2),
      answer: cap(c.answer, C.answer), signals, facts, lenses,
      proposal: pr ? { id: pr.id, readings: pr.readings.length, evidence: pr.evidence.length, score: pr.score, whole: pr.whole, live: pr.live, against: pr.against.slice(0, 5), scopes: pr.scopes, goals: pr.goals, nodes: pr.lenses.length, families: pr.families.length } : null,
      breadth: { nodes: lenses.length, identity: fams('identity').length, tunnel: fams('tunnel').length > 0 },
      flags: [],
    };
    const miss = areas.filter((a) => !covers.some((x) => x.area === a.id));
    if (miss.length) r.flags.push(`닿지 않는 영역: ${miss.map((a) => a.name).join(', ')}`);   // 제안은 여럿이 함께 남는다 — 범위가 좁은 제안도 제안이다. 표시만 한다
    const hit = DEVICE_WORDS.filter((w) => `${r.name} ${r.line}`.includes(w));
    if (hit.length) r.flags.push(`장치 이름이 들어 있다: ${hit.join(', ')}`);
    // 대상 낱말 검사 — 방향 문장이 한 영역의 대상에 붙었는가, 영역 줄이 남의 대상을 빌렸는가
    const pin = pinned(`${r.name} ${r.line} ${r.standard}`, areas);
    if (pin) r.flags.push(`한 영역의 대상이 방향의 주어다: ${pin.name}의 "${pin.words.join(', ')}"`);
    const lent = covers.map((c) => ({ c, b: borrowed(c.line, c.area, areas) })).filter((x) => x.b);
    if (lent.length) r.flags.push(`빌린 대상: ${lent.map((x) => `${areas.find((a) => a.id === x.c.area).name} 줄에 ${x.b.name}의 "${x.b.words.join(', ')}"`).join(' / ')}`);
    if (r.breadth.identity < 1) r.flags.push('아이덴티티 노드의 조각이 없다');
    if (!r.swap) r.flags.push('경쟁사가 그대로 쓸 수 없는 이유를 쓰지 않았다');
    if (!r.drops.length) r.flags.push('하지 않는 것을 쓰지 않았다');
    if (facts.length < Math.min(2, need.facts)) r.flags.push(`팩트 ${facts.length}건만 썼다`);
    return r;
  }).filter((r) => r.name && r.line && r.standard).slice(0, 3);
  const problems = [];
  if (rivals.length < Math.min(1, props.length)) problems.push('방향을 쓰지 못했다. 제안마다 방향 하나씩 쓴다');
  const pick = (re) => rivals.filter((r) => r.flags.some((f) => re.test(f)));
  const list = (rs, re) => rs.map((r) => `${r.id}(${r.flags.filter((f) => re.test(f)).join(', ')})`).join(' / ');
  const thin = pick(/^팩트|^경쟁사가/);
  if (thin.length) problems.push(`덜 쓴 후보: ${list(thin, /^팩트|^경쟁사가/)}. 기댄 팩트의 id와 다른 회사가 그대로 쓸 수 없는 이유를 적는다`);
  const device = pick(/^장치/);
  if (device.length) problems.push(`방향 문장에 장치 이름을 쓴 후보: ${device.map((r) => r.id).join(', ')}. 장치를 지우고 기준으로 다시 쓴다`);
  const stuck = pick(/^한 영역의 대상|^빌린 대상/);
  if (stuck.length) problems.push(`한 영역의 대상에 붙은 후보: ${list(stuck, /^한 영역의 대상|^빌린 대상/)}. 그 낱말은 그 영역의 전략에서 쓴다. 방향은 그 낱말 없이, 영역 전부에 통하는 단위와 기준으로 다시 쓴다. 다른 영역 줄은 그 영역의 과업에서 나온 말로 쓴다`);
  return { rivals, problems };
}

const LEVELS_OF = ['방향', '영역 전략', '전술'];
/** 판정을 다듬는다 — 방향이고, 고유하고, 브리프 전체에 닿고, 약속할 수 있는 후보가 먼저다. 기본 방향은 순서에만 남는다 */
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
    return { id: r.id, level, reaches, own: text(x.own) === '범용' ? '범용' : '고유', control: /불가/.test(text(x.control)) ? '일부 불가' : '가능', brief: text(x.brief) === '일부' ? '일부' : '전체', vsBase: text(x.vsBase) === '같음' ? '같음' : '다름', strong: cap(x.strong, C.note), weak: cap(x.weak, C.note) };
  });
  const it = (id) => items.find((x) => x.id === id);
  const cands = order.filter((id) => id !== 'BASE');
  const ok4 = (id, n) => { const x = it(id); return [x.level === '방향', x.own === '고유', x.brief === '전체', x.control === '가능'].slice(0, n).every(Boolean); };
  const winner = cands.find((id) => ok4(id, 4)) || cands.find((id) => ok4(id, 3)) || cands.find((id) => ok4(id, 2)) || cands.find((id) => ok4(id, 1)) || cands[0];
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
    const tactics = arr(x.tactics).map((t) => ({ phase: phaseId(t.phase), move: cap(t.move, C.move), parts: uniq(arr(t.parts).map(text).filter((c) => catOk.has(c))), from: sid(t.from).slice(0, 3), insight: ins.has(text(t.insight)) ? text(t.insight) : '' })).filter((t) => t.move && t.phase).slice(0, 10);
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
  // 전술이 어느 노드의 판단에서 나왔는가 — 서브 노드가 제 몫을 했는지 본다. 인사이트로 놓인 전술은 그 인사이트가 쓴 판단을 출처로 친다
  const insUsed = new Map((run.insights || []).map((i) => [i.id, (i.check?.used || []).filter((id) => sig.has(id))]));
  const tacs = pillars.flatMap((p) => p.tactics);
  for (const t of tacs) { if (!t.from.length && t.insight) t.from = (insUsed.get(t.insight) || []).slice(0, 3); t.lenses = uniq(t.from.map((id) => sig.get(id).lens)); }
  const cited = uniq([...direction.signals, ...pillars.flatMap((p) => p.signals), ...tacs.flatMap((t) => t.from)]).filter((id) => sig.has(id));
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
    high: { used: cited.filter((id) => !base.has(id)).length, total: high.length, tensions: (run.course?.rel?.edges || run.course?.edges || []).filter((e) => e.kind === 'contradict' || e.type === 'tension').length },
  };
  const all = tacs;
  const tacLenses = uniq(all.flatMap((t) => t.lenses));
  st.coverage.tactics = { total: all.length, sourced: all.filter((t) => t.from.length).length, lenses: tacLenses.length, lensTotal: uniq([...base.values()].map((x) => x.lens)).length };
  const problems = [];
  if (phases.length < 3) problems.push(`단계가 ${phases.length}개다. 3~4개를 쓴다`);
  const bare = pillars.filter((p) => !p.name || !p.guide);
  if (bare.length) problems.push(`전략이 없는 영역: ${bare.map((p) => p.label).join(', ')}`);
  const few = pillars.filter((p) => p.tactics.length < need.tactics);
  if (few.length) problems.push(`전술이 ${need.tactics}개보다 적은 영역: ${few.map((p) => `${p.label}(${p.tactics.length}개)`).join(', ')}. 영역 전략 아래에 서로 다른 전술을 여러 개 쓴다`);
  const holes = pillars.map((p) => ({ p, miss: phases.filter((ph) => !p.tactics.some((t) => t.phase === ph.id)) })).filter((x) => x.miss.length);
  if (phases.length && holes.length) problems.push(`전술이 빈 단계: ${holes.map((x) => `${x.p.label}(${x.miss.map((ph) => ph.when).join(', ')})`).join(' / ')}`);
  if (cats.length > 1) { const seen = new Set(pillars.flatMap((p) => p.tactics.flatMap((t) => t.parts))); const miss = cats.filter((c) => !seen.has(c)); if (miss.length) problems.push(`전술을 맡지 않은 파트: ${miss.map((c) => categoryById(c).name).join(', ')}`); }
  const dev = pillars.map((p) => ({ p, w: DEVICE_WORDS.filter((w) => `${p.name} ${p.guide}`.includes(w) && !(areas.find((a) => a.id === p.part)?.objects || []).includes(w)) })).filter((x) => x.w.length);
  if (dev.length) problems.push(`영역 전략에 장치 이름을 썼다: ${dev.map((x) => `${x.p.label}(${x.w.join(', ')})`).join(' / ')}. 장치는 전술이다. 전략은 그 위의 방침으로 쓴다`);
  const lentS = pillars.map((p) => ({ p, b: borrowed(`${p.name} ${p.guide}`, p.part, areas) })).filter((x) => x.b);
  if (lentS.length) problems.push(`다른 영역의 대상에 기댄 영역 전략: ${lentS.map((x) => `${x.p.label} ← ${x.b.name}의 "${x.b.words.join(', ')}"`).join(' / ')}. 그 영역의 과업에서 나온 말로 쓴다`);
  const clone = pillars.filter((p) => p.guide && direction.line && p.guide.replace(/\s/g, '') === direction.line.replace(/\s/g, ''));
  if (clone.length) problems.push(`방향 문장을 그대로 옮긴 영역 전략: ${clone.map((p) => p.label).join(', ')}`);
  const weak = pillars.filter((p) => p.thin && (run.course?.signals || []).some((x) => x.scope === p.part));
  if (weak.length) problems.push(`근거 판단이 2개보다 적은 영역: ${weak.map((p) => p.label).join(', ')}. 영역별 판단에서 출발한다`);
  const poor = pillars.filter((p) => p.facts.length < 2 && facts.size >= 6);
  if (poor.length) problems.push(`팩트가 2개보다 적은 영역: ${poor.map((p) => p.label).join(', ')}`);
  if (facts.size >= 6 && factUsed.length < need.total) problems.push(`팩트를 ${factUsed.length}건만 썼다. ${need.total}건 이상 쓴다`);
  if (st.coverage.signals.fresh < need.fresh) problems.push(`인사이트에 쓰이지 않은 판단을 ${st.coverage.signals.fresh}개만 끌어왔다. ${need.fresh}개 이상 쓴다`);
  const tc = st.coverage.tactics;
  if (tc.total && tc.sourced < Math.ceil(tc.total * 0.6)) problems.push(`어느 판단에서 나왔는지 적지 않은 전술이 ${tc.total - tc.sourced}/${tc.total}건이다. 전술마다 from에 판단 id를 적는다`);
  else if (tc.total && tc.lenses < need.lenses) problems.push(`전술이 기댄 노드가 ${tc.lenses}개뿐이다. 서로 다른 노드 ${need.lenses}개 이상의 판단에서 전술을 낸다`);
  const lost = placed.filter((x) => x.fit === '맞지 않음' && x.said !== '맞지 않음');
  if (lost.length) problems.push(`전술로 놓지 않은 인사이트: ${lost.map((x) => x.id).join(', ')}. 맞는 영역의 전술로 놓거나 "맞지 않음"으로 적는다`);
  for (const x of placed) delete x.said;
  st.check = { ok: problems.length === 0, problems };
  return st;
}

/** 한 칸에 놓이는 것 — 영역(줄) × 단계(칸). 예전 모양(v2: 파트 × 단계, 칸마다 할 일 하나)도 같은 꼴로 돌려준다 */
export function cellItems(st, p, ph) {
  if (st.v >= 3) return p.tactics.filter((t) => t.phase === ph.id).map((t) => ({ move: t.move, parts: t.parts, insight: t.insight, lenses: t.lenses || [] }));
  const c = (p.cells || []).find((x) => x.phase === ph.id);
  return [...(c ? [{ move: c.move, axis: c.axis, parts: [], insight: '' }] : []), ...st.insights.filter((x) => x.fit === '맞음' && x.part === p.part && x.phase === ph.id).map((x) => ({ move: x.name || x.id, parts: [], insight: x.id }))];
}

/** 이슈 높이의 단계가 받을 방향 — 프롬프트의 미션 글에 붙는다 */
export const headingOf = (h) => (h?.direction ? { name: h.direction.name, line: h.direction.line, standard: h.direction.standard, drops: h.direction.drops, covers: h.direction.covers.map((c) => ({ ...c, name: h.areas.find((a) => a.id === c.area)?.name || c.area })) } : null);

/** 방향을 정한다 — 이슈를 보기 전에. 결과는 run.heading에 담는다.
 *  fresh: 방향 높이의 노드 판단이 이미 있어도 다시 받는다. 없으면 영역이 같을 때 있는 것을 쓴다. */
export async function head({ project, run, call, emit = () => {}, fresh = false }) {
  project = { ...project, heading: null };   // 방향을 정하는 단계는 앞서 정한 방향을 받지 않는다
  const calls0 = run.calls || 0;
  // ⓪ 영역 — 사람이 적었으면 그대로, 없으면 브리프에서 뽑는다
  let areas = areasOf(project); let auto = false;
  if (!areas && !fresh && run.heading?.auto && run.heading.areas?.length) { areas = run.heading.areas; auto = true; }
  if (!areas) {
    emit('stage', { stage: 'courseScope' });
    areas = shapeAreas(await call({ role: 'sub', ...courseScopePrompt(project), task: { kind: 'courseScope', project } }));
    auto = true;
    if (!areas.length) areas = [{ id: 'S1', name: '과제 전체', note: '', objects: [] }];   // 나눌 것이 없는 과제
  }
  // 영역은 있는데 대상 낱말이 없으면 뽑는다 — 방향이 한 영역의 대상에 붙었는지를 낱말로 대조하려면 있어야 한다. 앞서 뽑은 것이 있으면 이어 쓴다
  if (areas.length > 1 && areas.some((a) => !a.objects?.length)) {
    const before = !fresh && run.heading?.areas?.length === areas.length && run.heading.areas.every((a, i) => a.name === areas[i].name && a.objects?.length) ? run.heading.areas : null;
    if (before) areas = areas.map((a, i) => ({ ...a, objects: a.objects?.length ? a.objects : before[i].objects }));
    else {
      emit('stage', { stage: 'courseScope' });
      const raw = await call({ role: 'sub', ...courseObjectsPrompt(project, areas), task: { kind: 'courseObjects', project, areas } });
      areas = ownWords(areas.map((a) => ({ ...a, objects: a.objects?.length ? a.objects : words(arr(raw?.areas).find((x) => areaId(x.id ?? x.area ?? x.name, areas) === a.id)?.objects) })));
    }
  }

  // ① ② 방향 높이의 노드 판단과 연결 — 영역이 그대로면 있는 것을 쓴다
  // 조각으로 받기 전의 판단(v6 이전)은 다시 받는다
  const reused = !fresh && run.course?.v === 6 && run.course.key === areasKey(areas) && run.course.signals?.length > 0;
  if (!reused) await survey({ project, run, call, emit, areas });
  else cohere(run.course, { count: project.settings?.proposalCount || 3, pins: project.pins || {}, weights: project.settings?.cohere || {} });   // 사람이 조각을 고정하거나 뺐으면 다시 수렴시킨다
  const high = run.course.signals;
  const need = courseNeed(project, run);
  const props = run.course.proposals;
  if (!props.length) throw new Error('수렴에서 해석의 연합이 나오지 않았다 — 노드가 해석 조각을 내지 않았다');

  emit('stage', { stage: 'courseBase' });
  const base = shapeBase(await call({ role: 'sub', ...courseBasePrompt(project, areas), task: { kind: 'courseBase', project, areas } }));

  emit('stage', { stage: 'course' });
  let best = null; let note = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await call({ role: 'director', ...coursePrompt(project, run, props, base, lensName, need, areas, high, note), task: { kind: 'course', project, run, props, need, areas, high, attempt } });
    const shaped = shapeRivals(raw, project, run, areas, props);
    if (!best || shaped.rivals.length > best.rivals.length || (shaped.rivals.length === best.rivals.length && shaped.problems.length < best.problems.length)) best = shaped;
    if (!shaped.problems.length) break;
    note = `앞서 쓴 후보는 조건을 채우지 못했다: ${shaped.problems.join(' / ')}. 글자 수 제한은 그대로다.`;
  }
  const rivals = best.rivals;
  if (!rivals.length) throw new Error('방향 후보를 쓰지 못했다');

  emit('stage', { stage: 'courseJudge' });
  const judge = shapeJudge(await call({ role: 'judge', ...courseJudgePrompt(project, rivals, base, areas, lensName), task: { kind: 'courseJudge', project, rivals, base, areas } }), rivals, areas);
  run.heading = { areas, auto, base, rivals, judge, reused, calls: (run.calls || 0) - calls0 };
  take(run, judge.winner);
  emit('heading');
  return run.heading;
}

/** 제안 가운데 하나를 기준안으로 삼는다 — 영역별 전략과 전술은 이 안 아래로 쓴다. 제안은 모두 남는다. AI를 부르지 않는다 */
export function take(run, id) {
  const h = run.heading; const { rivals, judge, base } = h;
  const won = rivals.find((r) => r.id === id) || rivals.find((r) => r.id === judge.winner) || rivals[0];
  h.direction = { id: won.id, name: won.name, line: won.line, standard: won.standard, covers: won.covers, how: won.how, swap: won.swap, lenses: won.lenses, proposal: won.proposal, from: won.from, to: won.to, keeps: won.keeps, drops: won.drops, answer: won.answer, signals: won.signals, facts: won.facts };
  h.picked = won.id !== judge.winner;   // 사람이 판정과 다른 안을 골랐다
  // 기준안에 대한 경고 — 사람이 봐야 하는 것이다. 숨기지 않는다
  const warn = [];
  const item = judge.items.find((x) => x.id === won.id);
  if (item && item.level !== '방향') warn.push(`판정이 이 안을 ${item.level}${item.level === '전술' ? '로' : '으로'} 봤다 — 영역 전부에 걸리지 않는다`);
  if (item?.own === '범용') warn.push('판정이 이 안을 범용 문장으로 봤다 — 다른 회사도 그대로 쓸 수 있다');
  if (item?.brief === '일부') warn.push('판정이 이 안을 브리프의 일부만 본 것으로 봤다 — 목적 · 성공 기준 전체에 닿지 않는다');
  if (item?.control === '일부 불가') warn.push('기준의 판정 대상에 우리가 통제할 수 없는 구간이 들어 있다');
  if (base && !h.picked && !judge.beatsBase) warn.push('판정이 기본 방향을 더 낫게 봤다');
  if (item?.vsBase === '같음') warn.push('기본 방향과 기준이 같다고 판정받았다');
  for (const f of won.flags.filter((x) => /^장치|^닿지 않는 영역|^아이덴티티|^한 영역의 대상|^빌린 대상/.test(x))) warn.push(f);
  if (run.course?.readers < 2) warn.push('조각 사이의 관계를 한 번만 매겼다 — 한 사람의 판단에 기댄 수렴이다');
  if (run.course?.net && !run.course.net.settled) warn.push('수렴이 끝까지 가라앉지 않았다');
  h.warn = warn;
  return h;
}

/** 방향 아래로 내려 쓴다 — 영역별 전략과 전술. 결과는 run.strategy(v5)에 담는다. */
export async function descend({ project, run, call, emit = () => {} }) {
  const h = run.heading; if (!h?.direction) return null;
  const { areas, direction, judge } = h;
  const high = run.course?.signals || [];
  const need = courseNeed(project, run);
  emit('stage', { stage: 'layers' });
  let st = null; let note = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await call({ role: 'director', ...layersPrompt(project, run, direction, judge, lensName, need, areas, high, note), task: { kind: 'layers', project, run, direction, areas, need, high, attempt } });
    const shaped = shapeLayers(raw, project, run, direction, areas, { areasAuto: h.auto, base: h.base, rivals: h.rivals, judge });
    shaped.attempts = attempt + 1;
    if (!st || shaped.check.problems.length < st.check.problems.length) st = shaped;
    if (shaped.check.ok) break;
    note = `앞서 쓴 것은 조건을 채우지 못했다: ${shaped.check.problems.join(' / ')}. 모자란 것을 채워 다시 쓴다. 글자 수 제한은 그대로다.`;
  }
  st.v = 6; st.reusedHigh = h.reused; st.picked = !!h.picked;
  if (run.course?.net) st.net = { ...run.course.net, atoms: high.length, edges: run.course.rel.edges.length, support: run.course.rel.edges.filter((e) => e.kind === 'support').length, contradict: run.course.rel.edges.filter((e) => e.kind === 'contradict').length, agree: run.course.rel.agree, proposals: run.course.proposals.length };
  const thin = st.pillars.filter((p) => p.thin);
  if (thin.length) st.thin = thin.map((p) => p.label);
  st.check = { ok: st.check.ok && !h.warn.length, problems: [...h.warn, ...st.check.problems] };
  run.strategy = st;
  emit('strategy');
  return st;
}

/** 이미 있는 분석 위에서 방향을 다시 정하고 내려 쓴다. 이슈 높이의 분석은 다시 돌리지 않는다. */
export async function chart({ project, run, call, emit = () => {}, fresh = false, adopt = '' }) {
  // 다른 제안을 기준안으로 — 방향은 그대로 두고 그 아래만 다시 쓴다
  if (adopt && run.heading?.rivals?.some((r) => r.id === adopt)) take(run, adopt);
  else await head({ project, run, call, emit, fresh });
  return descend({ project, run, call, emit });
}
