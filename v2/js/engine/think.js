// 사고 패스 — 1.x의 직렬 파이프라인을 대신한다.
//   ① 여행지 고르기   Airplane에서 발화할 사조를 고른다 (호출 1)
//   ② 발화            모든 기준 노드가 같은 원문(미션·이슈)을 받고 동시에 신호를 낸다 (노드당 호출 1)
//                     노드는 방법론 원문을 읽고 생각의 과정(현상→왜→본질, 사조는 원론·같은 구조·바꿔치기 시험)을 남긴다
//   ③ 연결            신호 사이의 인과·조건·강화·긴장을 엣지로 판단한다 (호출 1)
//   ④ 전파·수렴       에너지와 묶음을 계산한다 (AI 없음 · 결정적)
//   ⑤ 통합            묶음마다 통합 인사이트 하나 (묶음당 호출 1)
//   ⑥ 가드            인사이트가 여러 노드군의 신호를 실제로 지났는지 코드로 확인한다
//   ⑦ 통합 디렉션     인사이트를 기획·디자인·개발·서비스 관점의 할 일로 묶는다 (호출 1) — 중앙 통제
import { issuesPrompt, routePrompt, activatePrompt, linkPrompt, integratePrompt, directionPrompt, baselinePrompt, verdictPrompt, researchPrompt } from '../../knowledge/prompts.js';
import { SEED_PRECEDENTS } from '../../knowledge/viewpoint.js';
import { tierOf } from '../../knowledge/orchestration.js';
import { DIFFERENTIATION, EFFECTIVENESS, CHECKS, SUCCESS_CHECK, CHECK_RESULTS, VERDICTS4 } from '../../knowledge/criteria.js';
import { validFacts, acceptResearch } from '../../knowledge/facts.js';
import { LAYERS } from '../../knowledge/ism-depth.js';
import { reframePrompt } from '../../knowledge/prompts-arena.js';
import { arena, shapeProposal, shapeFrames } from './arena.js';
import { frames } from './frames.js';
import { PERSPECTIVES } from '../../knowledge/tags.js';
import { AIRPLANE, OPPOSITIONS, GATES, FAMILIES, IDENTITY } from '../../knowledge/nodes.js';
import { activeLenses, signalPrefix, hints, lensName, validateProject, needsDevelopment } from '../graph/model.js';
import { strategize } from './strategy.js';
import { propagate } from '../graph/propagate.js';

const STANCES = new Set(['keep', 'change', 'limit', 'open']);
const TYPES = new Set(['cause', 'condition', 'reinforce', 'tension']);
const SOURCES = ['팩트', '브리프', '일반 관찰', '추론', '확인 필요'];
const ASSUMED = 0.6;   // 팩트 없이 쓴 터널 판단의 비중
const STAGE_NAMES = { strategy: '전략 한 장', baseline: '기본안', reframe: '프레임', route: '사조 고르기', activate: '노드 판단', link: '연결', integrate: '통합', cross: '교배', screen: '선별', duel: '대결', distinct: '같은 해법 확인', stance: '기조', attack: '공격', revise: '보완', hold: '기조 확인', verdict: '판정', direct: '방향', plan: '기획' };
const LINK_AT_ONCE = 45;   // 한 번의 호출로 잇는 신호 수의 한도. 이보다 많으면 이슈별로 나눈다
const clamp = (v, d = 0.5) => (Number.isFinite(+v) ? Math.min(1, Math.max(0, +v)) : d);
const text = (v) => (typeof v === 'string' ? v.trim() : '');

async function pool(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  const run = async () => { while (next < items.length) { const i = next++; out[i] = await worker(items[i], i); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, run));
  return out;
}

/**
 * 훑은 결과로 사조를 고른다.
 *   걸리는 자리가 있는 것 중 압력이 뚜렷한 순으로 (필요한 수 − 1)개,
 *   그리고 걸리기는 했지만 압력이 가장 약한 것 1개를 일부러 넣는다 — 뻔하지 않은 안은 여기서 나올 수 있다.
 * 대립 쌍은 뒤에서 따로 맞춘다.
 */
export function selectByProbe(probes, need) {
  const hit = probes.filter((x) => x.hit).sort((a, b) => b.pressure - a.pressure || a.id.localeCompare(b.id));
  if (hit.length <= need) return hit.map((x) => ({ id: x.id, why: x.hit }));
  const main = hit.slice(0, Math.max(1, need - 1)).map((x) => ({ id: x.id, why: x.hit }));
  const wild = hit[hit.length - 1];
  return need > 1 ? [...main, { id: wild.id, why: `일부러 넣은 사조 — ${wild.hit}`, wild: true }] : main;
}

/** 브리프 → 근본 이슈 후보. 고르는 것은 사람이다. */
export async function proposeIssues(project, provider, { signal } = {}) {
  const p = issuesPrompt(project);
  const { json } = await provider.json({ role: 'director', tier: tierOf({ kind: 'issues' }), ...p, signal, task: { kind: 'issues', project } });
  const tidy = (list, root) => (Array.isArray(list) ? list : [])
    .map((i) => ({ title: text(i.title), detail: text(i.detail), test: text(i.test), root, ...(root ? { covers: text(i.covers), misses: text(i.misses) } : {}) }))
    .filter((i) => i.title);
  return [...tidy(json.roots, true), ...tidy(json.issues, false)];
}

function normalizeSignals(raw, lens, project, max, startAt, hinted) {
  const issues = new Map(project.issues.map((i) => [String(i.id).toLowerCase(), i.id]));
  const factIds = new Set((project.facts || []).map((f) => f.id));
  const perIssue = new Map();
  const out = [];
  let dropped = 0; let shallow = 0;
  for (const s of Array.isArray(raw?.signals) ? raw.signals : []) {
    const issue = issues.get(String(s.issue || '').toLowerCase());
    const claim = text(s.claim);
    const effect = text(s.effect);
    // 누구의 무엇이 달라지는지 쓰지 못한 신호는 버린다 (thinking.md 3.3)
    if (!issue || !claim || !effect) { dropped++; continue; }
    // 훑고 지나간 신호는 신호가 아니다 — 생각의 과정을 남기지 못하면 버린다
    const ladder = (Array.isArray(s.ladder) ? s.ladder : []).map(text).filter(Boolean).slice(0, 5);
    const ism = lens.family === 'airplane';
    const deep = ladder.length >= 3 && (ism ? text(s.origin) && text(s.parallel) && (text(s.reading) || text(s.swap)) : true);
    if (!deep) { shallow++; continue; }
    const n = perIssue.get(issue) || 0;
    if (n >= max) { dropped++; continue; }
    perIssue.set(issue, n + 1);
    const hint = hinted.has(`${issue}|${lens.id}`);
    // 팩트 — 팩트북에 있는 id만 받는다. 터널 판단이 팩트 없이 나오면 추정으로 표시하고 비중을 낮춘다.
    const facts = [...new Set((Array.isArray(s.facts) ? s.facts : []).map(text).filter((id) => factIds.has(id)))];
    const assumed = lens.family === 'tunnel' && !facts.length;
    const base = clamp(s.strength) * (assumed ? ASSUMED : 1) + (facts.length && lens.family !== 'tunnel' ? 0.05 : 0);
    out.push({
      id: `${signalPrefix(lens.id)}-${startAt + out.length + 1}`,
      lens: lens.id, family: lens.family, issue, ladder, claim, effect,
      basis: text(s.basis),
      ...(ism ? { origin: text(s.origin), parallel: text(s.parallel), strand: text(s.strand), paradox: text(s.paradox), reading: text(s.reading), layer: LAYERS.includes(text(s.layer)) ? text(s.layer) : '원리', degree: clamp(s.degree, 0.5), expression: text(s.expression), swap: text(s.swap), ...(text(s.treatment) ? { treatment: text(s.treatment) } : {}), ...(text(s.leave) ? { leave: text(s.leave) } : {}) } : { against: text(s.against) }),
      ...(facts.length ? { facts } : {}), ...(assumed ? { assumed: true } : {}), ...(text(s.need) ? { need: text(s.need) } : {}),
      stance: STANCES.has(s.stance) ? s.stance : 'change',
      strength: +Math.min(1, base + (hint ? 0.15 : 0)).toFixed(3),
      source: facts.length ? '팩트' : (SOURCES.includes(text(s.source)) && text(s.source) !== '팩트' ? text(s.source) : '추론'),
      hinted: hint || undefined,
    });
  }
  return { signals: out, dropped, shallow };
}

function normalizeEdges(raw, signals, keep = []) {
  const sig = new Map(signals.map((s) => [s.id, s]));
  const pair = (a, b) => [a, b].sort().join('|');
  const seen = new Map(keep.filter((e) => sig.has(e.from) && sig.has(e.to)).map((e) => [pair(e.from, e.to), e]));
  let rejected = 0;
  for (const e of Array.isArray(raw?.edges) ? raw.edges : []) {
    const a = sig.get(e.from); const b = sig.get(e.to);
    const why = text(e.why);
    // 이유 없는 연결 · 같은 노드 안의 연결은 받지 않는다
    if (!a || !b || a.id === b.id || a.lens === b.lens || !TYPES.has(e.type) || !why) { rejected++; continue; }
    const key = pair(a.id, b.id);
    const prev = seen.get(key);
    if (prev && (prev.by === 'human' || prev.weight >= clamp(e.weight))) continue;
    seen.set(key, { from: a.id, to: b.id, type: e.type, weight: clamp(e.weight), why, by: 'ai' });
  }
  const edges = [...seen.values()].map((e, i) => ({ ...e, id: e.id && e.by === 'human' ? e.id : `E${i + 1}` }));
  return { edges, rejected };
}

/** 가드 — 통합 인사이트가 묶음의 신호를 실제로 지났는지 확인한다. 문장이 아니라 ID로 센다. */
export function checkInsight(raw, cluster, signals, settings) {
  const sig = new Map(signals.map((s) => [s.id, s]));
  const members = new Set(cluster.members);
  const chainRaw = Array.isArray(raw?.chain) ? raw.chain : [];
  const chain = chainRaw.filter((c) => members.has(c.signal)).map((c) => ({ signal: c.signal, role: text(c.role) || '전제', says: text(c.says) }));
  const used = [...new Set(chain.map((c) => c.signal))];
  const byFamily = Object.fromEntries(Object.keys(FAMILIES).map((f) => [f, used.filter((id) => sig.get(id).family === f).length]));
  const families = Object.keys(byFamily).filter((f) => byFamily[f] > 0);
  const lenses = [...new Set(used.map((id) => sig.get(id).lens))];
  const problems = [];
  if (!text(raw?.insight)) problems.push('통합 인사이트 문장이 없다');
  if (used.length < 3) problems.push(`근거로 쓴 판단이 ${used.length}건뿐이다 (3건 이상)`);
  if (cluster.families.length < settings.minFamilies) problems.push(`이 묶음은 노드군 ${cluster.families.length}개에만 걸쳐 있다 (${settings.minFamilies}개 이상)`);
  const missing = cluster.families.filter((f) => !families.includes(f));
  if (missing.length) problems.push(`${missing.map((f) => FAMILIES[f].short).join(' · ')} 판단을 근거로 쓰지 않았다`);
  const needLenses = Math.min(settings.minLenses, cluster.lenses.length);
  if (lenses.length < needLenses) problems.push(`근거 노드가 ${lenses.length}개뿐이다 (${needLenses}개 이상)`);
  if (!text(raw?.substitute?.changes)) problems.push('근본 이슈에 적용했을 때 달라지는 점을 쓰지 않았다');
  const t = raw?.tension;
  const tension = t && members.has(t.a) && members.has(t.b) && text(t.resolve) ? { a: t.a, b: t.b, resolve: text(t.resolve) } : null;
  if (cluster.tensions > 0 && !tension) problems.push('판단 사이의 충돌을 어떻게 푸는지 쓰지 않았다');
  if (!text(raw?.without?.baseline) || !text(raw?.without?.difference)) problems.push('노드 없이 냈을 안과의 차이를 쓰지 않았다');
  return {
    ok: problems.length === 0, problems, chain, tension, used, byFamily, families, lenses,
    foreign: chainRaw.length - chain.length,
  };
}

function shapeInsight(raw, check, cluster, n) {
  return {
    id: `N${n}`, cluster: cluster.id,
    title: text(raw.title) || `통합 인사이트 ${n}`, insight: text(raw.insight),
    chain: check.chain, tension: check.tension,
    keep: text(raw.keep), change: text(raw.change), concept: text(raw.concept), visual: text(raw.visual),
    substitute: { who: text(raw.substitute?.who), changes: text(raw.substitute?.changes) },
    verdict: text(raw.verdict), gate: text(raw.gate) || '통과',
    without: { nearest: text(raw.without?.nearest), baseline: text(raw.without?.baseline), difference: text(raw.without?.difference) },
    open: (Array.isArray(raw.open) ? raw.open : []).map(text).filter(Boolean),
    check: { ok: check.ok, problems: check.problems, used: check.used, byFamily: check.byFamily, families: check.families, lenses: check.lenses, foreign: check.foreign },
  };
}

/**
 * 더프롬 판정 정리 — 점수가 없다. 확인 항목(통과 · 미달 · 확인 필요), 차별화와 실효성의 판정문과 수준, 보류한 것, 판정.
 * 인사이트의 순서는 바꾸지 않는다(경쟁에서 정해진 순서다).
 */
export function shapeVerdict(raw, insights, project = null) {
  const noSuccess = project && !text(project.brief?.success);
  const ids = new Set(insights.map((i) => i.id));
  const answers = (c, v) => Object.fromEntries(c.questions.map((q) => [q.id, text(v?.[q.id])]));
  const items = [];
  for (const v of Array.isArray(raw?.verdicts) ? raw.verdicts : []) {
    const id = text(v.insight);
    if (!ids.has(id) || items.some((x) => x.insight === id)) continue;
    const dl = text(v.differentiation?.level); const el = text(v.effectiveness?.level);
    const differentiation = { level: DIFFERENTIATION.levels.includes(dl) ? dl : '', ...answers(DIFFERENTIATION, v.differentiation) };
    const effectiveness = { level: EFFECTIVENESS.levels.includes(el) ? el : '', confidence: EFFECTIVENESS.confidence.includes(text(v.effectiveness?.confidence)) ? text(v.effectiveness.confidence) : '추정', ...answers(EFFECTIVENESS, v.effectiveness) };
    const held = (Array.isArray(v.held) ? v.held : []).map(text).filter(Boolean);
    // 답하지 못한 물음은 보류로 센다 — 빈칸을 수준으로 덮지 않는다
    const blank = [...DIFFERENTIATION.questions.filter((q) => !differentiation[q.id]).map((q) => `차별화 · ${q.id}`), ...EFFECTIVENESS.questions.filter((q) => !effectiveness[q.id] && !(q.id === 'success' && noSuccess)).map((q) => `실효성 · ${q.id}`)];
    const checks = (Array.isArray(v.checks) ? v.checks : []).map((c) => ({ item: text(c.item), result: CHECK_RESULTS.includes(text(c.result)) ? text(c.result) : '확인 필요', why: text(c.why) })).filter((c) => CHECKS.includes(c.item));
    let verdict = VERDICTS4.includes(text(v.verdict)) ? text(v.verdict) : '보류';
    // 성공 기준에 닿지 못한 안은 실효성이 "목적 미달"을 넘지 못하고 채택하지 않는다 — 판정문이 달리 써도 코드가 지킨다
    let capped = false;
    if (checks.some((c) => c.item === SUCCESS_CHECK && c.result === '미달')) {
      if (effectiveness.level && effectiveness.level !== EFFECTIVENESS.levels[0]) { effectiveness.level = EFFECTIVENESS.levels[0]; capped = true; }
      if (verdict === '채택') { verdict = '보완'; capped = true; }
    }
    items.push({ insight: id, checks, differentiation, effectiveness, held, blank, capped, verdict, safe: text(v.safe), push: text(v.push), precedent: text(v.precedent) });
  }
  return { items, missing: insights.filter((i) => !items.some((x) => x.insight === i.id)).map((i) => i.id) };
}

/**
 * 팩트북 조사 — 웹 검색이 되는 공급자(provider.research)만 쓴다.
 * 돌려받은 항목은 코드가 다시 거른다: 받는 출처 네 가지 · 원문 주소 · 날짜가 없으면 넣지 않는다.
 */
export async function researchFacts(project, provider, { signal, perKind = 3 } = {}) {
  if (typeof provider.research !== 'function') throw new Error('이 모델은 웹 조사를 지원하지 않습니다. 웹 검색이 되는 모델로 바꾸거나 팩트북 md를 불러오세요.');
  const p = researchPrompt(project, perKind);
  const r = await provider.research({ ...p, signal, task: { kind: 'research', project } });
  return acceptResearch(r.json, project);
}

/** 디렉션 가드 — 관점마다 방향·할 일·근거 인사이트가 있어야 한다 */
export function checkDirection(raw, insights, needDev, baseline = null) {
  const ids = new Set(insights.map((i) => i.id));
  const list = (v) => (Array.isArray(v) ? v : []).map(text).filter(Boolean);
  const problems = [];
  const perspectives = {};
  for (const v of PERSPECTIVES) {
    const r = raw?.perspectives?.[v.id];
    if (!r) {
      if (v.id === 'development' && !needDev && text(raw?.development_reason)) continue;
      problems.push(v.id === 'development' && !needDev ? '개발 관점을 뺐는데 이유가 없다' : `${v.name} 관점이 없다`);
      continue;
    }
    const from = list(r.from).filter((id) => ids.has(id));
    const actions = list(r.actions);
    if (!text(r.direction)) problems.push(`${v.name} 관점의 방향이 없다`);
    if (!actions.length) problems.push(`${v.name} 관점에 바로 할 일이 없다`);
    if (!from.length) problems.push(`${v.name} 관점이 어느 통합 인사이트에서 왔는지 없다`);
    perspectives[v.id] = { direction: text(r.direction), actions, from, need: list(r.need) };
  }
  if (!text(raw?.headline)) problems.push('총괄 디렉션 한 문장이 없다');
  const owners = new Set(Object.keys(perspectives));
  const priority = (Array.isArray(raw?.priority) ? raw.priority : []).map((p) => ({ what: text(p.what), owner: text(p.owner), from: ids.has(p.from) ? p.from : '' })).filter((p) => p.what && owners.has(p.owner));
  if (priority.length < 2) problems.push('먼저 할 일의 순서가 없다');
  // 기본안 대조 — 통합을 쓴 호출이 아니라 디렉션 호출이 따로 판정한다
  const VERDICTS = ['같음', '일부', '다름'];
  const bids = new Set((baseline?.concepts || []).map((c) => c.id));
  const overlap = (Array.isArray(raw?.overlap) ? raw.overlap : []).map((o) => ({ insight: text(o.insight), baseline: bids.has(text(o.baseline)) ? text(o.baseline) : '', verdict: VERDICTS.includes(text(o.verdict)) ? text(o.verdict) : '', why: text(o.why) })).filter((o) => ids.has(o.insight) && o.verdict);
  if (bids.size && insights.some((i) => !overlap.some((o) => o.insight === i.id))) problems.push('기본안과 같은지 판정하지 않은 통합 인사이트가 있다');
  const used = new Set(Object.values(perspectives).flatMap((p) => p.from));
  return {
    ok: problems.length === 0, problems,
    direction: {
      headline: text(raw?.headline), perspectives, developmentReason: perspectives.development ? '' : text(raw?.development_reason),
      conflicts: (Array.isArray(raw?.conflicts) ? raw.conflicts : []).map((c) => ({ between: list(c.between).filter((b) => owners.has(b)), what: text(c.what), resolve: text(c.resolve) })).filter((c) => c.between.length === 2 && c.what),
      priority,
      unusedInsights: insights.filter((i) => !used.has(i.id)).map((i) => i.id),
      overlap,   // 통합 인사이트가 기본안과 같은 해법인지 — 같음 · 일부 · 다름   // 어느 관점에도 쓰이지 않은 인사이트
    },
  };
}

/** 유실을 숫자로 — 낸 신호 중 몇 건이 인사이트까지 갔는가 */
export function usage(run) {
  const live = run.signals.filter((s) => !s.muted);
  const tunnel = live.filter((s) => s.family === 'tunnel');
  const used = new Set((run.insights || []).flatMap((i) => i.check.used));
  const byFamily = {};
  for (const f of Object.keys(FAMILIES)) {
    const mine = live.filter((s) => s.family === f);
    byFamily[f] = { signals: mine.length, used: mine.filter((s) => used.has(s.id)).length };
  }
  const factsUsed = [...new Set(live.flatMap((s) => s.facts || []))];
  return {
    signals: live.length, used: live.filter((s) => used.has(s.id)).length, unused: live.filter((s) => !used.has(s.id)).map((s) => s.id), byFamily,
    // 팩트 — 판단 몇 건이 실제 자료에 기댔는가, 터널 판단 중 추정은 몇 건인가
    backed: live.filter((s) => s.facts?.length).length, factsUsed,
    tunnel: { signals: tunnel.length, backed: tunnel.filter((s) => s.facts?.length).length, assumed: tunnel.filter((s) => s.assumed).length },
  };
}

/**
 * @param {object} project
 * @param {object} provider  { name, json({role, system, user, signal, task}) → {json, usage?} }
 * @param {object} o
 * @param {'full'|'add'|'relink'} o.mode  full 처음부터 · add 새 이슈만 발화 · relink 신호·엣지는 두고 전파·통합만
 */
export async function think(project, provider, { onEvent = () => {}, signal, mode = 'full', precedents = SEED_PRECEDENTS } = {}) {
  if (!project.issues.some((i) => text(i.title))) throw new Error('이슈가 없습니다. 근본 이슈를 하나 이상 넣어 주세요.');
  // 세팅 점검 — 틀을 채운 이슈만 발화에 들어간다. 태그가 비면 규칙 기반 추천을 붙인다.
  const setup = validateProject(project);
  if (setup.blocking) throw new Error(`세팅이 끝나지 않았습니다: ${setup.problems.filter((x) => x.where.startsWith('이슈')).map((x) => `${x.where} — ${x.what}`).join(' / ')}`);
  const whole = project;
  const fb = validFacts(project);
  // 모든 호출이 더프롬의 관점(가중치 · 판정 사례)과 팩트북을 받는다
  project = { ...project, issues: setup.ready, facts: fb.facts, view: { precedents } };
  const s = project.settings;
  const started = Date.now();
  const prev = mode === 'full' ? null : project.run;
  if (mode !== 'full' && !prev) throw new Error('이어서 할 사고 기록이 없습니다.');
  const run = {
    at: new Date().toISOString(), provider: provider.name, mode,
    picks: prev?.picks || [], signals: prev ? prev.signals.map((x) => ({ ...x })) : [],
    edges: prev ? prev.edges.map((x) => ({ ...x })) : [], energy: {}, clusters: [], insights: [],
    probes: prev?.probes || [],
    baseline: prev?.baseline || null, frames: prev?.frames || [], proposals: prev ? (prev.proposals || []).map((x) => ({ ...x })) : [],
    facts: { total: fb.facts.length, rejected: fb.rejected, unchecked: fb.facts.filter((f) => f.by === 'ai' && !f.checked).length },
    failed: [], notes: setup.problems.map((x) => `세팅: ${x.where} — ${x.what}`), calls: 0, tokens: { in: 0, out: 0 },
    setup: { ok: setup.ok, issues: setup.ready.map((i) => ({ id: i.id, tags: i.tags, auto: i.autoTags })), skipped: whole.issues.filter((i) => !setup.ready.some((r) => r.id === i.id)).map((i) => i.id) },
  };
  if (fb.rejected) run.notes.push(`팩트북: 출처 조건을 채우지 못한 ${fb.rejected}건을 제외했다`);
  if (!fb.facts.length) run.notes.push('팩트북이 비어 있다 — 터널 판단은 모두 추정으로 표시된다');
  const useArena = s.arena !== false;
  const emit = (type, extra = {}) => onEvent({ type, run, ...extra });
  const call = async (args) => {
    if (signal?.aborted) throw new Error('취소됨');
    let r; try { r = await provider.json({ ...args, tier: tierOf(args.task), signal }); }
    catch (e) { if (!signal?.aborted && !/^\[/.test(e.message)) e.message = `[${STAGE_NAMES[args.task?.kind] || args.task?.kind || '호출'}] ${e.message}`; throw e; }   // 어느 단계에서 났는지 붙인다
    run.calls++;
    if (r.usage) { run.tokens.in += r.usage.in || 0; run.tokens.out += r.usage.out || 0; }
    return r.json;
  };

  // ⓪ 기본안 — 기준 노드 없이 브리프만 읽고 낸 안. 통합 인사이트와 대조하는 기준이다.
  if (mode === 'full') {
    emit('stage', { stage: 'baseline' });
    const p = baselinePrompt(project);
    const json = await call({ role: 'sub', ...p, task: { kind: 'baseline', project } });
    const concepts = (Array.isArray(json?.concepts) ? json.concepts : []).map((c, i) => ({ id: `B${i + 1}`, title: text(c.title), concept: text(c.concept), visual: text(c.visual) })).filter((c) => c.concept).slice(0, 3);
    run.baseline = concepts.length ? { concepts, common: text(json.common) } : null;
    if (!run.baseline) run.notes.push('기본안을 받지 못해 대조 없이 진행했다');
    emit('baseline');
    // 문제 다시 정의 — 브리프가 묻는 대로만 답하면 기본안이 나온다
    if (useArena && run.baseline) {
      emit('stage', { stage: 'reframe' });
      // 근본 이슈가 목적 전체와 성공 기준을 덮는지 함께 확인한다. 성공 기준을 겨눈 정의가 없으면 한 번 다시 받는다.
      const hasSuccess = !!text(project.brief?.success);
      let rnote = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        const rp = reframePrompt(project, run.baseline, 3, rnote);
        const rraw = await call({ role: 'brain', ...rp, task: { kind: 'reframe', project, baseline: run.baseline, attempt } });
        run.frames = shapeFrames(rraw, project.facts);
        run.scope = { gap: text(rraw?.gap), success: run.frames.some((f) => f.success), needed: hasSuccess };
        if (!hasSuccess || run.scope.success) break;
        rnote = '앞서 낸 문제 정의에는 성공 기준이 재는 행동을 직접 겨눈 것이 없었다. 적어도 하나는 성공 기준을 직접 겨누고 success를 true로 둔다.';
      }
      if (run.scope.gap) run.notes.push(`근본 이슈가 덮지 못하는 것: ${run.scope.gap}`);
      if (hasSuccess && !run.scope.success) run.notes.push('성공 기준을 직접 겨눈 문제 정의를 받지 못했다');
    }
  }

  if (mode !== 'relink') {
    // ① 여행지 고르기 — 사람이 고정했거나 [[지목]]한 사조는 그대로 넣는다
    if (mode === 'full') {
      emit('stage', { stage: 'route' });
      const fixed = new Set([...(s.pinned || []), ...hints(project).map((h) => h.lens).filter((id) => id.startsWith('ISM-'))]);
      const need = Math.max(0, s.ismCount - fixed.size);
      let picks = [...fixed].map((id) => ({ id, why: '사람이 지목한 사조' }));
      if (need > 0) {
        const pool0 = AIRPLANE.filter((a) => !fixed.has(a.id) && !(s.muted || []).includes(a.id));
        const p = routePrompt(project, pool0, OPPOSITIONS, need);
        const json = await call({ role: 'judge', ...p, task: { kind: 'route', project, isms: pool0, count: need } });
        const valid = new Set(pool0.map((a) => a.id));
        // 훑은 결과로 고른다 — 사람이 고르지 않는다. (예전 형식의 picks도 받는다)
        run.probes = (Array.isArray(json.probes) ? json.probes : []).filter((x) => valid.has(x.id)).map((x) => ({ id: x.id, hit: text(x.hit), pressure: clamp(x.pressure, 0) }));
        const got = run.probes.length ? selectByProbe(run.probes, need) : (Array.isArray(json.picks) ? json.picks : []).filter((x) => valid.has(x.id)).slice(0, need).map((x) => ({ id: x.id, why: text(x.why) }));
        picks = [...picks, ...got.filter((g) => !picks.some((q) => q.id === g.id))];
      }
      // 같은 편 사조만 고르지 않는다 — 대립 쌍이 없으면 반대편 하나를 더한다 (catalog A-99)
      const ids = new Set(picks.map((x) => x.id));
      if (ids.size && !OPPOSITIONS.some((o) => ids.has(o.a) && ids.has(o.b))) {
        const o = OPPOSITIONS.find((x) => ids.has(x.a) !== ids.has(x.b));
        if (o) picks.push({ id: ids.has(o.a) ? o.b : o.a, why: `반대 답을 내는 사조 — ${o.issue}` });
      }
      run.picks = picks;
      emit('picked');
    }

    // ② 발화 — 모든 노드가 같은 원문을 받는다. 앞 노드의 요약을 받지 않는다.
    emit('stage', { stage: 'activate' });
    const lenses = activeLenses(project, run.picks);
    const pendingIssues = mode === 'add' ? project.issues.filter((i) => !run.signals.some((x) => x.issue === i.id)) : project.issues;
    if (mode === 'add' && !pendingIssues.length) throw new Error('새로 더한 이슈가 없습니다.');
    const scoped = { ...project, issues: pendingIssues, ...(useArena ? { frames: run.frames, baseline: run.baseline } : {}) };
    const hinted = new Set(hints(project).map((h) => `${h.issue}|${h.lens}`));
    await pool(lenses, s.concurrency, async (lens) => {
      try {
        emit('firing', { lens: lens.id });
        const p = activatePrompt(scoped, lens, s.signalsPerLens);
        const json = await call({ role: 'sub', ...p, task: { kind: 'activate', project: scoped, lens, max: s.signalsPerLens } });
        const startAt = run.signals.filter((x) => x.lens === lens.id).length;
        const { signals, dropped, shallow } = normalizeSignals(json, lens, scoped, s.signalsPerLens, startAt, hinted);
        if (dropped) run.notes.push(`${lens.name}: 달라지는 점을 쓰지 못했거나 개수를 넘긴 판단 ${dropped}건을 제외했다`);
        if (shallow) run.notes.push(`${lens.name}: 근거 단계 없이 쓴 판단 ${shallow}건을 제외했다`);
        run.signals.push(...signals);
        const proposal = useArena ? shapeProposal(json, lens, run.frames) : null;   // 이 노드가 자기 기준을 끝까지 민 완성안
        if (proposal && run.signals.some((x) => x.lens === lens.id)) run.proposals = [...run.proposals.filter((x) => x.lens !== lens.id), proposal];
        emit('fire', { lens: lens.id, signals });
      } catch (e) {
        if (signal?.aborted) throw e;
        run.failed.push({ lens: lens.id, error: e.message });
        emit('fail', { lens: lens.id, error: e.message });
      }
    });
    if (run.failed.length > lenses.length / 2) throw new Error(`노드 ${lenses.length}개 중 ${run.failed.length}개가 응답하지 못했습니다: ${run.failed[0].error}`);
    if (run.signals.length < 3) throw new Error('판단이 3건보다 적어 연결할 수 없습니다.');

    // ③ 연결 — 관계를 문장이 아니라 엣지로 남긴다. 사람이 고친 엣지는 지킨다.
    emit('stage', { stage: 'link' });
    // 신호가 많으면 한 번에 잇지 않는다. 엣지가 신호 수의 1~2배라 답이 길이 제한을 넘는다.
    // 이슈마다 그 안의 연결을 따로 잇고, 이슈 사이의 연결은 한 번 더 본다
    const issueIds = [...new Set(run.signals.map((x) => x.issue))];
    let json;
    if (run.signals.length > LINK_AT_ONCE && issueIds.length > 1) {
      const jobs = [...issueIds.map((id) => ({ scope: { within: id }, signals: run.signals.filter((x) => x.issue === id) })).filter((jb) => jb.signals.length > 1),
        { scope: { across: Math.max(12, issueIds.length * 8) }, signals: run.signals }];
      const parts = await pool(jobs, s.concurrency, async (jb) => call({ role: 'brain', ...linkPrompt(project, jb.signals, lensName, jb.scope), task: { kind: 'link', project, signals: jb.signals, scope: jb.scope } }));
      const seen = new Set(); const issueOf = new Map(run.signals.map((x) => [x.id, x.issue]));
      json = { edges: parts.flatMap((part, i) => (Array.isArray(part?.edges) ? part.edges : []).filter((e) => {
        const same = issueOf.get(e.from) === issueOf.get(e.to); if (jobs[i].scope.across ? same : !same) return false;   // 맡은 범위 밖의 엣지는 받지 않는다
        const key = [e.from, e.to].sort().join('|'); if (seen.has(key)) return false; seen.add(key); return true; })) };
      run.notes.push(`판단이 ${run.signals.length}건이라 연결을 ${jobs.length}번에 나눠 봤다(이슈별 ${jobs.length - 1}번, 이슈 사이 1번)`);
    } else {
      const p = linkPrompt(project, run.signals, lensName);
      json = await call({ role: 'brain', ...p, task: { kind: 'link', project, signals: run.signals } });
    }
    const { edges, rejected } = normalizeEdges(json, run.signals, run.edges.filter((e) => e.by === 'human'));
    if (rejected) run.notes.push(`이유가 없거나 같은 노드 안의 연결 ${rejected}건을 제외했다`);
    run.edges = edges;
    emit('linked');
  }

  // ④ 전파·수렴 — 결정적 계산
  emit('stage', { stage: 'propagate' });
  const result = propagate(run.signals, run.edges, { count: s.insightCount, identityWeight: s.identityWeight ?? 1.5 });
  run.energy = Object.fromEntries([...result.energy].map(([k, v]) => [k, +v.toFixed(3)]));
  run.clusters = result.clusters;
  run.link = result.stats;
  emit('clustered');
  if (!run.clusters.length) throw new Error('묶을 수 있는 판단이 없습니다. 판단 사이의 연결이 너무 적습니다.');

  // ⑤ 통합 + ⑥ 가드 — 통과하지 못하면 이유를 붙여 한 번 다시 쓴다. 그래도 안 되면 표시해서 남긴다.
  emit('stage', { stage: 'integrate' });
  const sigMap = new Map(run.signals.map((x) => [x.id, x]));
  await pool(run.clusters, s.concurrency, async (c, i) => {
    const cluster = { ...c, signals: c.members.map((id) => sigMap.get(id)), edges: run.edges.filter((e) => c.edges.includes(e.id)) };
    let raw; let check; let note = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const p = integratePrompt(project, cluster, lensName, GATES, note, run.baseline);
      raw = await call({ role: 'director', ...p, task: { kind: 'integrate', project, cluster, attempt } });
      check = checkInsight(raw, c, run.signals, s);
      if (check.ok) break;
      note = `앞서 쓴 안은 다음 이유로 받지 않았다: ${check.problems.join(' / ')}`;
    }
    const insight = shapeInsight(raw, check, c, i + 1);
    run.insights = [...run.insights, insight].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    emit('insight', { insight });
    return insight;
  });
  run.usage = usage(run);

  // 경쟁 — 묶음 통합안도 후보 중 하나다. 노드의 완성안 · 교배안과 겨뤄 이긴 안이 통합 인사이트가 된다.
  if (useArena && run.proposals.length + run.insights.length >= 2) {
    await arena({ project, run, call, emit, pool });
    run.usage = usage(run);
    emit('clustered');
  }
  for (const ins of run.insights) ins.facts = [...new Set(ins.check.used.flatMap((id) => sigMap.get(id)?.facts || []))];

  // 더프롬 판정 — 통합 인사이트를 더프롬의 기준(가중치 · 판정 사례)으로 채점한다. 합계는 코드가 계산한다.
  emit('stage', { stage: 'verdict' });
  {
    const p = verdictPrompt(project, run.insights, IDENTITY, run.baseline);
    const raw = await call({ role: 'judge', ...p, task: { kind: 'verdict', project, insights: run.insights } });
    run.verdict = shapeVerdict(raw, run.insights, project);
    for (const ins of run.insights) ins.from = run.verdict.items.find((v) => v.insight === ins.id) || null;
    if (run.verdict.missing.length) run.notes.push(`더프롬 판정을 받지 못한 인사이트: ${run.verdict.missing.join(', ')}`);
    emit('verdict');
  }

  // ⑦ 통합 디렉션 — 관점별 할 일. 가드에 걸리면 이유를 붙여 한 번 다시 쓴다. 기각된 인사이트는 넣지 않는다.
  emit('stage', { stage: 'direct' });
  const good = run.insights.filter((i) => i.check.ok && i.from?.verdict !== '기각');
  const basis = good.length ? good : run.insights;
  const needDev = needsDevelopment(project);
  let dcheck; let dnote = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const p = directionPrompt(project, basis, needDev, dnote, run.baseline);
    const raw = await call({ role: 'director', ...p, task: { kind: 'direct', project, insights: basis, needDev, attempt } });
    dcheck = checkDirection(raw, basis, needDev, run.baseline);
    if (dcheck.ok) break;
    dnote = `앞서 쓴 디렉션은 다음 이유로 받지 않았다: ${dcheck.problems.join(' / ')}`;
  }
  run.direction = { ...dcheck.direction, check: { ok: dcheck.ok, problems: dcheck.problems }, needDev };
  emit('directed');

  // 전략 한 장 — 좁혀진 인사이트 위에, 전체 판단과 팩트로 과제를 관통하는 전략을 올린다. 실패해도 앞의 결과는 남긴다.
  if (s.strategy !== false) { try { await strategize({ project, run, call, emit }); } catch (e) { if (signal?.aborted) throw e; run.notes.push(`전략 한 장을 만들지 못했다 — ${e.message}`); } }

  // 프레임 — 이긴 안을 기획 틀과 디자인 틀로 정리한다. 틀은 안을 만드는 단계가 아니라 정리하고 검증하는 단계다.
  if (s.frames !== false) await frames({ project, run, call, emit });
  run.ms = Date.now() - started;
  emit('stage', { stage: 'done' });
  return run;
}

/** 이미 있는 분석 결과 위에 전략 한 장만 만든다 — 호출 1~2회. 앞 단계는 다시 돌리지 않는다. */
export async function strategizeOnly(project, provider, { signal } = {}) {
  const run = project.run;
  if (!run?.insights?.length) throw new Error('먼저 분석을 해야 한다');
  const call = async (args) => {
    if (signal?.aborted) throw new Error('취소됨');
    const r = await provider.json({ ...args, tier: tierOf(args.task), signal });
    run.calls = (run.calls || 0) + 1;
    if (r.usage) { run.tokens = run.tokens || { in: 0, out: 0 }; run.tokens.in += r.usage.in || 0; run.tokens.out += r.usage.out || 0; }
    return r.json;
  };
  return strategize({ project, run, call });
}
